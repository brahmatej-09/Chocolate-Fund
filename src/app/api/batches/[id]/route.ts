import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAdmin, unauthorized } from '@/lib/auth';
import { sendBatchDeletedReport } from '@/lib/email';

// DELETE /api/batches/[id]  — admin-only, sends summary email then deletes batch
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const batchId = parseInt((await params).id);
    if (isNaN(batchId)) return NextResponse.json({ message: 'Invalid batch id' }, { status: 400 });

    // Verify the batch belongs to this admin and fetch full data for email
    const batch = await prisma.batch.findFirst({
      where: { id: batchId, adminId: payload.id },
      include: {
        sessions: {
          include: {
            transactions: {
              orderBy: { paymentTime: 'asc' },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!batch) return NextResponse.json({ message: 'Batch not found' }, { status: 404 });

    // Get admin contact info
    const admin = await prisma.admin.findUnique({
      where: { id: payload.id },
      select: { email: true, name: true },
    });
    if (!admin) return unauthorized();

    // Send summary email (non-blocking failure — delete still proceeds)
    await sendBatchDeletedReport(admin.email, admin.name, {
      name: batch.name,
      createdAt: batch.createdAt,
      sessions: batch.sessions.map(s => ({
        title: s.title,
        amount: s.amount.toNumber(),
        transactions: s.transactions.map(t => ({
          payerName: t.payerName,
          studentRollNo: t.studentRollNo,
          amount: t.amount.toNumber(),
          utr: t.utr,
          paymentTime: t.paymentTime,
          verified: t.verified,
          rejected: t.rejected,
        })),
      })),
    });

    // Delete the batch — sessions' batchId becomes NULL (SetNull cascade)
    await prisma.batch.delete({ where: { id: batchId } });

    await prisma.activityLog.create({
      data: { adminId: payload.id, action: `Deleted batch: ${batch.name}` },
    });

    return NextResponse.json({ message: 'Batch deleted' });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
