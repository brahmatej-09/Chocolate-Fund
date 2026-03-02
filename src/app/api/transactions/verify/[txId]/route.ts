import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher';
import { getAdmin, unauthorized } from '@/lib/auth';

// PATCH /api/transactions/verify/[txId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ txId: string }> }
) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const txId = parseInt((await params).txId);

    const existing = await prisma.transaction.findFirst({
      where: { id: txId, session: { adminId: payload.id } },
      select: { id: true, sessionId: true },
    });
    if (!existing) return NextResponse.json({ message: 'Transaction not found or unauthorized' }, { status: 404 });

    const tx = await prisma.transaction.update({ where: { id: existing.id }, data: { verified: true } });

    const [agg, session] = await Promise.all([
      prisma.transaction.aggregate({
        where: { sessionId: tx.sessionId, verified: true, rejected: false },
        _sum: { amount: true },
      }),
      prisma.session.findUnique({ where: { id: tx.sessionId }, select: { batchId: true } }),
    ]);
    const totalAmount = parseFloat(String(agg._sum.amount ?? 0));

    try {
      await pusherServer.trigger(`session-${tx.sessionId}`, 'payment-verified', { transactionId: tx.id });
      await pusherServer.trigger(`session-${tx.sessionId}`, 'total-updated', { totalAmount });
      if (session?.batchId) {
        await pusherServer.trigger(`batch-${session.batchId}`, 'rankings-updated', {});
      }
    } catch (pusherErr) {
      console.error('Pusher trigger failed (non-fatal):', pusherErr);
    }

    return NextResponse.json({ message: 'Transaction verified', transaction: tx, totalAmount });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: 'Server error', detail: message }, { status: 500 });
  }
}
