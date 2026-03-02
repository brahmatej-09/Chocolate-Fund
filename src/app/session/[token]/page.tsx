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
  Smartphone, ListChecks, CandyIcon, Lock, XCircle
} from 'lucide-react';

interface Session {
  id: number;
  title: string;
  amount: number;
  status: string;
  admin_name: string;
  upi_id: string | null;
}

interface Transaction {
  id: number;
  payer_name: string;
  amount: string;
  payment_time: string;
  verified: boolean;
  rejected: boolean;
}

export default function PublicSession() {
  const params = useParams();
  const token = params.token as string;

  const [session, setSession] = useState<Session | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  // UTR submit form state
  const [utrForm, setUtrForm] = useState({ payer_name: '', utr: '', amount: '' });
  const [utrLoading, setUtrLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedWarning, setSubmittedWarning] = useState(false);

  // Pre-fill amount when session loads
  useEffect(() => {
    if (session?.amount) {
      setUtrForm(prev => ({ ...prev, amount: String(session.amount) }));
    }
  }, [session?.amount]);

  useEffect(() => {
    if (!token) return;
    let channelName: string | null = null;

    const fetchSessionData = async () => {
      try {
        const res = await api.get(`/sessions/public/${token}`);
        setSession(res.data);

        const txRes = await api.get(`/transactions/${res.data.id}`);
        setTransactions(txRes.data.transactions);
        setTotalAmount(txRes.data.totalAmount);

        // Subscribe to Pusher channel after getting session ID
        channelName = `session-${res.data.id}`;
        const pusher = getPusherClient();
        const channel = pusher.subscribe(channelName);

        channel.bind('new-payment', (data: { transaction: Transaction }) => {
          setTransactions((prev) => [data.transaction, ...prev]);
          setTotalAmount((prev) => prev + parseFloat(String(data.transaction.amount)));
        });
        channel.bind('total-updated', (data: { totalAmount: number }) => {
          setTotalAmount(data.totalAmount);
        });
        channel.bind('session-closed', () => {
          setSession((prev) => prev ? { ...prev, status: 'closed' } : null);
          toast('This session has been closed.', { icon: '🔒' });
        });
        channel.bind('payment-verified', (data: { transactionId: number }) => {
          setTransactions((prev) =>
            prev.map((t) => (t.id === data.transactionId ? { ...t, verified: true } : t))
          );
        });
        channel.bind('payment-rejected', (data: { transactionId: number }) => {
          setTransactions((prev) => {
            const tx = prev.find((t) => t.id === data.transactionId);
            if (tx && !tx.rejected) {
              setTotalAmount((total) => total - parseFloat(String(tx.amount)));
            }
            return prev.map((t) => (t.id === data.transactionId ? { ...t, rejected: true } : t));
          });
          toast('A submission was rejected by admin.', { icon: '❌' });
        });
      } catch {
        toast.error('Session not found');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionData();

    return () => {
      if (channelName) {
        getPusherClient().unsubscribe(channelName);
      }
    };
  }, [token]);

  const handleUTRSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUtrLoading(true);
    try {
      await api.post(`/transactions/submit/${token}`, utrForm);
      toast.success('Payment submitted! Admin will verify shortly.');
      setSubmitted(true);
      setUtrForm({ payer_name: '', utr: '', amount: '' });
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
                    onClick={() => { setSubmitted(false); setUtrForm({ payer_name: '', utr: '', amount: String(session?.amount ?? '') }); }}
                    className="mt-4 text-green-600 hover:text-green-700">
                    Submit another
                  </Button>
                </div>
              )
            ) : (
              <form onSubmit={handleUTRSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <Label htmlFor="utr">UTR / Transaction ID *</Label>
                  <Input
                    id="utr"
                    required
                    placeholder="e.g. 4267XXXXXXXXXX"
                    value={utrForm.utr}
                    onChange={(e) => setUtrForm({ ...utrForm, utr: e.target.value.toUpperCase() })}
                  />
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
                <div className="md:col-span-3">
                  <Button type="submit" disabled={utrLoading} className="bg-primary hover:opacity-90 text-primary-foreground gap-2 w-full md:w-auto px-8">
                    {utrLoading ? <><Loader2 size={15} className="animate-spin" />Submitting...</> : <><Send size={15} />Submit Payment</>}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
