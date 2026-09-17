import type { MetadataRoute } from 'next';

import { BRAND } from '@/modules/content';

import { CONSOLE_APP } from '../../_lib/console-app';

/**
 * The console's web app manifest: what makes it installable.
 *
 * ── Not `app/manifest.ts` ─────────────────────────────────────────────────────
 * Next links that file from every page, which would make the customer site
 * installable too. This one is linked only from the console's layout — see
 * `_lib/console-app.ts`.
 *
 * ── Served outside `/admin`, on purpose ───────────────────────────────────────
 * A browser fetches a manifest, and the icons it names, without cookies. Under
 * `/admin` the proxy would answer with a redirect to the login page, the browser
 * would find HTML where it expected JSON, and the install option would simply
 * never appear. Nothing in it is private.
 *
 * Static: nothing here varies by request, and `BRAND` is fixed at build time.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  const manifest: MetadataRoute.Manifest = {
    // The app's identity. Kept stable: a different id is a different app, which
    // an operator would have to install again.
    id: CONSOLE_APP.scope,
    name: `${BRAND.name} Console`,
    short_name: 'Console',
    description: `The operations console for ${BRAND.name}.`,
    start_url: CONSOLE_APP.scope,
    scope: CONSOLE_APP.scope,
    display: 'standalone',
    // The dark theme's page colour (`--bg` in tokens.css), so opening the app is
    // not a white flash before the console paints.
    background_color: '#04120d',
    theme_color: '#04120d',
    // Drawn from `public/logo.png` by `pnpm icons:generate`. The maskable one has
    // the logo inset, because a platform that crops icons to its own shape keeps
    // only the centre.
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };

  return Response.json(manifest, {
    headers: { 'content-type': 'application/manifest+json' },
  });
}
