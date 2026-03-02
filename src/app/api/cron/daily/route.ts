import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendDailyReport } from '@/lib/email';

// GET /api/cron/daily
// Called by Vercel Cron at 11:59 PM IST (18:29 UTC) — see vercel.json
export async function GET(req: NextRequest) {
  // Protect the endpoint with a secret so only Vercel Cron can call it
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admins = await prisma.admin.findMany({ select: { id: true, name: true, email: true } });
    if (admins.length === 0) return NextResponse.json({ ok: true, sent: 0 });

    const today = new Date().toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    let sent = 0;

    for (const admin of admins) {
      const transactions = await prisma.transaction.findMany({
        where: {
          session: { adminId: admin.id },
          paymentTime: { gte: startOfDay, lte: endOfDay },
        },
        include: { session: { select: { title: true } } },
        orderBy: { paymentTime: 'asc' },
      });

      if (transactions.length === 0) continue;

      const rows = transactions.map((t: (typeof transactions)[number]) => ({
        payer_name: t.payerName,
        amount: Number(t.amount),
        utr: t.utr,
        payment_time: t.paymentTime,
        verified: t.verified,
        session_title: t.session.title,
      }));

      try {
        await sendDailyReport(admin.email, admin.name, rows, today);
        sent++;

        await prisma.transaction.deleteMany({
          where: { id: { in: transactions.map((t: (typeof transactions)[number]) => t.id) } },
        });
      } catch (emailErr: unknown) {
        console.error(`[CRON] Failed to send email to ${admin.email}:`, (emailErr as Error).message);
      }
    }

    // Clean up empty closed sessions older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const emptySessions = await prisma.session.findMany({
      where: { status: 'closed', createdAt: { lt: sevenDaysAgo }, transactions: { none: {} } },
      select: { id: true },
    });
    if (emptySessions.length > 0) {
      await prisma.session.deleteMany({ where: { id: { in: emptySessions.map((s: (typeof emptySessions)[number]) => s.id) } } });
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error('[CRON] Daily job error:', err);
    return NextResponse.json({ message: 'Cron job failed' }, { status: 500 });
  }
}
