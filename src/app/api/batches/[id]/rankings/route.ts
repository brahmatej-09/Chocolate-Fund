import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/batches/[id]/rankings  — public, no auth required
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const batchId = parseInt((await params).id);
    if (isNaN(batchId)) return NextResponse.json({ message: 'Invalid batch id' }, { status: 400 });

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true, name: true },
    });
    if (!batch) return NextResponse.json({ message: 'Batch not found' }, { status: 404 });

    // Get all non-rejected transactions across all sessions in this batch
    const transactions = await prisma.transaction.findMany({
      where: {
        rejected: false,
        session: { batchId },
      },
      select: {
        studentRollNo: true,
        payerName: true,
        verified: true,
        sessionId: true,
      },
    });

    // Aggregate by studentRollNo (if present) else by payerName — group across all sessions
    const map = new Map<string, { rollNo: string; name: string; paidCount: number; verifiedCount: number }>();

    for (const tx of transactions) {
      const rollNorm = tx.studentRollNo?.trim().toUpperCase();
      const key = rollNorm ? `ROLL:${rollNorm}` : `NAME:${tx.payerName.trim().toLowerCase()}`;
      const displayRollNo = rollNorm ?? '—';
      if (map.has(key)) {
        const entry = map.get(key)!;
        entry.paidCount += 1;
        if (tx.verified) entry.verifiedCount += 1;
      } else {
        map.set(key, {
          rollNo: displayRollNo,
          name: tx.payerName,
          paidCount: 1,
          verifiedCount: tx.verified ? 1 : 0,
        });
      }
    }

    // Sort by paidCount desc, then verifiedCount desc, then rollNo asc
    const rankings = Array.from(map.values())
      .sort((a, b) =>
        b.paidCount !== a.paidCount
          ? b.paidCount - a.paidCount
          : b.verifiedCount !== a.verifiedCount
            ? b.verifiedCount - a.verifiedCount
            : a.rollNo.localeCompare(b.rollNo)
      )
      .map((entry, idx) => ({ rank: idx + 1, ...entry }));

    // Total sessions in batch
    const totalSessions = await prisma.session.count({ where: { batchId } });

    return NextResponse.json({ batch, totalSessions, rankings });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
