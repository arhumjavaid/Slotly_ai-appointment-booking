'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui';
import { useCurrentUser } from '@/hooks/useAuth';

/** Sends people to the dashboard or the sign-in screen, whichever applies. */
export default function RootPage() {
  const router = useRouter();
  const { user, isLoading, isUnauthenticated } = useCurrentUser();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? '/dashboard' : '/login');
  }, [isLoading, isUnauthenticated, router, user]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="text-ink-3" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
