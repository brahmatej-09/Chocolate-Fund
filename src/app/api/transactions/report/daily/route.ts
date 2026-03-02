import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAdmin, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const report = await prisma.$queryRaw<{ date: Date; total_amount: number; transaction_count: number }[]>`
      SELECT DATE(t.payment_time) as date,
             SUM(t.amount)::float as total_amount,
             COUNT(t.id)::int as transaction_count
      FROM transactions t
      JOIN sessions s ON t.session_id = s.id
      WHERE s.admin_id = ${payload.id} AND t.payment_time >= CURRENT_DATE AND t.rejected = false
      GROUP BY DATE(t.payment_time)
      ORDER BY date DESC`;

    return NextResponse.json(report);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
