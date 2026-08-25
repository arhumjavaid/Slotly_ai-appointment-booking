import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-5">
      <header className="py-6">
        <Link href="/" className="font-display text-[22px] leading-none text-ink">
          Slotly
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center pt-6 sm:pt-16">
        <div className="w-full max-w-[380px] pb-16">{children}</div>
      </main>
    </div>
  );
}
