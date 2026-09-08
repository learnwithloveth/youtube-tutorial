import { BadgeCheck, CreditCard, TrendingUp, UserPlus } from 'lucide-react';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';

const STEPS = [
  { icon: UserPlus, title: 'Create your account', body: 'Email, password, done. Roughly 40 seconds.', meta: 'Step 01' },
  { icon: BadgeCheck, title: 'Verify once', body: 'Automated ID checks clear in under two minutes for 94% of applicants.', meta: 'Step 02' },
  { icon: CreditCard, title: 'Fund instantly', body: 'Card, bank transfer or on-chain deposit in 46 currencies.', meta: 'Step 03' },
  { icon: TrendingUp, title: 'Trade or earn', body: 'Buy 340+ assets, set a recurring buy, or stake for yield.', meta: 'Step 04' },
];

export function HowItWorks() {
  return (
    <Section tone="sunken">
      <div className="shell">
        <SectionHeading
          eyebrow="Getting started"
          title="From signup to your first trade in 90 seconds"
          body="No paperwork queues, no waiting on a human to approve you, no minimum deposit."
        />

        <StaggerGroup className="relative mt-16 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {/* Connector rail — decorative, desktop only. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-12 top-[2.4rem] hidden h-px bg-gradient-to-r from-transparent via-line-strong to-transparent lg:block"
          />
          {STEPS.map((step) => (
            <StaggerItem key={step.title} className="relative">
              <div className="relative">
                <span className="relative z-10 grid size-[4.5rem] place-items-center rounded-full border border-line bg-bg-elev text-brand-soft shadow-card">
                  <step.icon className="size-6" />
                </span>
                <p className="mt-6 font-mono text-2xs uppercase tracking-[0.18em] text-fg-subtle">
                  {step.meta}
                </p>
                <h3 className="mt-2 font-display text-lg font-semibold text-fg">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
              </div>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </Section>
  );
}
