import type { ReactNode } from 'react';
import { Aurora } from '@/shared/ui/visuals/aurora';
import { AnimatedHeading } from '@/shared/ui/motion/animated-heading';
import { Reveal } from '@/shared/ui/motion/reveal';
import { cn } from '@/shared/lib/cn';

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}

/**
 * Shared inner-page hero. Keeps every non-home surface visually consistent.
 *
 * A Server Component: only `AnimatedHeading` hydrates, so a page's hero copy,
 * eyebrow and call-to-action all arrive as HTML.
 */
export function PageHero({
  eyebrow,
  title,
  body,
  actions,
  aside,
  align = 'center',
  className,
}: PageHeroProps) {
  const centered = align === 'center' && !aside;
  return (
    <section className={cn('relative isolate -mt-18 overflow-hidden pb-10 pt-30 md:pb-14 md:pt-34', className)}>
      <Aurora grid />
      <div
        className={cn(
          'shell',
          aside ? 'grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]' : '',
        )}
      >
        <div className={cn(centered && 'mx-auto max-w-3xl text-center')}>
          <Reveal>
            <p className={cn('eyebrow mb-6', centered && 'justify-center')}>
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              {eyebrow}
            </p>
          </Reveal>
          <AnimatedHeading className="text-5xl font-semibold">{title}</AnimatedHeading>
          {body ? (
            <Reveal delay={0.12}>
              <p
                className={cn(
                  'mt-6 text-lg leading-relaxed text-fg-muted',
                  centered ? 'mx-auto max-w-2xl' : 'max-w-xl',
                )}
              >
                {body}
              </p>
            </Reveal>
          ) : null}
          {actions ? (
            <Reveal delay={0.2}>
              <div className={cn('mt-9 flex flex-wrap items-center gap-3', centered && 'justify-center')}>
                {actions}
              </div>
            </Reveal>
          ) : null}
        </div>
        {aside ? <Reveal delay={0.18}>{aside}</Reveal> : null}
      </div>
    </section>
  );
}
