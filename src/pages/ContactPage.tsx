import { useState } from 'react';
import { Building2, Check, LifeBuoy, Mail, MessageSquare, Newspaper, ShieldAlert } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { Button } from '@/design-system/primitives/Button';
import { SelectField, TextAreaField, TextField } from '@/design-system/primitives/Field';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { BRAND } from '@/data/brand';
import { useSeo } from '@/lib/seo';

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

export default function ContactPage() {
  useSeo({
    title: 'Contact',
    description:
      'Reach Novex support, the institutional desk, press or the security team. 24/7 chat with a 90-second median first reply.',
  });

  const [sent, setSent] = useState(false);

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
                <Card interactive className="h-full p-6">
                  <channel.icon className="size-6 text-brand-soft" />
                  <h2 className="mt-5 font-display text-base font-semibold text-fg">
                    {channel.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{channel.body}</p>
                  <p className="mt-4 break-all font-mono text-xs text-accent">{channel.action}</p>
                </Card>
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

            <form
              className="mt-10 space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                setSent(true);
              }}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Full name" name="name" autoComplete="name" required placeholder="Ada Lovelace" />
                <TextField label="Email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" />
              </div>
              <SelectField
                label="What is this about?"
                name="topic"
                options={[
                  { value: 'support', label: 'Account or trading support' },
                  { value: 'institutional', label: 'Institutional & OTC' },
                  { value: 'api', label: 'API and integrations' },
                  { value: 'press', label: 'Press enquiry' },
                  { value: 'security', label: 'Security disclosure' },
                  { value: 'other', label: 'Something else' },
                ]}
              />
              <TextAreaField
                label="Message"
                name="message"
                required
                placeholder="Tell us what you need. Please do not include passwords, 2FA codes or private keys."
                hint="Never share credentials. Novex staff will never ask for them."
              />
              <Button type="submit" size="lg" sheen className="w-full sm:w-auto">
                {sent ? (
                  <>
                    <Check className="size-4" />
                    Message sent
                  </>
                ) : (
                  <>
                    <MessageSquare className="size-4" />
                    Send message
                  </>
                )}
              </Button>
              <p aria-live="polite" className="text-sm text-up">
                {sent ? 'Thanks — we will reply within one business day.' : ''}
              </p>
            </form>
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
