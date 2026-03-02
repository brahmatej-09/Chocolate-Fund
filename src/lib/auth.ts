import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';

interface AdminPayload {
  id: number;
}

/**
 * Extracts and verifies the JWT from the Authorization header.
 * Returns the admin payload or null if invalid / missing.
 */
export function getAdmin(req: NextRequest): AdminPayload | null {
  const token = req.headers.get('authorization')?.split(' ')[1];
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as AdminPayload;
  } catch {
    return null;
  }
}

/** Convenience — returns a 401 Unauthorized response */
export function unauthorized() {
  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
}
