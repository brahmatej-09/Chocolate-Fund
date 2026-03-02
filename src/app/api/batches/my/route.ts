import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAdmin, unauthorized } from '@/lib/auth';

// GET /api/batches/my
export async function GET(req: NextRequest) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const batches = await prisma.batch.findMany({
      where: { adminId: payload.id },
      orderBy: { createdAt: 'desc' },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          include: {
            transactions: {
              where: { verified: true, rejected: false },
              select: { amount: true },
            },
          },
        },
      },
    });

    return NextResponse.json(batches.map(b => {
      const sessions = b.sessions.map(s => {
        const totalCollected = s.transactions.reduce((sum, t) => sum + Number(t.amount), 0);
        return {
          id: s.id,
          title: s.title,
          amount: s.amount,
          date: s.date,
          status: s.status,
          public_token: s.publicToken,
          batchId: b.id,
          batchName: b.name,
          createdAt: s.createdAt,
          totalCollected,
        };
      });
      const totalCollected = sessions.reduce((sum, s) => sum + s.totalCollected, 0);
      return {
        id: b.id,
        name: b.name,
        createdAt: b.createdAt,
        totalCollected,
        sessions,
      };
    }));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
