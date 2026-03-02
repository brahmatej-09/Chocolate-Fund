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
    });

    return NextResponse.json(sessions.map(s => ({
      id: s.id,
      title: s.title,
      amount: s.amount,
      date: s.date,
      status: s.status,
      public_token: s.publicToken,
      createdAt: s.createdAt,
    })));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
