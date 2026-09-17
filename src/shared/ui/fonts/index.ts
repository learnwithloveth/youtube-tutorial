import localFont from 'next/font/local';

/**
 * Typography, self-hosted through `next/font`.
 *
 * `next/font/local` writes the `@font-face` rules for these files, fingerprints
 * and preloads them, and generates a size-adjusted fallback metric so the swap
 * from fallback to real face does not shift layout. That last part is the reason
 * to do this rather than keep hand-written CSS: `font-display: swap` alone trades
 * a flash of invisible text for a flash of *reflow*, which on a page of price
 * tables is worse.
 *
 * Each family exposes a CSS variable; `tokens.css` binds the design's
 * `--font-display` / `--font-sans` / `--font-mono` tokens to them, so component
 * code keeps referring to the tokens and never to a font name.
 *
 * ── Two of the three are variable fonts ─────────────────────────────────────
 * Gabarito and Figtree each ship as ONE file covering their whole weight axis,
 * declared with a weight *range*. Requesting several weights of a variable family
 * from Google returns byte-identical copies of the same file, so listing them per
 * weight would multiply the payload for nothing — and a range lets the browser
 * render any weight in between, including ones no component asks for yet.
 * IBM Plex Mono is static, so it genuinely is one file per weight.
 *
 * Latin subsets only, served from this origin: no third-party request on the
 * critical path and no referrer sent to a font CDN.
 */

export const displayFont = localFont({
  src: './gabarito-variable.woff2',
  weight: '400 900',
  style: 'normal',
  variable: '--font-display-family',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

export const sansFont = localFont({
  src: './figtree-variable.woff2',
  weight: '300 900',
  style: 'normal',
  variable: '--font-sans-family',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

export const monoFont = localFont({
  src: [
    { path: './plex-mono-400.woff2', weight: '400', style: 'normal' },
    { path: './plex-mono-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono-family',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

/** Applied to <html> so the variables are in scope for every token. */
export const fontVariables = `${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`;
