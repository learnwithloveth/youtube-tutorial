import { cn } from '@/lib/cn';

/**
 * Token avatar. Rendered from the asset's brand hue rather than a remote image:
 * zero network requests, perfect in both themes, and immune to CDN outages.
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
  const dimension = size === 'sm' ? 'size-8 text-sm' : size === 'lg' ? 'size-14 text-2xl' : 'size-10 text-base';
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
