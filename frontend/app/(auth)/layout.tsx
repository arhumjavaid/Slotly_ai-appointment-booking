import Link from 'next/link';
import { SlotlyMark } from '@/components/brand/SlotlyMark';

/*
 * Sign-in and sign-up share this shell so the two screens are read as one
 * experience: brand on the left, a single card on the right, and nothing else
 * competing for attention.
 *
 * Below `lg` the two halves stack — mark first at a reduced size, card beneath —
 * rather than shrinking the split, which would leave both halves too narrow.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-canvas relative min-h-dvh">
      <Link
        href="/"
        className="absolute left-6 top-6 z-10 inline-flex items-center gap-2.5 sm:left-9 sm:top-7"
      >
        <SlotlyMark priority className="h-7 w-auto" />
        <span className="font-display text-[26px] leading-none text-ink">Slotly</span>
      </Link>

      <div className="mx-auto grid min-h-dvh max-w-[1440px] grid-cols-1 lg:grid-cols-2">
        <div className="flex items-center justify-center px-6 pb-4 pt-24 lg:border-r lg:border-line lg:py-16">
          <SlotlyMark
            priority
            className="h-32 w-auto sm:h-40 lg:h-[46vh] lg:max-h-[420px] lg:min-h-[260px]"
          />
        </div>

        <div className="flex items-center justify-center px-6 pb-14 pt-6 lg:py-16">
          <div className="w-full max-w-[480px] rounded-2xl border border-line bg-surface p-7 shadow-[0_1px_2px_rgba(16,24,40,0.05),0_14px_36px_-14px_rgba(16,24,40,0.18)] sm:p-10">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
