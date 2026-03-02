import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher';

// POST /api/transactions/submit/[token]
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { payer_name, student_roll_no, utr, amount } = await req.json();

    if (!payer_name || !amount) {
      return NextResponse.json({ message: 'Name and amount are required' }, { status: 400 });
    }
    if (!student_roll_no?.trim()) {
      return NextResponse.json({ message: 'Student roll number is required' }, { status: 400 });
    }

    // UTR is optional — only validate if provided
    let utrClean: string | null = null;
    if (utr && String(utr).trim()) {
      utrClean = String(utr).trim().toUpperCase();
      if (!/^[A-Z0-9]{8,22}$/.test(utrClean)) {
        return NextResponse.json(
          { message: 'Invalid UTR format. It should be 8–22 alphanumeric characters.' },
          { status: 400 }
        );
      }
    }

    const [session, dupCheck] = await Promise.all([
      prisma.session.findUnique({
        where: { publicToken: token },
        select: { id: true, adminId: true, title: true, amount: true, status: true },
      }),
      utrClean
        ? prisma.transaction.findUnique({ where: { utr: utrClean }, select: { id: true } })
        : Promise.resolve(null),
    ]);

    if (!session) return NextResponse.json({ message: 'Session not found' }, { status: 404 });
    if (session.status === 'closed') {
      return NextResponse.json({ message: 'This session is closed and no longer accepting payments' }, { status: 400 });
    }
    if (dupCheck) {
      return NextResponse.json(
        { message: 'This UTR has already been submitted. If you think this is a mistake, contact the admin.' },
        { status: 409 }
      );
    }

    const submittedAmount = parseFloat(String(amount));
    const sessionAmount = parseFloat(String(session.amount));
    if (submittedAmount !== sessionAmount) {
      return NextResponse.json(
        { message: `Amount mismatch. This session requires exactly ₹${sessionAmount}. You entered ₹${submittedAmount}.` },
        { status: 400 }
      );
    }

    const newTx = await prisma.transaction.create({
      data: {
        sessionId: session.id,
        payerName: payer_name.trim(),
        studentRollNo: student_roll_no.trim().toUpperCase(),
        amount: submittedAmount,
        utr: utrClean ?? undefined,
        verified: false,
      },
    });

    const aggregate = await prisma.transaction.aggregate({ where: { sessionId: session.id, rejected: false }, _sum: { amount: true } });
    const totalAmount = parseFloat(String(aggregate._sum.amount ?? 0));

    // Pusher real-time events (non-blocking — never crash the response)
    const txPayload = { id: newTx.id, payer_name: newTx.payerName, student_roll_no: newTx.studentRollNo, amount: newTx.amount, utr: newTx.utr, payment_time: newTx.paymentTime, verified: newTx.verified, rejected: newTx.rejected };
    try {
      await pusherServer.trigger(`session-${session.id}`, 'new-payment', { transaction: txPayload });
      await pusherServer.trigger(`session-${session.id}`, 'total-updated', { totalAmount });
    } catch (pusherErr) {
      console.error('Pusher trigger failed (non-fatal):', pusherErr);
    }

    return NextResponse.json(
      { message: 'Payment submitted successfully! Admin will verify shortly.', transaction: newTx },
      { status: 201 }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
