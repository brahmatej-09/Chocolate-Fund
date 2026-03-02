import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/sessions/public/[token]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const session = await prisma.session.findUnique({
      where: { publicToken: token },
      include: {
        admin: { select: { name: true, upiId: true, qrImageUrl: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ message: 'Session not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: session.id,
      title: session.title,
      amount: Number(session.amount),
      date: session.date,
      status: session.status,
      public_token: session.publicToken,
      admin_name: session.admin.name,
      upi_id: session.admin.upiId ?? null,
      qr_image_url: session.admin.qrImageUrl ?? null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
