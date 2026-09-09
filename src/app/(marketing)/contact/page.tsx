import { Building2, LifeBuoy, Mail, Newspaper, ShieldAlert } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { Card } from '@/shared/ui/primitives/card';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { BRAND } from '@/modules/content';
import type { Metadata } from 'next';

import { ContactForm } from './_components/contact-form';

const CHANNELS = [
  { icon: LifeBuoy, title: 'Account support', body: '24/7 in-app chat with a 90-second median first reply.', action: 'Open chat in the app' },
  { icon: Building2, title: 'Institutional desk', body: 'Block liquidity, prime custody and OTC pricing.', action: 'institutional@novex.io' },
  { icon: Newspaper, title: 'Press', body: 'Interviews, data requests and the press kit.', action: BRAND.press },
  { icon: ShieldAlert, title: 'Security disclosure', body: 'Bounties up to $2M. PGP key on the security page.', action: 'security@novex.io' },
];

const OFFICES = [
  { city: 'Zurich', line1: 'Bahnhofstrasse 42', line2: '8001 Zurich, Switzerland', note: 'Registered office' },
  { city: 'Singapore', line1: '9 Battery Road, Level 21', line2: 'Singapore 049910', note: 'APAC headquarters' },
  { city: 'Lagos', line1: '17 Kingsway Road, Ikoyi', line2: 'Lagos, Nigeria', note: 'Engineering hub' },
];

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Reach Novex support, the institutional desk, the press office or the security team.',
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        eyebrow="Contact"
        title={
          <>
            Talk to a <span className="text-aurora">human.</span>
          </>
        }
        body="Support is staffed around the clock in eleven languages. Everything else routes to a named team, not a shared inbox that nobody owns."
      />

      <Section className="pt-0">
        <div className="shell">
          <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CHANNELS.map((channel) => (
              <StaggerItem key={channel.title}>
                <InteractiveCard className="h-full p-6">
                  <channel.icon className="size-6 text-brand-soft" />
                  <h2 className="mt-5 font-display text-base font-semibold text-fg">
                    {channel.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{channel.body}</p>
                  <p className="mt-4 break-all font-mono text-xs text-accent">{channel.action}</p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
          <Reveal>
            <SectionHeading
              align="left"
              eyebrow="Send a message"
              title="We read every one of these"
              body="Expect a reply within one business day. Account-specific questions are faster through in-app chat, where we can see your account without you pasting anything sensitive."
            />

            <ContactForm />
          </Reveal>

          <div className="space-y-4">
            <Reveal>
              <Card className="p-7">
                <Mail className="size-6 text-brand-soft" />
                <h3 className="mt-5 font-display text-lg font-semibold text-fg">General enquiries</h3>
                <p className="mt-2 font-mono text-sm text-accent">{BRAND.support}</p>
                <p className="mt-4 text-sm leading-relaxed text-fg-muted">
                  Monitored 24/7. For anything touching your balance, use in-app chat so we can
                  verify you without sharing details over email.
                </p>
              </Card>
            </Reveal>

            {OFFICES.map((office, i) => (
              <Reveal key={office.city} delay={0.06 * (i + 1)}>
                <Card className="p-6">
                  <p className="font-mono text-2xs uppercase tracking-[0.18em] text-fg-subtle">
                    {office.note}
                  </p>
                  <h3 className="mt-2 font-display text-lg font-semibold text-fg">{office.city}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">
                    {office.line1}
                    <br />
                    {office.line2}
                  </p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}
