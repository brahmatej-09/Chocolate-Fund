'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { getPusherClient } from '@/lib/pusher-client';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle2, Clock, Loader2, Send,
  Smartphone, ListChecks, CandyIcon, Lock, XCircle,
  Trophy, Medal, ChevronDown, FolderOpen
} from 'lucide-react';

interface Session {
  id: number;
  title: string;
  amount: number;
  status: string;
  admin_name: string;
  upi_id: string | null;
  batchId: number | null;
  batchName: string | null;
}

interface Transaction {
  id: number;
  payer_name: string;
  student_roll_no: string | null;
  amount: string;
  payment_time: string;
  verified: boolean;
  rejected: boolean;
}

interface Ranking {
  rank: number;
  rollNo: string;
  name: string;
  paidCount: number;
  verifiedCount: number;
}

export default function PublicSession() {
  const params = useParams();
  const token = params.token as string;

  const [session, setSession] = useState<Session | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  // UTR submit form state
  const [utrForm, setUtrForm] = useState({ payer_name: '', student_roll_no: '', utr: '', amount: '' });
  const [utrLoading, setUtrLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedWarning, setSubmittedWarning] = useState(false);

  // Batch rankings
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [rankings, setRankings] = useState<{ totalSessions: number; rankings: Ranking[] } | null>(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  // Pre-fill amount when session loads
  useEffect(() => {
    if (session?.amount) {
      setUtrForm(prev => ({ ...prev, amount: String(session.amount) }));
    }
  }, [session?.amount]);

  const fetchRankings = async (batchId: number) => {
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

  // 1. Fetch session data
  useEffect(() => {
    if (!token) return;
    const fetchSessionData = async () => {
      try {
        const res = await api.get(`/sessions/public/${token}`);
        setSession(res.data);
        const txRes = await api.get(`/transactions/${res.data.id}`);
        setTransactions(txRes.data.transactions);
        setTotalAmount(txRes.data.totalAmount);
      } catch {
        toast.error('Session not found');
      } finally {
        setLoading(false);
      }
    };
    fetchSessionData();
  }, [token]);

  // 2. Pusher subscriptions — only runs after session is loaded
  useEffect(() => {
    if (!session?.id) return;
    const pusher = getPusherClient();
    const sessionChannel = pusher.subscribe(`session-${session.id}`);

    sessionChannel.bind('new-payment', (data: { transaction: Transaction }) => {
      setTransactions((prev) => [data.transaction, ...prev]);
    });
    sessionChannel.bind('total-updated', (data: { totalAmount: number }) => {
      setTotalAmount(data.totalAmount);
    });
    sessionChannel.bind('session-closed', () => {
      setSession((prev) => prev ? { ...prev, status: 'closed' } : null);
      toast('This session has been closed.', { icon: '🔒' });
    });
    sessionChannel.bind('payment-verified', (data: { transactionId: number }) => {
      setTransactions((prev) =>
        prev.map((t) => (t.id === data.transactionId ? { ...t, verified: true } : t))
      );
    });
    sessionChannel.bind('payment-rejected', (data: { transactionId: number }) => {
      setTransactions((prev) =>
        prev.map((t) => (t.id === data.transactionId ? { ...t, rejected: true } : t))
      );
      setTotalAmount((prev) => prev); // total-updated will follow from server
      toast('A submission was rejected by admin.', { icon: '❌' });
    });

    return () => {
      pusher.unsubscribe(`session-${session.id}`);
    };
  }, [session?.id]);

  // 3. Batch channel for live rankings
  useEffect(() => {
    if (!session?.batchId) return;
    const pusher = getPusherClient();
    const batchChannel = pusher.subscribe(`batch-${session.batchId}`);
    const batchId = session.batchId;

    batchChannel.bind('rankings-updated', () => {
      setRankings(prev => {
        if (prev !== null) fetchRankings(batchId);
        return prev;
      });
    });

    return () => {
      pusher.unsubscribe(`batch-${batchId}`);
    };
  }, [session?.batchId]);

  const handleUTRSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUtrLoading(true);
    try {
      await api.post(`/transactions/submit/${token}`, utrForm);
      toast.success('Payment submitted! Admin will verify shortly.');
      setSubmitted(true);
      setUtrForm({ payer_name: '', student_roll_no: '', utr: '', amount: '' });
    } catch (error: any) {
      if (error.response) {
        // Server responded with an error — definitive failure
        toast.error(error.response.data?.message || 'Submission failed. Try again.');
      } else {
        // Network timeout or no response — server may have saved the transaction
        setSubmitted(true);
        setSubmittedWarning(true);
      }
    } finally {
      setUtrLoading(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} />
        Loading session...
      </div>
    </div>
  );
  if (!session) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-sm w-full text-center p-8 border-red-200">
        <p className="text-red-500 font-semibold text-lg">Session not found</p>
        <p className="text-muted-foreground text-sm mt-1">This link is invalid or has expired.</p>
      </Card>
    </div>
  );

  const upiLink = session.upi_id
    ? `upi://pay?pa=${session.upi_id}&pn=${encodeURIComponent(session.admin_name)}&am=${session.amount}&cu=INR&tn=${encodeURIComponent(session.title)}`
    : null;

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* Top Banner */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <CandyIcon size={16} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">{session.title}</h1>
            <p className="text-xs text-muted-foreground">Collected by {session.admin_name}</p>
          </div>
        </div>
        <Badge className={session.status === 'active'
          ? 'bg-green-100 text-green-800 border-0 gap-1.5'
          : 'bg-red-100 text-red-700 border-0 gap-1.5'}>
          <span className={`w-1.5 h-1.5 rounded-full ${session.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
          {session.status === 'active' ? 'Active' : 'Closed'}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Left: QR Code */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Smartphone size={15} />
              Scan & Pay
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center text-center">
            {session.status === 'active' ? (
              <>
                <div className="bg-card border border-border p-4 rounded-2xl shadow-sm mb-5">
                  {upiLink ? (
                    <a href={upiLink}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(upiLink)}`}
                        alt="UPI QR Code"
                        width={200}
                        height={200}
                        className="rounded-lg"
                      />
                    </a>
                  ) : (
                    <div className="w-[200px] h-[200px] flex items-center justify-center bg-muted rounded-xl text-center px-4">
                      <p className="text-xs text-muted-foreground">Admin hasn&apos;t configured UPI ID yet</p>
                    </div>
                  )}
                </div>
                <div className="w-full space-y-3">
                  <div className="bg-violet-50 rounded-xl py-3 px-5 text-center">
                    <p className="text-xs text-violet-500 mb-0.5">Amount to Pay</p>
                    <p className="text-3xl font-bold text-violet-700">₹{session.amount}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Scan with GPay · PhonePe · Paytm</p>
                  <Separator />
                  <div className="bg-muted rounded-lg px-3 py-2 text-left">
                    <p className="text-xs text-muted-foreground mb-0.5">UPI ID</p>
                    <p className="text-xs font-mono text-foreground break-all">{session.upi_id}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-red-50 border border-red-100 text-red-600 p-8 rounded-xl w-full text-center">
                <Lock size={32} className="mx-auto mb-3 opacity-60" />
                <h3 className="text-base font-bold mb-1">Session Closed</h3>
                <p className="text-sm text-red-400">This collection is no longer accepting payments.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Live Tracking */}
        <Card className="border-border shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <ListChecks size={15} />
              Live Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col flex-1 gap-4">
            {/* Total */}
            <div className="bg-gradient-to-br from-violet-600 to-violet-700 rounded-xl p-4 text-white text-center">
              <p className="text-xs text-violet-200 mb-1 uppercase tracking-wide">Total Collected</p>
              <p className="text-4xl font-bold">₹{totalAmount}</p>
            </div>

            {/* Transaction list */}
            <div className="flex-1 overflow-y-auto max-h-[280px] space-y-2 pr-1">
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground/50">
                  <ListChecks size={32} className="mb-2 opacity-40" />
                  <p className="text-sm">No payments yet</p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2.5 border border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">{tx.payer_name}</p>
                      <p className="text-xs text-muted-foreground">{new Date(tx.payment_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-green-600">+₹{tx.amount}</p>
                      <Badge className={tx.rejected
                        ? 'bg-red-100 text-red-700 hover:bg-red-100 border-0 text-[10px] gap-1'
                        : tx.verified
                          ? 'bg-green-100 text-green-800 hover:bg-green-100 border-0 text-[10px] gap-1'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-100 border-0 text-[10px] gap-1'}>
                        {tx.rejected ? <><XCircle size={9} />Rejected</> : tx.verified ? <><CheckCircle2 size={9} />Verified</> : <><Clock size={9} />Pending</>}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* UTR Submission Form */}
      {session.status === 'active' && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
              <Send size={15} />
              Submit Your UTR
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              After paying via UPI, find the <strong>UTR / Transaction ID</strong> in your payment app and submit below.
            </p>
          </CardHeader>
          <CardContent>
            {submitted ? (
              submittedWarning ? (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-6 text-center">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
                    <Clock size={22} className="text-amber-600" />
                  </div>
                  <p className="font-semibold text-amber-800 text-lg">Connection timed out</p>
                  <p className="text-sm text-amber-700 mt-1 leading-relaxed">
                    Your payment details <span className="font-semibold">may have been received</span> by the server.<br />
                    Please <span className="font-semibold">check with the admin</span> before submitting again to avoid a duplicate entry.
                  </p>
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                  <CheckCircle2 size={40} className="text-green-500 mx-auto mb-3" />
                  <p className="font-semibold text-green-800 text-lg">Payment Submitted!</p>
                  <p className="text-sm text-green-600 mt-1">Waiting for admin to verify your payment.</p>
                  <Button variant="ghost" size="sm"
                    onClick={() => { setSubmitted(false); setUtrForm({ payer_name: '', student_roll_no: '', utr: '', amount: String(session?.amount ?? '') }); }}
                    className="mt-4 text-green-600 hover:text-green-700">
                    Submit another
                  </Button>
                </div>
              )
            ) : (
              <form onSubmit={handleUTRSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payer-name">Your Name *</Label>
                  <Input
                    id="payer-name"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={utrForm.payer_name}
                    onChange={(e) => setUtrForm({ ...utrForm, payer_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="roll-no">Roll Number *</Label>
                  <Input
                    id="roll-no"
                    required
                    placeholder="e.g. 22CS001"
                    value={utrForm.student_roll_no}
                    onChange={(e) => setUtrForm({ ...utrForm, student_roll_no: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="utr">UTR / Transaction ID <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input
                    id="utr"
                    placeholder="e.g. 4267XXXXXXXXXX"
                    value={utrForm.utr}
                    onChange={(e) => setUtrForm({ ...utrForm, utr: e.target.value.toUpperCase() })}
                  />
                  <p className="text-xs text-muted-foreground">Find in your payment app after paying</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount Paid (₹)</Label>
                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      readOnly
                      value={utrForm.amount}
                      className="bg-muted text-muted-foreground cursor-not-allowed pr-16"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Badge className="bg-muted text-muted-foreground hover:bg-muted border-0 text-[10px] gap-1">
                        <Lock size={9} />Fixed
                      </Badge>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Fixed at ₹{session.amount} for this session</p>
                </div>
                <div className="md:col-span-2">
                  <Button type="submit" disabled={utrLoading} className="bg-primary hover:opacity-90 text-primary-foreground gap-2 w-full md:w-auto px-8">
                    {utrLoading ? <><Loader2 size={15} className="animate-spin" />Submitting...</> : <><Send size={15} />Submit Payment</>}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
      {/* Batch Rankings Section */}
      {session.batchId && (
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                  <Trophy size={15} className="text-violet-500" />
                  Batch Rankings
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  <FolderOpen size={11} className="inline mr-1" />{session.batchName} — students ranked by payment count
                </p>
              </div>
              <Button variant="outline" size="sm"
                className="gap-1.5 text-xs text-violet-700 border-violet-200 hover:bg-violet-50"
                onClick={() => {
                  if (!rankingsOpen) {
                    setRankingsOpen(true);
                    if (!rankings) fetchRankings(session.batchId!);
                  } else {
                    setRankingsOpen(false);
                  }
                }}>
                <ChevronDown size={13} className={`transition-transform ${rankingsOpen ? 'rotate-180' : ''}`} />
                {rankingsOpen ? 'Hide' : 'Show Rankings'}
              </Button>
            </div>
          </CardHeader>
          {rankingsOpen && (
            <CardContent className="pt-0">
              {rankingsLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" />
                  <span className="text-sm">Loading rankings...</span>
                </div>
              ) : rankings?.rankings.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">No payment data yet for this batch.</div>
              ) : (
                <div className="space-y-2">
                  {rankings?.rankings.map((r) => (
                    <div key={r.rollNo} className={`flex items-center justify-between rounded-lg px-3 py-2.5 border ${r.rank <= 3 ? 'border-violet-200 bg-violet-50/60' : 'border-border bg-muted/30'}`}>
                      <div className="flex items-center gap-3">
                        <span className="w-8 text-center font-bold text-sm">
                          {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{r.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{r.rollNo}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100 border-0 gap-1 text-xs">
                          <Medal size={10} />
                          {r.paidCount} / {rankings?.totalSessions}
                        </Badge>
                        {r.verifiedCount > 0 && (
                          <p className="text-[10px] text-green-600 mt-0.5">{r.verifiedCount} verified</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
