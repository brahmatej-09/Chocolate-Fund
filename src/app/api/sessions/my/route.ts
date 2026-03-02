import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAdmin, unauthorized } from '@/lib/auth';

// GET /api/sessions/my
export async function GET(req: NextRequest) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const sessions = await prisma.session.findMany({
      where: { adminId: payload.id },
      orderBy: { createdAt: 'desc' },
      include: {
        batch: { select: { id: true, name: true } },
        transactions: {
          where: { verified: true, rejected: false },
          select: { amount: true },
        },
      },
    });

    return NextResponse.json(sessions.map(s => ({
      id: s.id,
      title: s.title,
      amount: s.amount,
      date: s.date,
      status: s.status,
      public_token: s.publicToken,
      batchId: s.batchId,
      batchName: s.batch?.name ?? null,
      createdAt: s.createdAt,
      totalCollected: s.transactions.reduce((sum, t) => sum + Number(t.amount), 0),
    })));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
