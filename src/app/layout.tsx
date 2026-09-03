import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui';
import { ServiceWorkerRegistrar } from '@/components/service-worker';

export const metadata: Metadata = {
  title: 'NOOKAA POS',
  description: 'Point of sale and store operations for NOOKAA — Beverages & Beyond.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'NOOKAA POS' },
};

export const viewport: Viewport = {
  themeColor: '#1A1512',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * Type pairing:
 *  Fraunces      — display. NOOKAA's menu book is set in an editorial serif;
 *                  it appears here only on titles and the wordmark.
 *  Inter Tight   — UI. Narrower than Inter, which buys two more characters per
 *                  product tile without dropping to a smaller size.
 *  JetBrains Mono— every number. Order ids, money, cup ids and the brew clock
 *                  share one tabular family so figures never re-flow.
 *
 * Loaded by link rather than next/font so the build never depends on reaching
 * Google. Swap to next/font/google (or self-host) for production if preferred.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter+Tight:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root{
              --font-display:'Fraunces',Georgia,serif;
              --font-sans:'Inter Tight',system-ui,-apple-system,sans-serif;
              --font-mono:'JetBrains Mono',ui-monospace,monospace;
            }`,
          }}
        />
      </head>
      <body>
        {children}
        <Toaster />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
