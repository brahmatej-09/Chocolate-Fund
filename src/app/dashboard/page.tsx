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
  Clock, IndianRupee, Layers, CircleDot,
  FolderOpen, Trophy, Medal, Trash2
} from 'lucide-react';

interface Session {
  id: number;
  title: string;
  amount: string;
  date: string;
  status: string;
  public_token: string;
  batchId: number | null;
  batchName: string | null;
  totalCollected: number;
}

interface Transaction {
  id: number;
  payer_name: string;
  student_roll_no: string | null;
  amount: string;
  utr: string | null;
  payment_time: string;
  verified: boolean;
  rejected: boolean;
}

interface Batch {
  id: number;
  name: string;
  createdAt: string;
  totalCollected: number;
  sessions: Session[];
}

interface Ranking {
  rank: number;
  rollNo: string;
  name: string;
  paidCount: number;
  verifiedCount: number;
}

interface TestPaymentModal {
  sessionId: number;
  sessionTitle: string;
  sessionAmount: string;
}

interface RankingsModal {
  batchId: number;
  batchName: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSession, setNewSession] = useState({ title: '', amount: '', batchId: '' });
  const [creating, setCreating] = useState(false);
  const [newBatchName, setNewBatchName] = useState('');
  const [creatingBatch, setCreatingBatch] = useState(false);

  const [testModal, setTestModal] = useState<TestPaymentModal | null>(null);
  const [testForm, setTestForm] = useState({ payer_name: '', student_roll_no: '' });
  const [testLoading, setTestLoading] = useState(false);

  const [rankingsModal, setRankingsModal] = useState<RankingsModal | null>(null);
  const [rankings, setRankings] = useState<{ totalSessions: number; rankings: Ranking[] } | null>(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  // Inline session creation inside a batch card
  const [batchSessionForms, setBatchSessionForms] = useState<Record<number, { title: string; amount: string; open: boolean }>>({});
  const [batchSessionCreating, setBatchSessionCreating] = useState<number | null>(null);

  // Delete batch confirmation
  const [deleteBatchConfirm, setDeleteBatchConfirm] = useState<{ id: number; name: string } | null>(null);
  const [deletingBatch, setDeletingBatch] = useState(false);

  const handleDeleteBatch = async () => {
    if (!deleteBatchConfirm) return;
    setDeletingBatch(true);
    try {
      await api.delete(`/batches/${deleteBatchConfirm.id}`);
      toast.success(`Batch "${deleteBatchConfirm.name}" deleted. Summary emailed to you.`);
      setBatches(prev => prev.filter(b => b.id !== deleteBatchConfirm.id));
      setDeleteBatchConfirm(null);
    } catch {
      toast.error('Failed to delete batch.');
    } finally {
      setDeletingBatch(false);
    }
  };

  // Which batch cards are expanded to show sessions
  const [expandedBatches, setExpandedBatches] = useState<Set<number>>(new Set());
  const toggleBatchExpand = (batchId: number) => {
    setExpandedBatches(prev => {
      const next = new Set(prev);
      next.has(batchId) ? next.delete(batchId) : next.add(batchId);
      return next;
    });
  };

  // Transactions panel per session
  const [openSessionId, setOpenSessionId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Record<number, Transaction[]>>({});
  const [txLoading, setTxLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [closingId, setClosingId] = useState<number | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    fetchData();
  }, [router]);

  // Subscribe to all active sessions for live totalCollected updates
  useEffect(() => {
    const activeSessions = sessions.filter(s => s.status === 'active');
    if (activeSessions.length === 0) return;
    const pusher = getPusherClient();

    const updateTotal = (sessionId: number, totalAmount: number) => {
      setSessions(prev => prev.map(s =>
        s.id === sessionId ? { ...s, totalCollected: totalAmount } : s
      ));
      setBatches(prev => prev.map(b => {
        const newSessions = b.sessions.map(s =>
          s.id === sessionId ? { ...s, totalCollected: totalAmount } : s
        );
        const batchTotal = newSessions.reduce((sum, s) => sum + s.totalCollected, 0);
        return { ...b, sessions: newSessions, totalCollected: batchTotal };
      }));
    };

    activeSessions.forEach(session => {
      const channel = pusher.subscribe(`session-${session.id}`);
      channel.bind('total-updated', (data: { totalAmount: number }) => {
        updateTotal(session.id, data.totalAmount);
      });
    });

    return () => {
      activeSessions.forEach(session => {
        pusher.unsubscribe(`session-${session.id}`);
      });
    };
  }, [sessions.map(s => s.id).join(',')]); // re-run only when session list changes

  // Live Pusher updates for the open session panel (transactions list)
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
      channel.unbind('new-payment');
      channel.unbind('payment-verified');
      channel.unbind('payment-rejected');
    };
  }, [openSessionId]);

  const fetchData = async () => {
    try {
      const [sessionsRes, batchesRes] = await Promise.all([
        api.get('/sessions/my'),
        api.get('/batches/my'),
      ]);
      setSessions(sessionsRes.data);
      setBatches(batchesRes.data);
    } catch {
      toast.error('Failed to fetch data');
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
      const payload: { title: string; amount: string; batchId?: string } = {
        title: newSession.title,
        amount: newSession.amount,
      };
      if (newSession.batchId) payload.batchId = newSession.batchId;
      const res = await api.post('/sessions/create', payload);
      toast.success('Session created');
      setNewSession({ title: '', amount: '', batchId: '' });
      setSessions(prev => [res.data, ...prev]);
      // Also refresh batches to pick up new session grouping
      const batchesRes = await api.get('/batches/my');
      setBatches(batchesRes.data);
    } catch {
      toast.error('Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchName.trim()) return;
    setCreatingBatch(true);
    try {
      const res = await api.post('/batches/create', { name: newBatchName.trim() });
      toast.success('Batch created');
      setNewBatchName('');
      setBatches(prev => [{ ...res.data, sessions: [] }, ...prev]);
    } catch {
      toast.error('Failed to create batch');
    } finally {
      setCreatingBatch(false);
    }
  };

  const handleCloseSession = async (id: number) => {
    if (!confirm('Close this session? Students will no longer be able to submit payments.')) return;
    setClosingId(id);
    try {
      await api.patch(`/sessions/${id}/close`);
      toast.success('Session closed! Report sent to your email.');
      setSessions(prev => prev.map(s => s.id === id ? { ...s, status: 'closed' } : s));
      setBatches(prev => prev.map(b => ({
        ...b,
        sessions: b.sessions.map(s => s.id === id ? { ...s, status: 'closed' } : s),
      })));
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to close session');
    } finally {
      setClosingId(null);
    }
  };

  const toggleBatchForm = (batchId: number) => {
    const willOpen = !(batchSessionForms[batchId]?.open);
    setBatchSessionForms(prev => ({
      ...prev,
      [batchId]: { ...(prev[batchId] || { title: '', amount: '' }), open: willOpen },
    }));
    // Auto-expand the batch card when opening the add-session form
    if (willOpen) {
      setExpandedBatches(prev => {
        const next = new Set(prev);
        next.add(batchId);
        return next;
      });
    }
  };

  const handleCreateBatchSession = async (e: React.FormEvent, batchId: number) => {
    e.preventDefault();
    const form = batchSessionForms[batchId];
    if (!form?.title || !form?.amount) return;
    setBatchSessionCreating(batchId);
    try {
      const res = await api.post('/sessions/create', { title: form.title, amount: form.amount, batchId: String(batchId) });
      toast.success('Session created');
      setBatchSessionForms(prev => ({ ...prev, [batchId]: { title: '', amount: '', open: false } }));
      setSessions(prev => [res.data, ...prev]);
      const batchesRes = await api.get('/batches/my');
      setBatches(batchesRes.data);
    } catch {
      toast.error('Failed to create session');
    } finally {
      setBatchSessionCreating(null);
    }
  };

  const handleTestPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testModal) return;
    setTestLoading(true);
    try {
      await api.post(`/transactions/${testModal.sessionId}`, { ...testForm, amount: testModal.sessionAmount });
      toast.success(`Test payment of ₹${testModal.sessionAmount} added!`);
      if (openSessionId === testModal.sessionId) fetchTransactions(testModal.sessionId);
      setTestModal(null);
      setTestForm({ payer_name: '', student_roll_no: '' });
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Failed to add test payment');
    } finally {
      setTestLoading(false);
    }
  };

  const fetchRankingsForModal = async (batchId: number) => {
    setRankingsLoading(true);
    try {
      const res = await api.get(`/batches/${batchId}/rankings`);
      setRankings({ totalSessions: res.data.totalSessions, rankings: res.data.rankings });
    } catch {
      toast.error('Failed to load rankings');
    } finally {
      setRankingsLoading(false);
    }
  };

  const handleViewRankings = async (batchId: number, batchName: string) => {
    setRankingsModal({ batchId, batchName });
    setRankings(null);
    fetchRankingsForModal(batchId);
  };

  // Live rankings updates while the modal is open
  useEffect(() => {
    if (!rankingsModal) return;
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`batch-${rankingsModal.batchId}`);
    channel.bind('rankings-updated', () => {
      fetchRankingsForModal(rankingsModal.batchId);
    });
    return () => {
      channel.unbind('rankings-updated');
      pusher.unsubscribe(`batch-${rankingsModal.batchId}`);
    };
  }, [rankingsModal?.batchId]);

  const pendingCount = (sessionId: number) =>
    (transactions[sessionId] || []).filter(t => !t.verified && !t.rejected).length;

  const activeSessions = sessions.filter(s => s.status === 'active');
  const closedSessions = sessions.filter(s => s.status === 'closed');
  const unbatchedSessions = sessions.filter(s => !s.batchId);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} />
        Loading dashboard...
      </div>
    </div>
  );

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span className="text-yellow-500 font-bold">🥇 1st</span>;
    if (rank === 2) return <span className="text-gray-400 font-bold">🥈 2nd</span>;
    if (rank === 3) return <span className="text-amber-600 font-bold">🥉 3rd</span>;
    return <span className="text-muted-foreground font-medium">#{rank}</span>;
  };

  const SessionRow = ({ session }: { session: Session }) => {
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
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                <span>₹{session.amount} per head</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-green-600 font-medium">₹{session.totalCollected} collected</span>
                <span className="text-muted-foreground/40">·</span>
                <span>{new Date(session.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
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
                  onClick={() => setTestModal({ sessionId: session.id, sessionTitle: session.title, sessionAmount: session.amount })}
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
                    This session is closed — data is kept for reference.
                  </div>
                )}
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Name</TableHead>
                      <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Roll No</TableHead>
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
                        <TableCell className="py-3">
                          {tx.student_roll_no
                            ? <code className="bg-muted px-2 py-1 rounded text-xs font-mono text-foreground">{tx.student_roll_no}</code>
                            : <span className="text-xs text-muted-foreground/50">—</span>
                          }
                        </TableCell>
                        <TableCell className="font-semibold text-green-700 py-3">₹{tx.amount}</TableCell>
                        <TableCell className="py-3">
                          {tx.utr
                            ? <code className="bg-muted px-2 py-1 rounded text-xs font-mono text-foreground">{tx.utr}</code>
                            : <span className="text-xs text-muted-foreground/50">—</span>
                          }
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
  };

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage batches, sessions and track payments in real time</p>
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

      {/* Create Batch */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen size={16} className="text-primary" />
            Create New Batch
          </CardTitle>
          <CardDescription>Group multiple sessions under a batch to track student payment rankings</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateBatch} className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[200px] space-y-1.5">
              <Label htmlFor="batch-name">Batch Name</Label>
              <Input
                id="batch-name"
                required
                placeholder="e.g., Class 10A ₹ 2025"
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={creatingBatch} className="bg-primary hover:opacity-90 text-primary-foreground gap-1.5">
              {creatingBatch ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Create Batch
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Create Session */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Plus size={16} className="text-primary" />
            Create New Session
          </CardTitle>
          <CardDescription>Start a new collection round — optionally assign it to a batch</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateSession} className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[180px] space-y-1.5">
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
            <div className="w-48 space-y-1.5">
              <Label htmlFor="session-batch">Batch (optional)</Label>
              <select
                id="session-batch"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={newSession.batchId}
                onChange={(e) => setNewSession({ ...newSession, batchId: e.target.value })}
              >
                <option value="">No batch</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={creating} className="bg-primary hover:opacity-90 text-primary-foreground gap-1.5">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Batches with Sessions */}
      {batches.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <FolderOpen size={16} className="text-violet-600" />
            Batches
          </h2>
          {batches.map(batch => {
            const isExpanded = expandedBatches.has(batch.id);
            return (
            <Card key={batch.id} className="border-border shadow-sm">
              <CardHeader
                className="pb-3 cursor-pointer select-none hover:bg-accent/30 transition-colors rounded-t-lg"
                onClick={() => toggleBatchExpand(batch.id)}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                      <ChevronDown size={16} className="text-muted-foreground" />
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <FolderOpen size={15} className="text-violet-500" />
                        {batch.name}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2 flex-wrap">
                        <span>{batch.sessions.length} session{batch.sessions.length !== 1 ? 's' : ''}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-green-600 font-medium">₹{batch.totalCollected} collected</span>
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <Button variant="outline" size="sm"
                      onClick={() => toggleBatchForm(batch.id)}
                      className="gap-1.5 text-xs text-violet-700 border-violet-200 hover:bg-violet-50">
                      <Plus size={13} />
                      Add Session
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={() => handleViewRankings(batch.id, batch.name)}
                      className="gap-1.5 text-xs text-violet-700 border-violet-200 hover:bg-violet-50">
                      <Trophy size={13} />
                      View Rankings
                    </Button>
                    <Button variant="outline" size="sm"
                      onClick={() => setDeleteBatchConfirm({ id: batch.id, name: batch.name })}
                      className="gap-1.5 text-xs text-red-600 border-red-200 hover:bg-red-50">
                      <Trash2 size={13} />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {isExpanded && (
                <CardContent className="p-0">
                  {batchSessionForms[batch.id]?.open && (
                    <form
                      onSubmit={e => handleCreateBatchSession(e, batch.id)}
                      className="flex gap-2 items-end flex-wrap p-4 border-b border-border bg-muted/30"
                    >
                      <div className="flex-1 min-w-[160px]">
                        <Label className="text-xs mb-1 block">Session Title</Label>
                        <Input
                          placeholder="e.g., Late Fine - Feb 27"
                          value={batchSessionForms[batch.id]?.title || ''}
                          onChange={e => setBatchSessionForms(prev => ({ ...prev, [batch.id]: { ...prev[batch.id], title: e.target.value } }))}
                          className="h-8 text-sm"
                          required
                        />
                      </div>
                      <div className="w-24">
                        <Label className="text-xs mb-1 block">Amount (₹)</Label>
                        <Input
                          type="number"
                          placeholder="50"
                          value={batchSessionForms[batch.id]?.amount || ''}
                          onChange={e => setBatchSessionForms(prev => ({ ...prev, [batch.id]: { ...prev[batch.id], amount: e.target.value } }))}
                          className="h-8 text-sm"
                          required
                        />
                      </div>
                      <Button type="submit" size="sm" className="h-8 gap-1 bg-violet-600 hover:bg-violet-700 text-white"
                        disabled={batchSessionCreating === batch.id}>
                        {batchSessionCreating === batch.id ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                        Create
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs"
                        onClick={() => toggleBatchForm(batch.id)}>
                        Cancel
                      </Button>
                    </form>
                  )}
                  {batch.sessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground text-sm">
                      <Layers size={28} className="mb-2 opacity-30" />
                      No sessions yet — use "Add Session" to create one in this batch.
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {batch.sessions.map(session => (
                        <SessionRow key={session.id} session={session} />
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {/* Unassigned Sessions */}
      <Card className="border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {batches.length > 0 ? 'Unassigned Sessions' : 'Your Sessions'}
          </CardTitle>
          <CardDescription>
            {unbatchedSessions.length} session{unbatchedSessions.length !== 1 ? 's' : ''}
            {batches.length > 0 ? ' not assigned to any batch' : ' total'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {unbatchedSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Layers size={40} className="mb-3 opacity-30" />
              <p className="text-sm">
                {batches.length > 0 ? 'All sessions are assigned to batches.' : 'No sessions yet. Create one above!'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {unbatchedSessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rankings Dialog */}
      <Dialog open={!!rankingsModal} onOpenChange={(open) => { if (!open) { setRankingsModal(null); setRankings(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy size={18} className="text-violet-600" />
              Rankings — {rankingsModal?.batchName}
            </DialogTitle>
            <DialogDescription>
              Students ranked by number of times they paid across all sessions in this batch.
              {rankings && <span className="ml-1 font-medium text-foreground">({rankings.totalSessions} sessions total)</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            {rankingsLoading ? (
              <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                <Loader2 size={18} className="animate-spin" />
                Loading rankings...
              </div>
            ) : rankings?.rankings.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No payment data yet for this batch.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase w-16">Rank</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Roll No</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase">Name</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase text-center">Times Paid</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase text-center">Verified</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings?.rankings.map((r) => (
                    <TableRow key={r.rank} className={`hover:bg-accent/30 ${r.rank <= 3 ? 'bg-violet-50/50' : ''}`}>
                      <TableCell className="py-3 font-medium">{getRankBadge(r.rank)}</TableCell>
                      <TableCell className="py-3">
                        <code className="bg-muted px-2 py-1 rounded text-xs font-mono">{r.rollNo}</code>
                      </TableCell>
                      <TableCell className="py-3 font-medium text-foreground">{r.name}</TableCell>
                      <TableCell className="py-3 text-center">
                        <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 border-0 gap-1">
                          <Medal size={10} />
                          {r.paidCount} / {rankings?.totalSessions}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-center">
                        <Badge className="bg-green-100 text-green-800 hover:bg-green-100 border-0 text-xs">
                          {r.verifiedCount}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Test Payment Dialog */}
      <Dialog open={!!testModal} onOpenChange={(open) => { if (!open) { setTestModal(null); setTestForm({ payer_name: '', student_roll_no: '' }); } }}>
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
              <Label htmlFor="test-roll">Roll No</Label>
              <Input id="test-roll" placeholder="e.g. 2320040010"
                value={testForm.student_roll_no}
                onChange={(e) => setTestForm({ ...testForm, student_roll_no: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <div className="flex items-center h-10 px-3 rounded-md border border-border bg-muted/50 text-sm font-semibold text-green-700">
                ₹{testModal?.sessionAmount}
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <Button type="submit" disabled={testLoading} className="flex-1 bg-emerald-600 hover:bg-emerald-700 gap-1.5">
                {testLoading ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
                {testLoading ? 'Adding...' : 'Add Payment'}
              </Button>
              <Button type="button" variant="outline" className="flex-1"
                onClick={() => { setTestModal(null); setTestForm({ payer_name: '', student_roll_no: '' }); }}>
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Batch Confirmation Dialog */}
      <Dialog open={!!deleteBatchConfirm} onOpenChange={(open) => { if (!open && !deletingBatch) setDeleteBatchConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 size={18} />
              Delete Batch
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-semibold text-foreground">"{deleteBatchConfirm?.name}"</span>?
              <br /><br />
              A full summary of all sessions and transactions will be <span className="text-foreground font-medium">emailed to you</span> before deletion. Sessions in this batch will become unassigned but will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="destructive"
              className="flex-1 gap-1.5"
              onClick={handleDeleteBatch}
              disabled={deletingBatch}
            >
              {deletingBatch ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {deletingBatch ? 'Deleting...' : 'Yes, Delete & Email Me'}
            </Button>
            <Button variant="outline" className="flex-1"
              onClick={() => setDeleteBatchConfirm(null)}
              disabled={deletingBatch}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
