import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAdmin, unauthorized } from '@/lib/auth';

// GET /api/transactions/[sessionId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const sessionId = parseInt((await params).sessionId);

    const transactions = await prisma.transaction.findMany({
      where: { sessionId },
      select: { id: true, payerName: true, amount: true, utr: true, paymentTime: true, verified: true, rejected: true },
      orderBy: { paymentTime: 'desc' },
    });

    const mapped = transactions.map((t: (typeof transactions)[number]) => ({
      id: t.id,
      payer_name: t.payerName,
      amount: t.amount,
      utr: t.utr,
      payment_time: t.paymentTime,
      verified: t.verified,
      rejected: t.rejected,
    }));
    const totalAmount = mapped.reduce((sum: number, t: (typeof mapped)[number]) => t.rejected ? sum : sum + parseFloat(String(t.amount)), 0);

    return NextResponse.json({ transactions: mapped, totalAmount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

// POST /api/transactions/[sessionId]  → test transaction
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const sessionId = parseInt((await params).sessionId);
    const { payer_name, amount } = await req.json();

    const session = await prisma.session.findFirst({ where: { id: sessionId, adminId: payload.id } });
    if (!session) return NextResponse.json({ message: 'Session not found or unauthorized' }, { status: 404 });
    if (session.status === 'closed') return NextResponse.json({ message: 'Session is closed' }, { status: 400 });

    const { default: crypto } = await import('crypto');
    const fakeUtr = 'TEST_' + crypto.randomBytes(8).toString('hex').toUpperCase();

    const newTx = await prisma.transaction.create({
      data: { sessionId, payerName: payer_name, amount: parseFloat(amount), utr: fakeUtr, verified: true },
    });

    const agg = await prisma.transaction.aggregate({ where: { sessionId, rejected: false }, _sum: { amount: true } });
    const totalAmount = parseFloat(String(agg._sum.amount ?? 0));

    const { pusherServer } = await import('@/lib/pusher');
    const txPayload = { id: newTx.id, payer_name: newTx.payerName, amount: newTx.amount, utr: newTx.utr, payment_time: newTx.paymentTime, verified: newTx.verified, rejected: newTx.rejected };
    try {
      await pusherServer.trigger(`session-${sessionId}`, 'new-payment', { transaction: txPayload });
      await pusherServer.trigger(`session-${sessionId}`, 'total-updated', { totalAmount });
    } catch (pusherErr) {
      console.error('Pusher trigger failed (non-fatal):', pusherErr);
    }

    return NextResponse.json({ transaction: txPayload, totalAmount }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
