'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { Spinner } from '@/components/ui';
import { useCurrentUser } from '@/hooks/useAuth';

/**
 * Shell for every signed-in screen.
 *
 * The redirect here is a convenience, not a security control: the API rejects
 * unauthenticated requests on its own, so removing this guard in the browser
 * would reveal an empty shell and nothing else.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading, isUnauthenticated } = useCurrentUser();

  useEffect(() => {
    if (isUnauthenticated) router.replace('/login');
  }, [isUnauthenticated, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner className="text-ink-3" />
        <span className="sr-only">Loading your account</span>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <AppHeader user={user} />
      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
