import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getAdmin, unauthorized } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export async function GET(req: NextRequest) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const admin = await prisma.admin.findUnique({
      where: { id: payload.id },
      select: { id: true, name: true, email: true, upiId: true, qrImageUrl: true, createdAt: true },
    });

    if (!admin) return NextResponse.json({ message: 'Admin not found' }, { status: 404 });

    return NextResponse.json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      upi_id: admin.upiId,
      qr_image_url: admin.qrImageUrl,
      created_at: admin.createdAt,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const payload = getAdmin(req);
    if (!payload) return unauthorized();

    const { name, upi_id, qr_image_url, current_password, new_password } = await req.json();

    // Handle password change
    if (current_password || new_password) {
      if (!current_password || !new_password) {
        return NextResponse.json({ message: 'Both current and new password are required' }, { status: 400 });
      }
      if (new_password.length < 6) {
        return NextResponse.json({ message: 'New password must be at least 6 characters' }, { status: 400 });
      }
      const admin = await prisma.admin.findUnique({ where: { id: payload.id }, select: { passwordHash: true } });
      if (!admin) return NextResponse.json({ message: 'Admin not found' }, { status: 404 });
      const valid = await bcrypt.compare(current_password, admin.passwordHash);
      if (!valid) return NextResponse.json({ message: 'Current password is incorrect' }, { status: 400 });
      const hashed = await bcrypt.hash(new_password, 10);
      await prisma.admin.update({ where: { id: payload.id }, data: { passwordHash: hashed } });
      await prisma.activityLog.create({ data: { adminId: payload.id, action: 'Changed password' } });
      return NextResponse.json({ message: 'Password changed successfully' });
    }

    const updated = await prisma.admin.update({
      where: { id: payload.id },
      data: {
        ...(name && { name }),
        ...(upi_id !== undefined && { upiId: upi_id }),
        ...(qr_image_url !== undefined && { qrImageUrl: qr_image_url }),
      },
      select: { id: true, name: true, email: true, upiId: true, qrImageUrl: true, createdAt: true },
    });

    await prisma.activityLog.create({ data: { adminId: payload.id, action: 'Updated profile' } });

    return NextResponse.json({ message: 'Profile updated', admin: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      upi_id: updated.upiId,
      qr_image_url: updated.qrImageUrl,
      created_at: updated.createdAt,
    } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ message: 'Server error' }, { status: 500 });
  }
}
