import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import prisma from '@/lib/prisma';
import { getAdmin, unauthorized } from '@/lib/auth';

// POST /api/sessions/create
export async function POST(req: NextRequest) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const { title, amount, batchId } = await req.json();
    const publicToken = crypto.randomBytes(16).toString('hex');

    const session = await prisma.session.create({
      data: {
        adminId: payload.id,
        title,
        amount: parseFloat(amount),
        publicToken,
        ...(batchId ? { batchId: parseInt(batchId) } : {}),
      },
      include: { batch: { select: { id: true, name: true } } },
    });

    await prisma.activityLog.create({
      data: { adminId: payload.id, action: `Created session: ${title}` },
    });

    return NextResponse.json({
      id: session.id,
      title: session.title,
      amount: session.amount,
      date: session.date,
      status: session.status,
      public_token: session.publicToken,
      batchId: session.batchId,
      batchName: session.batch?.name ?? null,
      createdAt: session.createdAt,
      totalCollected: 0,
    }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
