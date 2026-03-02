import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher';
import { getAdmin, unauthorized } from '@/lib/auth';
import { sendSessionClosedReport } from '@/lib/email';

// PATCH /api/sessions/[id]/close
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const id = parseInt((await params).id);

    const session = await prisma.session.findFirst({ where: { id, adminId: payload.id } });
    if (!session) {
      return NextResponse.json({ message: 'Session not found or unauthorized' }, { status: 404 });
    }

    // Emit real-time event via Pusher (non-blocking)
    try {
      await pusherServer.trigger(`session-${id}`, 'session-closed', { sessionId: id });
    } catch (pusherErr) {
      console.error('Pusher trigger failed (non-fatal):', pusherErr);
    }

    // Mark session as closed
    await prisma.session.update({ where: { id }, data: { status: 'closed' } });

    // Fetch transactions + admin email in parallel
    const [transactions, admin] = await Promise.all([
      prisma.transaction.findMany({
        where: { sessionId: id },
        orderBy: { paymentTime: 'asc' },
      }),
      prisma.admin.findUnique({
        where: { id: payload.id },
        select: { name: true, email: true },
      }),
    ]);

    // Send report email (awaited — Vercel kills fire-and-forget before it completes)
    if (admin) {
      await sendSessionClosedReport(admin.email, admin.name, {
        sessionTitle: session.title,
        transactions: transactions.map((t: (typeof transactions)[number]) => ({
          payer_name: t.payerName,
          amount: Number(t.amount),
          utr: t.utr,
          payment_time: t.paymentTime,
          verified: t.verified,
          rejected: t.rejected,
        })),
        closedAt: new Date(),
      });
    }

    return NextResponse.json({ message: 'Session closed' });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
