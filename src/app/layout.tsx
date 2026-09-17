import type { Metadata, Viewport } from 'next';

import { BRAND } from '@/modules/content';
import { fontVariables } from '@/shared/ui/fonts';

import { PresenceReporter } from './_providers/presence-reporter';
import { ThemeProvider } from './_providers/theme-provider';
import { ThemeScript } from './_providers/theme-script';
import './globals.css';

/**
 * Root layout.
 *
 * The design's `useSeo` hook wrote `document.title` and its meta tags from an
 * effect, which is the only option in a client-rendered SPA and is worth nothing
 * for sharing or search: a crawler or an unfurler reads the HTML it is served
 * and does not run effects. The Metadata API below emits the same tags into the
 * server-rendered document instead. Same contract — title composition,
 * description, OG/Twitter parity — resolved before the response is sent.
 */

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://novex.io';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    // Mirrors the design's `<page> — NOVEX` composition; pages set only their
    // own half, and `absolute` opts out where a page wants full control.
    default: `${BRAND.name} — ${BRAND.tagline}`,
    template: `%s — ${BRAND.name}`,
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  openGraph: {
    type: 'website',
    siteName: BRAND.name,
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND.name} — ${BRAND.tagline}`,
    description: BRAND.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#04120d' },
    { media: '(prefers-color-scheme: light)', color: '#f5faf7' },
  ],
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={fontVariables}
      /* The design sets `scroll-behavior: smooth` globally. Next 16 no longer
         overrides that during navigation unless asked, and without the override
         a route change animates a long scroll to the top instead of jumping. */
      data-scroll-behavior="smooth"
      /* ThemeScript mutates this element before React hydrates — see its docs. */
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Mounted at the root so every route reports, including the marketing
            pages — most visitors to an exchange are signed out, and a live board
            that only counted logged-in ones would answer the wrong question. It
            renders nothing and reads nothing from the tree, so it stays a leaf. */}
        <PresenceReporter />
      </body>
    </html>
  );
}
