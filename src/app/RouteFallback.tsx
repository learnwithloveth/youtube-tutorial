import { LogoMark } from '@/components/visuals/Logo';

/** Shown while a lazy route chunk streams in. Deliberately quiet. */
export function RouteFallback() {
  return (
    <div className="grid min-h-[70dvh] place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-11 animate-pulse" />
        <span className="sr-only">Loading</span>
        <span className="h-px w-24 overflow-hidden bg-line">
          <span className="block h-px w-1/3 animate-[marquee_1.2s_linear_infinite] bg-brand-soft" />
        </span>
      </div>
    </div>
  );
}
