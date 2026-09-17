import Image from 'next/image';

import { BRAND } from '@/modules/content';
import { cn } from '@/shared/lib/cn';

/**
 * The site's mark, and the mark with the name beside it.
 *
 * ── A file, not a drawing ────────────────────────────────────────────────────
 * The mark is `public/logo.png`. It replaced an inline SVG prism whose gradients
 * had to be defined once in the root layout as a shared sprite, because `useId` is
 * unavailable in Server Components; an image needs none of that, so the sprite is
 * gone with it. Both components are still Server Components and ship no JavaScript.
 *
 * `unoptimized` because the file is a few hundred bytes already. The optimiser would
 * add a round trip to `/_next/image` to return something no smaller.
 *
 * ── The name can be any length ───────────────────────────────────────────────
 * It comes from `WEBSITE_NAME`, not from the design, so the wordmark truncates with
 * an ellipsis rather than pushing a header's buttons off a phone screen. The full
 * name stays in the `title`, and in the link label wherever the lockup is a link.
 */

const LOGO_SRC = '/logo.png';
/** The file's own pixel size. How large it renders is the caller's `className`. */
const LOGO_PIXELS = 64;

export function LogoMark({
  className,
  decorative = false,
}: {
  className?: string;
  /** For a mark with the name already written beside it, which would otherwise be read twice. */
  decorative?: boolean;
}) {
  return (
    <Image
      src={LOGO_SRC}
      alt={decorative ? '' : BRAND.name}
      width={LOGO_PIXELS}
      height={LOGO_PIXELS}
      unoptimized
      // Eager: it sits at the top of nearly every page, and lazy loading an image in
      // the header only adds a moment where the header has no logo. One small file,
      // cached after the first page.
      loading="eager"
      draggable={false}
      className={cn('size-9 shrink-0 select-none', className)}
    />
  );
}

export function Wordmark({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-2.5', className)}>
      <LogoMark decorative className={markClassName} />
      <span
        title={BRAND.name}
        className="min-w-0 truncate font-display text-[1.15rem] font-bold tracking-[-0.04em] text-fg"
      >
        {BRAND.wordmark}
      </span>
    </span>
  );
}
