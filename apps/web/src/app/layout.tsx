import type { Metadata } from 'next';
import './globals.css';
import { MobileNav } from '@/components/mobile-nav';
import { TestModeBanner } from '@/components/test-mode-banner';
import { publicConfig } from '@/lib/config';

export const metadata: Metadata = {
  title: 'Couchlist',
  description: 'Track what your friends watch.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { testMode } = publicConfig();

  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans text-text-primary antialiased">
        {testMode ? <TestModeBanner /> : null}
        <div className="pb-16 sm:pb-0">{children}</div>
        <MobileNav />
      </body>
    </html>
  );
}
