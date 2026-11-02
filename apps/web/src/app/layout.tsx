import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TestModeBanner } from '@/components/test-mode-banner';
import { publicConfig } from '@/lib/config';

export const metadata: Metadata = {
  title: {
    default: 'Couchlist — find a good place to watch or read',
    template: '%s · Couchlist',
  },
  description:
    'A community directory of websites for watching and reading, plus guides for getting them working.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  appleWebApp: { capable: true, title: 'Couchlist', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#1c1d22',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { testMode } = publicConfig();

  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-text antialiased">
        {testMode ? <TestModeBanner /> : null}
        {/* Keyboard users reach the list without tabbing the whole header. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-pill focus:bg-selected focus:px-4 focus:py-2 focus:text-selected-fg"
        >
          Skip to content
        </a>
        {/*
          * cl-shell carries the device's safe areas.
          *
          * The app asks for viewport-fit=cover and a translucent status bar,
          * which together put the page underneath the clock and the battery.
          * That is the right choice — the background should run to the edge of
          * the screen — but only if something then keeps the content out from
          * under them, which is what this does. Without it the header sits
          * behind the status bar on any phone with a notch or an island.
          */}
        <div className="cl-shell mx-auto max-w-[1040px]">
          <div className="overflow-hidden rounded-[20px] border border-line bg-bg">{children}</div>
        </div>
      </body>
    </html>
  );
}
