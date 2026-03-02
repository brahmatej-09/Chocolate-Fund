'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CandyIcon, Zap, ShieldCheck, BarChart2 } from 'lucide-react';

export default function Home() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(!!localStorage.getItem('token'));
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">

      {/* Badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-accent/50 text-accent-foreground text-xs font-medium mb-6">
        <CandyIcon size={12} />
        Live payment tracking platform
      </div>

      {/* Heading */}
      <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground mb-4 leading-tight">
        Collect fines,{' '}
        <span className="text-primary">track payments</span>
        <br />in real-time
      </h1>

      <p className="text-base sm:text-lg text-muted-foreground max-w-xl mb-10 leading-relaxed">
        The simplest way for teachers and admins to manage daily sessions,
        verify UPI payments live, and send instant reports.
      </p>

      {/* CTA Buttons — changes based on auth state */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
        {signedIn ? (
          <>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/30"
            >
              Go to Dashboard
            </Link>
            <Link
              href="/analytics"
              className="inline-flex items-center gap-2 border border-border bg-card text-foreground px-6 py-3 rounded-xl font-semibold hover:bg-accent/60 transition-all"
            >
              View Analytics
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/30"
            >
              Get Started — it&apos;s free
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-border bg-card text-foreground px-6 py-3 rounded-xl font-semibold hover:bg-accent/60 transition-all"
            >
              Sign in
            </Link>
          </>
        )}
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
        {[
          { icon: Zap,         title: 'Live updates',     desc: 'Payments appear instantly via WebSocket — no refresh needed.' },
          { icon: ShieldCheck, title: 'Verify & reject',  desc: 'One-click verify or reject each UTR submission.' },
          { icon: BarChart2,   title: 'Reports',          desc: 'Daily, weekly & monthly analytics with export-ready tables.' },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="text-left rounded-xl border border-border bg-card p-5 hover:border-primary/40 transition-colors">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center mb-3">
              <Icon size={16} className="text-accent-foreground" />
            </div>
            <h3 className="font-semibold text-foreground text-sm mb-1">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

    </div>
  );
}
