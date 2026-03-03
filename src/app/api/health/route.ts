import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET /api/health
// Pings the database to keep it awake on free-tier Supabase/Neon.
// Point UptimeRobot to: https://your-site.vercel.app/api/health every 5 minutes.
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'awake' }, { status: 200 });
  } catch (err) {
    console.error('[Health] DB ping failed:', err);
    return NextResponse.json({ status: 'error', db: 'sleeping' }, { status: 503 });
  }
}
