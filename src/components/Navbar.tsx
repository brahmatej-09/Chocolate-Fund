'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  LayoutDashboard, BarChart2, User, LogOut, LogIn,
  UserPlus, CandyIcon, Sun, Moon, CircleDot,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, type Theme } from '@/components/ThemeProvider';

const themeConfig: Record<Theme, { next: Theme; icon: React.ElementType; label: string; colorClass: string }> = {
  light: { next: 'dark',  icon: Sun,       label: 'Light', colorClass: 'text-amber-500' },
  dark:  { next: 'black', icon: Moon,      label: 'Dark',  colorClass: 'text-indigo-400' },
  black: { next: 'light', icon: CircleDot, label: 'Black', colorClass: 'text-violet-400' },
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, cycleTheme } = useTheme();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminName, setAdminName] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const admin = localStorage.getItem('admin');
    setIsLoggedIn(!!token);
    if (admin) {
      try { setAdminName(JSON.parse(admin).name?.split(' ')[0] || ''); } catch {}
    }
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('admin');
    setIsLoggedIn(false);
    router.push('/login');
  };

  const navLink = (href: string, label: string, Icon: React.ElementType) => (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200',
        pathname === href
          ? 'bg-accent text-accent-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
      )}
    >
      <Icon size={15} />
      {label}
    </Link>
  );

  const currentTheme = themeConfig[mounted ? theme : 'light'];
  const ThemeIcon = currentTheme.icon;

  return (
    <nav
      className="sticky top-0 z-50 border-b border-border/60 backdrop-blur-xl"
      style={{ background: 'hsl(var(--card) / 0.85)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-14 items-center gap-4">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center shadow-sm group-hover:opacity-90 transition-opacity">
              <CandyIcon size={15} className="text-primary-foreground" />
            </div>
            <span className="text-base font-bold">
              Chocolate <span className="text-primary">Fund</span>
            </span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1 ml-auto">
            {isLoggedIn ? (
              <>
                {navLink('/dashboard', 'Dashboard', LayoutDashboard)}
                {navLink('/analytics', 'Analytics', BarChart2)}
                {navLink('/profile', adminName || 'Profile', User)}
                <Separator orientation="vertical" className="h-5 mx-1 opacity-40" />
                <Button
                  variant="ghost" size="sm"
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-1.5"
                >
                  <LogOut size={15} />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground gap-1.5">
                  <Link href="/login">
                    <LogIn size={15} />
                    <span className="hidden sm:inline">Login</span>
                  </Link>
                </Button>
                <Button size="sm" asChild className="bg-primary text-primary-foreground hover:opacity-90 gap-1.5 shadow-sm">
                  <Link href="/register">
                    <UserPlus size={15} />
                    <span className="hidden sm:inline">Register</span>
                  </Link>
                </Button>
              </>
            )}

            <Separator orientation="vertical" className="h-5 mx-1 opacity-40" />

            {/* Theme toggle — cycles: Light → Dark → Black → Light */}
            <button
              onClick={cycleTheme}
              title={`Current: ${currentTheme.label} — click to switch to ${themeConfig[currentTheme.next].label}`}
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-200',
                'hover:bg-accent/80 border border-transparent hover:border-border/60',
                currentTheme.colorClass
              )}
            >
              <ThemeIcon size={16} />
            </button>
          </div>

        </div>
      </div>
    </nav>
  );
}

