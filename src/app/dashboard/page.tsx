'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { getPusherClient } from '@/lib/pusher-client';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  Plus, ChevronDown, ChevronUp, ExternalLink,
  CheckCircle2, XCircle, Loader2, FlaskConical,
  Clock, IndianRupee, Layers, CircleDot
} from 'lucide-react';

interface Session {
  id: number;
  title: string;
  amount: string;
  date: string;
  status: string;
  public_token: string;
}

interface Transaction {
  id: number;
  payer_name: string;
  amount: string;
  utr: string;
  payment_time: string;
  verified: boolean;
  rejected: boolean;
}

interface TestPaymentModal {
  sessionId: number;
  sessionTitle: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSession, setNewSession] = useState({ title: '', amount: '' });
  const [creating, setCreating] = useState(false);

  const [testModal, setTestModal] = useState<TestPaymentModal | null>(null);
  const [testForm, setTestForm] = useState({ payer_name: '', amount: '' });
  const [testLoading, setTestLoading] = useState(false);

  // Transactions panel per session
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Record<number, Transaction[]>>({});
  const [txLoading, setTxLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    fetchSessions();
  }, [router]);

  // Live Pusher updates when a session panel is open
  useEffect(() => {
    if (!openSessionId) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`session-${openSessionId}`);

    channel.bind('new-payment', (data: { transaction: Transaction }) => {
      setTransactions(prev => ({
        ...prev,
        [openSessionId]: [data.transaction, ...(prev[openSessionId] || [])]
      }));
      toast.success(`New payment from ${data.transaction.payer_name}!`);
    });
    channel.bind('payment-verified', (data: { transactionId: number }) => {
      setTransactions(prev => ({
        ...prev,
        [openSessionId]: (prev[openSessionId] || []).map(t =>
          t.id === data.transactionId ? { ...t, verified: true } : t
        )
      }));
    });
    channel.bind('payment-rejected', (data: { transactionId: number }) => {
      setTransactions(prev => ({
        ...prev,
        [openSessionId]: (prev[openSessionId] || []).map(t =>
          t.id === data.transactionId ? { ...t, rejected: true } : t
        )
      }));
    });

    return () => {
      pusher.unsubscribe(`session-${openSessionId}`);
    };
  }, [openSessionId]);

  const fetchSessions = async () => {
    try {
      const res = await api.get('/sessions/my');
      setSessions(res.data);
    } catch {
      toast.error('Failed to fetch sessions');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (sessionId: number) => {
    setTxLoading(true);
    try {
      const res = await api.get(`/transactions/${sessionId}`);
      setTransactions(prev => ({ ...prev, [sessionId]: res.data.transactions }));
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setTxLoading(false);
    }
  };

  const toggleSession = (sessionId: number) => {
    if (openSessionId === sessionId) {
      setOpenSessionId(null);
    } else {
      setOpenSessionId(sessionId);
      if (!transactions[sessionId]) fetchTransactions(sessionId);
    }
  };

  const handleVerify = async (txId: number, sessionId: number) => {
    setActionLoading(txId);
    try {
      await api.patch(`/transactions/verify/${txId}`);
      setTransactions(prev => ({
        ...prev,
        [sessionId]: (prev[sessionId] || []).map(t =>
          t.id === txId ? { ...t, verified: true } : t
        )
      }));
      toast.success('Payment verified successfully!');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to verify');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (txId: number, sessionId: number, payerName: string) => {
    if (!confirm(`Reject payment from "${payerName}"? It will be marked as rejected.`)) return;
    setActionLoading(txId);
    try {
      await api.patch(`/transactions/reject/${txId}`);
      setTransactions(prev => ({
        ...prev,
        [sessionId]: (prev[sessionId] || []).map(t =>
          t.id === txId ? { ...t, rejected: true } : t
        )
      }));
      toast.success('Transaction rejected.');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post('/sessions/create', newSession);
      toast.success('Session created');
      setNewSession({ title: '', amount: '' });
      // Optimistic update: prepend new session directly instead of re-fetching
      setSessions(prev => [res.data, ...prev]);
    } catch {
      toast.error('Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseSession = async (id: number) => {
    if (!confirm('Close this session? Students will no longer be able to submit payments.')) return;
    setClosingId(id);
    try {
      await api.patch(`/sessions/${id}/close`);
      toast.success('Session closed! Report sent to your email.');
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'closed' } : s));
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to close session');
    } finally {
      setClosingId(null);
    }
  };

  const handleTestPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testModal) return;
    setTestLoading(true);
    try {
      await api.post(`/transactions/${testModal.sessionId}`, testForm);
      toast.success(`Test payment of ₹${testForm.amount} added!`);
      if (openSessionId === testModal.sessionId) fetchTransactions(testModal.sessionId);
      setTestModal(null);
      setTestForm({ payer_name: '', amount: '' });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to add test payment');
    } finally {
      setTestLoading(false);
    }
  };

  const pendingCount = (sessionId: number) =>
    (transactions[sessionId] || []).filter(t => !t.verified && !t.rejected).length;

  const activeSessions = sessions.filter(s => s.status === 'active');
  const closedSessions = sessions.filter(s => s.status === 'closed');

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} />
        Loading dashboard...
      </div>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your collection sessions and track payments in real time</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Sessions', value: sessions.length, icon: Layers, color: 'text-violet-600', bg: 'bg-violet-50' },
          { label: 'Active', value: activeSessions.length, icon: CircleDot, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Closed', value: closedSessions.length, icon: Clock, color: 'text-muted-foreground', bg: 'bg-muted' },
          { label: 'Pending Review', value: activeSessions.flatMap(s => transactions[s.id] || []).filter(t => !t.verified && !t.rejected).length, icon: IndianRupee, color: 'text-amber-600', bg: 'bg-amber-50' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label} className="border-border shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={18} className={color} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold text-foreground">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create Session */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus size={16} className="text-primary" />
            Create New Session
          </CardTitle>
          <CardDescription>Start a new collection round with a fixed amount</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateSession} className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label htmlFor="session-title">Session Title</Label>
              <Input
                id="session-title"
                required
                placeholder="e.g., Late Fine - Feb 27"
                value={newSession.title}
                onChange={(e) => setNewSession({ ...newSession, title: e.target.value })}
              />
            </div>
            <div className="w-36 space-y-1.5">
              <Label htmlFor="session-amount">Amount (₹)</Label>
              <Input
                id="session-amount"
                type="number"
                required
                min="1"
                placeholder="50"
                value={newSession.amount}
                onChange={(e) => setNewSession({ ...newSession, amount: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={creating} className="bg-primary hover:opacity-90 text-primary-foreground gap-1.5">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Sessions List */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your Sessions</CardTitle>
          <CardDescription>{sessions.length} session{sessions.length !== 1 ? 's' : ''} total</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Layers size={40} className="mb-3 opacity-30" />
              <p className="text-sm">No sessions yet. Create one above!</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sessions.map((session) => {
                const isOpen = openSessionId === session.id;
                const pending = pendingCount(session.id);
                const sessionTxs = transactions[session.id] || [];
                const isActive = session.status === 'active';

                return (
                  <div key={session.id}>
                    {/* Session Row */}
                    <div className="px-6 py-4 flex items-center justify-between flex-wrap gap-3 hover:bg-accent/40 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground truncate">{session.title}</span>
                            <Badge variant={isActive ? 'default' : 'secondary'}
                              className={isActive ? 'bg-green-100 text-green-800 hover:bg-green-100 border-0 text-xs' : 'text-xs'}>
                              {session.status}
                            </Badge>
                            {isOpen && pending > 0 && (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0 text-xs animate-pulse">
                                {pending} pending
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            ₹{session.amount} · {new Date(session.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="ghost" size="sm" onClick={() => toggleSession(session.id)}
                          className="text-primary hover:text-primary hover:bg-accent gap-1 text-xs h-8">
                          {isOpen ? <><ChevronUp size={13} />Hide</> : <><ChevronDown size={13} />Transactions</>}
                        </Button>
                        <Button variant="ghost" size="sm" asChild
                          className="text-muted-foreground hover:text-foreground gap-1 text-xs h-8">
                          <Link href={`/session/${session.public_token}`} target="_blank">
                            <ExternalLink size={13} />
                            Public
                          </Link>
                        </Button>
                        {isActive && (
                          <>
                            <Button variant="ghost" size="sm"
                              onClick={() => setTestModal({ sessionId: session.id, sessionTitle: session.title })}
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1 text-xs h-8">
                              <FlaskConical size={13} />
                              Test
                            </Button>
                            <Separator orientation="vertical" className="h-5" />
                            <Button variant="ghost" size="sm"
                              disabled={closingId === session.id}
                              onClick={() => handleCloseSession(session.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs h-8 gap-1">
                              {closingId === session.id ? <Loader2 size={12} className="animate-spin" /> : null}
                              {closingId === session.id ? 'Closing...' : 'Close'}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expandable Transactions Panel */}
                    {isOpen && (
                      <div className="bg-muted/30 border-t border-border px-6 py-4">
                        {txLoading ? (
                          <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                            <Loader2 size={16} className="animate-spin" />
                            <span className="text-sm">Loading transactions...</span>
                          </div>
                        ) : sessionTxs.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground text-sm">No transactions yet for this session.</div>
                        ) : (
                          <div className="rounded-lg border border-border overflow-hidden bg-card">
                            {!isActive && (
                              <div className="px-4 py-2 bg-muted/60 border-b border-border text-xs text-muted-foreground">
                                This session is closed — data is kept for reference (last 10 sessions stored).
                              </div>
                            )}
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Name</TableHead>
                                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Amount</TableHead>
                                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase">UTR</TableHead>
                                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Time</TableHead>
                                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Status</TableHead>
                                  <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {sessionTxs.map((tx) => (
                                  <TableRow key={tx.id} className="hover:bg-accent/30">
                                    <TableCell className="font-medium text-foreground py-3">{tx.payer_name}</TableCell>
                                    <TableCell className="font-semibold text-green-700 py-3">₹{tx.amount}</TableCell>
                                    <TableCell className="py-3">
                                      <code className="bg-muted px-2 py-1 rounded text-xs font-mono text-foreground">{tx.utr}</code>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs py-3">
                                      {new Date(tx.payment_time).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' })}
                                    </TableCell>
                                    <TableCell className="py-3">
                                      {tx.rejected ? (
                                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 text-xs gap-1"><XCircle size={11} />Rejected</Badge>
                                      ) : tx.verified
                                        ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-0 text-xs gap-1"><CheckCircle2 size={11} />Verified</Badge>
                                        : <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-xs gap-1"><Clock size={11} />Pending</Badge>
                                      }
                                    </TableCell>
                                    <TableCell className="py-3">
                                      {!tx.verified && !tx.rejected && isActive ? (
                                        <div className="flex items-center gap-1.5">
                                          <Button size="sm" disabled={actionLoading === tx.id}
                                            onClick={() => handleVerify(tx.id, session.id)}
                                            className="h-7 px-2.5 text-xs bg-green-600 hover:bg-green-700 gap-1">
                                            {actionLoading === tx.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                            Verify
                                          </Button>
                                          <Button size="sm" variant="outline" disabled={actionLoading === tx.id}
                                            onClick={() => handleReject(tx.id, session.id, tx.payer_name)}
                                            className="h-7 px-2.5 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 gap-1">
                                            <XCircle size={11} />
                                            Reject
                                          </Button>
                                        </div>
                                      ) : (
                                        <span className="text-xs text-muted-foreground/50">—</span>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Payment Dialog */}
      <Dialog open={!!testModal} onOpenChange={(open) => { if (!open) { setTestModal(null); setTestForm({ payer_name: '', amount: '' }); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical size={18} className="text-emerald-600" />
              Add Test Payment
            </DialogTitle>
            <DialogDescription>
              Simulates a payment for: <span className="font-medium text-foreground">{testModal?.sessionTitle}</span>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTestPayment} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="test-name">Payer Name</Label>
              <Input id="test-name" required placeholder="e.g. John Doe"
                value={testForm.payer_name}
                onChange={(e) => setTestForm({ ...testForm, payer_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-amount">Amount (₹)</Label>
              <Input id="test-amount" type="number" required min="1" placeholder="50"
                value={testForm.amount}
                onChange={(e) => setTestForm({ ...testForm, amount: e.target.value })} />
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={testLoading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1.5">
                {testLoading ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
                {testLoading ? 'Adding...' : 'Add Payment'}
              </Button>
              <Button type="button" variant="outline" className="flex-1"
                onClick={() => { setTestModal(null); setTestForm({ payer_name: '', amount: '' }); }}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
