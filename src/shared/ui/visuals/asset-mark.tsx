import Image from 'next/image';

import { cn } from '@/shared/lib/cn';

import { assetLogoFor } from './asset-logos';

/**
 * Token avatar.
 *
 * ── The logo when there is one, the letter when there is not ──────────────────
 * Assets this application ships a logo for are drawn from it; the rest keep the
 * lettered badge built from the asset's brand hue. Both are resolved from the
 * symbol, so no caller has to know which case it is in — and an asset listed
 * tomorrow renders correctly before anybody finds a logo for it.
 *
 * The badge was the only option for a long time, for reasons that still hold where
 * it is used: zero network requests, correct in both themes, and immune to one
 * missing file turning a whole price table into broken-image icons.
 *
 * ── Why `next/image` here, when the console uses a plain `<img>` ──────────────
 * Those images are private bytes behind a session — putting them through the
 * optimiser would cache them by URL, across sessions. These are public files in
 * `public/`, so the optimiser is free to do its job: a 64px bitmap becomes AVIF or
 * WebP at the density the screen actually needs. Animated files, which `bitcoin.gif`
 * is, Next detects and passes through untouched.
 *
 * ── Clipped to a circle ───────────────────────────────────────────────────────
 * Some of these files are transparent circles and some are opaque squares.
 * `overflow-hidden` with `object-cover` makes both render as the same disc, so a
 * table of them lines up whatever the source was.
 */
export function AssetMark({
  symbol,
  glyph,
  hue,
  size = 'md',
  className,
}: {
  symbol: string;
  glyph: string;
  hue: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dimension =
    size === 'sm' ? 'size-8 text-sm' : size === 'lg' ? 'size-14 text-2xl' : 'size-10 text-base';

  const logo = assetLogoFor(symbol);

  if (logo !== null) {
    return (
      <span
        aria-hidden
        data-symbol={symbol}
        className={cn(
          'relative grid shrink-0 place-items-center overflow-hidden rounded-full',
          // A neutral disc behind the file, because most of them are transparent
          // outside their own mark and a brand-coloured one underneath would tint
          // the edges of its own logo.
          'bg-surface ring-1 ring-inset ring-line',
          dimension,
          className,
        )}
      >
        <Image
          src={logo}
          alt=""
          width={64}
          height={64}
          // Decorative: every place this appears prints the symbol beside it, so
          // the alt text would be the same word read twice.
          className="size-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'relative grid shrink-0 place-items-center rounded-full font-semibold text-white',
        'ring-1 ring-inset ring-white/25',
        dimension,
        className,
      )}
      style={{
        background: `radial-gradient(120% 120% at 30% 20%, color-mix(in oklab, ${hue} 92%, white 18%), ${hue} 70%)`,
        boxShadow: `0 6px 22px -10px ${hue}`,
      }}
      data-symbol={symbol}
    >
      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]">{glyph}</span>
    </span>
  );
}
