import { Quote, Star } from 'lucide-react';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { cn } from '@/shared/lib/cn';
import { Glow } from '@/shared/ui/visuals/aurora';

const REVIEWS = [
  {
    quote:
      'We moved our treasury execution to Novex after benchmarking fills against three venues for a quarter. Slippage on size dropped 38 basis points. That is the whole story.',
    name: 'Amara Okonkwo',
    role: 'Head of Treasury, Meridian Capital',
    initials: 'AO',
    hue: '#8B5CF6',
  },
  {
    quote:
      'The API is the first exchange API I have read end to end without opening a support ticket. Idempotency keys on every mutation. Someone there has actually run a payments system.',
    name: 'Daniel Reyes',
    role: 'Staff Engineer, Loop Payments',
    initials: 'DR',
    hue: '#22D3EE',
  },
  {
    quote:
      'I check the proof-of-reserves page more than I check my portfolio. Being able to verify my own balance against the Merkle root is the reason I stayed.',
    name: 'Sofia Lindqvist',
    role: 'Independent trader',
    initials: 'SL',
    hue: '#E879F9',
  },
  {
    quote:
      'Recurring buys, staking and self-custody in one place meant I could finally delete four apps. My mother uses it now, which is the real benchmark.',
    name: 'Tolu Adeyemi',
    role: 'Product designer',
    initials: 'TA',
    hue: '#34D399',
  },
];

export function Testimonials({ tone = 'default' }: { tone?: 'default' | 'sunken' }) {
  return (
    <Section tone={tone} className="overflow-hidden">
      <Glow className="-bottom-32 -left-24" size={640} opacity={0.2} color="var(--accent)" />
      <div className="shell">
        <SectionHeading
          eyebrow="Proof"
          title="41 million people. 4.9 stars. One order book."
          body="Rated by traders, treasurers and the engineers who integrate against us."
        />

        <StaggerGroup className="mt-16 grid gap-4 md:grid-cols-2">
          {REVIEWS.map((review) => (
            <StaggerItem key={review.name}>
              <InteractiveCard className="h-full p-7">
                <Quote aria-hidden className="size-7 text-brand-soft/50" />
                <blockquote className="mt-5 text-[0.95rem] leading-relaxed text-fg">
                  {review.quote}
                </blockquote>
                <div className="mt-7 flex items-center gap-3.5 border-t border-line pt-5">
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white ring-1 ring-inset ring-white/20"
                    style={{ background: `linear-gradient(140deg, ${review.hue}, color-mix(in oklab, ${review.hue} 45%, #05060b))` }}
                  >
                    {review.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">{review.name}</p>
                    <p className="truncate text-xs text-fg-subtle">{review.role}</p>
                  </div>
                  <div className="ml-auto flex gap-0.5" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }, (_, i) => (
                      <Star key={i} className={cn('size-3.5 fill-warn text-warn')} />
                    ))}
                  </div>
                </div>
              </InteractiveCard>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </Section>
  );
}
