import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAdmin, unauthorized } from '@/lib/auth';

// POST /api/batches/create
export async function POST(req: NextRequest) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ message: 'Batch name is required' }, { status: 400 });
    }

    const batch = await prisma.batch.create({
      data: { adminId: payload.id, name: name.trim() },
    });

    await prisma.activityLog.create({
      data: { adminId: payload.id, action: `Created batch: ${name}` },
    });

    return NextResponse.json({
      id: batch.id,
      name: batch.name,
      createdAt: batch.createdAt,
    }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
