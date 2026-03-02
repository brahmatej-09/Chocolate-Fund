import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const { name, email, password, upi_id, qr_image_url } = await req.json();

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ message: 'Admin already exists with this email' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const admin = await prisma.admin.create({
      data: { name, email, passwordHash, upiId: upi_id, qrImageUrl: qr_image_url },
      select: { id: true, name: true, email: true, upiId: true, qrImageUrl: true },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET!, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any,
    });

    return NextResponse.json({ message: 'Admin registered successfully', token, admin }, { status: 201 });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ message: 'Server error', detail: message }, { status: 500 });
  }
}
