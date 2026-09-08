import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Reveal } from '@/design-system/motion/Reveal';

export function Section({
  id,
  className,
  children,
  tone = 'default',
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  tone?: 'default' | 'sunken';
}) {
  return (
    <section
      id={id}
      className={cn(
        'relative isolate py-16 md:py-22 lg:py-26',
        tone === 'sunken' && 'bg-bg-sunken/60',
        className,
      )}
    >
      {children}
    </section>
  );
}

interface HeadingProps {
  eyebrow?: string;
  title: ReactNode;
  body?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
  children?: ReactNode;
}

export function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
  className,
  children,
}: HeadingProps) {
  return (
    <Reveal
      className={cn(
        'max-w-3xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow ? (
        <p className="eyebrow mb-5">
          <span aria-hidden className="h-px w-6 bg-gradient-to-r from-transparent to-brand-soft" />
          {eyebrow}
        </p>
      ) : null}
      <h2 className="text-4xl font-semibold">{title}</h2>
      {body ? <p className="mt-5 text-lg leading-relaxed text-fg-muted">{body}</p> : null}
      {children ? <div className="mt-8">{children}</div> : null}
    </Reveal>
  );
}
