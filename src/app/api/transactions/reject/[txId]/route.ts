import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher';
import { getAdmin, unauthorized } from '@/lib/auth';

// PATCH /api/transactions/reject/[txId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ txId: string }> }
) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const txId = parseInt((await params).txId);

    const tx = await prisma.transaction.findFirst({
      where: { id: txId, session: { adminId: payload.id } },
      select: { id: true, sessionId: true },
    });
    if (!tx) return NextResponse.json({ message: 'Transaction not found or unauthorized' }, { status: 404 });

    const updated = await prisma.transaction.update({
      where: { id: tx.id },
      data: { rejected: true },
    });

    const agg = await prisma.transaction.aggregate({
      where: { sessionId: tx.sessionId, rejected: false },
      _sum: { amount: true },
    });
    const totalAmount = parseFloat(String(agg._sum.amount ?? 0));

    try {
      await pusherServer.trigger(`session-${tx.sessionId}`, 'payment-rejected', { transactionId: tx.id });
      await pusherServer.trigger(`session-${tx.sessionId}`, 'total-updated', { totalAmount });
    } catch (pusherErr) {
      console.error('Pusher trigger failed (non-fatal):', pusherErr);
    }

    return NextResponse.json({ message: 'Transaction rejected', transaction: updated, totalAmount });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
