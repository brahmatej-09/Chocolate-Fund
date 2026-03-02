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

    // Send report email (non-blocking)
    if (admin) {
      sendSessionClosedReport(admin.email, admin.name, {
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

    // Delete related activity logs for this session
    await prisma.activityLog.deleteMany({
      where: { adminId: payload.id, action: { contains: session.title } },
    });

    // Keep only the last 10 closed sessions per admin — delete oldest beyond that
    const keep = await prisma.session.findMany({
      where: { adminId: payload.id, status: 'closed' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true },
    });
    const keepIds = keep.map((s: { id: number }) => s.id);
    await prisma.session.deleteMany({
      where: { adminId: payload.id, status: 'closed', id: { notIn: keepIds } },
    });

    return NextResponse.json({ message: 'Session closed' });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
