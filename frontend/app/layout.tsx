import type { Metadata } from 'next';
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

// Self-hosted at build time by next/font — no runtime request to a font CDN.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

const display = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Slotly — Book appointments by chat or form',
  description:
    'Book an appointment by describing it in plain language, or fill in the form yourself.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
