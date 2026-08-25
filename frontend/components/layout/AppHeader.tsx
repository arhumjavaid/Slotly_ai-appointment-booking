'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/format';
import { Button } from '@/components/ui';
import { useLogout } from '@/hooks/useAuth';
import type { User } from '@/types/api';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/appointments', label: 'Appointments' },
];

export function AppHeader({ user }: { user: User }) {
  const pathname = usePathname();
  const logout = useLogout();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-5">
        <Link href="/dashboard" className="font-display text-[22px] leading-none text-ink">
          Slotly
        </Link>

        <nav className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                  active ? 'bg-paper text-ink' : 'text-ink-3 hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-[13px] font-medium leading-tight text-ink">{user.name}</p>
            <p className="text-[11px] leading-tight text-ink-3">{user.email}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            loading={logout.isPending}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
