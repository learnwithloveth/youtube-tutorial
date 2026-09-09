import localFont from 'next/font/local';

/**
 * Typography, self-hosted through `next/font`.
 *
 * The design shipped eight `.woff2` files and hand-written `@font-face` rules.
 * `next/font/local` replaces the rules — same files, same latin subsets, but it
 * also fingerprints and preloads them, and generates a size-adjusted fallback
 * metric so the swap from fallback to real face does not shift layout. That last
 * part is the reason to do this rather than keep the CSS: `font-display: swap`
 * alone trades a flash of invisible text for a flash of *reflow*, which on a
 * page of price tables is worse.
 *
 * Each family exposes a CSS variable; `tokens.css` binds the design's
 * `--font-display` / `--font-sans` / `--font-mono` tokens to them, so component
 * code keeps referring to the tokens and never to a font name.
 */

export const displayFont = localFont({
  src: [
    { path: './sora-400.woff2', weight: '400', style: 'normal' },
    { path: './sora-600.woff2', weight: '600', style: 'normal' },
    { path: './sora-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display-family',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

export const sansFont = localFont({
  src: [
    { path: './inter-400.woff2', weight: '400', style: 'normal' },
    { path: './inter-500.woff2', weight: '500', style: 'normal' },
    { path: './inter-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-sans-family',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
});

export const monoFont = localFont({
  src: [
    { path: './mono-400.woff2', weight: '400', style: 'normal' },
    { path: './mono-500.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono-family',
  display: 'swap',
  fallback: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
});

/** Applied to <html> so the variables are in scope for every token. */
export const fontVariables = `${displayFont.variable} ${sansFont.variable} ${monoFont.variable}`;
