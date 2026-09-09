import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Reveal } from '@/shared/ui/motion/reveal';
import { cn } from '@/shared/lib/cn';

export interface FeatureRow {
  eyebrow: string;
  title: string;
  body: string;
  bullets?: string[];
  icon: LucideIcon;
  visual: ReactNode;
}

/** Alternating text/visual rows — the workhorse layout for product pages. */
export function FeatureRows({ rows }: { rows: FeatureRow[] }) {
  return (
    <div className="space-y-24 md:space-y-32">
      {rows.map((row, index) => {
        const flipped = index % 2 === 1;
        return (
          <div
            key={row.title}
            className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20"
          >
            <Reveal className={cn(flipped && 'lg:order-2')}>
              <p className="eyebrow mb-5">
                <span aria-hidden className="h-px w-6 bg-gradient-to-r from-transparent to-brand-soft" />
                {row.eyebrow}
              </p>
              <h3 className="text-3xl font-semibold">{row.title}</h3>
              <p className="mt-5 text-lg leading-relaxed text-fg-muted">{row.body}</p>
              {row.bullets ? (
                <ul className="mt-7 space-y-3">
                  {row.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-3 text-sm text-fg-muted">
                      <span
                        aria-hidden
                        className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-soft"
                      />
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Reveal>
            <Reveal delay={0.1} className={cn(flipped && 'lg:order-1')}>
              {row.visual}
            </Reveal>
          </div>
        );
      })}
    </div>
  );
}
