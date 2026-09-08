import { useState } from 'react';
import { ArrowRight, Building2, Check, FileText, Landmark, Network, ShieldCheck, Users } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { Button, ButtonLink } from '@/design-system/primitives/Button';
import { SelectField, TextField } from '@/design-system/primitives/Field';
import { CountUp } from '@/design-system/primitives/CountUp';
import { DisclosureList } from '@/design-system/primitives/Disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { LogoCloud } from '@/components/sections/LogoCloud';
import { useSeo } from '@/lib/seo';

const SERVICES = [
  { icon: Network, title: 'OTC block trading', body: 'Two-way pricing in size on 120 pairs, quoted by a human desk in under 60 seconds, settled the same day.' },
  { icon: Landmark, title: 'Prime custody', body: 'Segregated, bankruptcy-remote custody with quorum withdrawal policies you configure and we enforce.' },
  { icon: ShieldCheck, title: 'Regulatory reporting', body: 'MiFID II, EMIR and Travel Rule reporting generated automatically from your fill history.' },
  { icon: Users, title: 'Sub-account structures', body: 'Unlimited sub-accounts with per-desk limits, independent API keys and consolidated reporting.' },
  { icon: FileText, title: 'Credit and settlement', body: 'T+1 settlement lines for approved counterparties, with real-time exposure monitoring.' },
  { icon: Building2, title: 'Dedicated coverage', body: 'A named relationship manager, a named risk contact and a named engineer. All reachable directly.' },
];

const INSTITUTIONAL_FAQ = [
  { question: 'What is the minimum ticket for the OTC desk?', answer: 'Two hundred and fifty thousand dollars notional. Below that, the aggregated order book almost always gives a better outcome than a quoted block, and we will tell you so.' },
  { question: 'How is custody structured?', answer: 'Client assets are held in segregated wallets under a Swiss custody entity that is bankruptcy-remote from the trading entity. Withdrawal policies — quorum size, allow-lists, time locks — are configured by you and enforced by policy engine, not by an operator.' },
  { question: 'Do you support FIX?', answer: 'FIX 4.4 with a dedicated session per sub-account, cross-connect available in LD4, NY4, TY3 and SG1. Certification typically takes two business days.' },
  { question: 'What are the reporting formats?', answer: 'CSV, Parquet and JSON over SFTP or S3, plus native MiFID II RTS 22 and EMIR REFIT submissions. Custom schemas are supported for anything you already run internally.' },
];

export default function InstitutionalPage() {
  useSeo({
    title: 'Institutional & OTC',
    description:
      'Block liquidity, prime custody, FIX 4.4 connectivity and regulatory reporting for funds, treasuries and market makers.',
  });

  const [sent, setSent] = useState(false);

  return (
    <>
      <PageHero
        eyebrow="Institutional"
        title={
          <>
            Size, without
            <br />
            <span className="text-aurora">the signalling.</span>
          </>
        }
        body="Block liquidity from a human desk, bankruptcy-remote custody, FIX connectivity and reporting that satisfies your compliance team without a spreadsheet in the middle."
        align="left"
        actions={
          <>
            <ButtonLink to="#enquiry" size="lg" sheen>
              Talk to the desk
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink to="/developers" variant="outline" size="lg">
              API documentation
            </ButtonLink>
          </>
        }
        aside={
          <Card className="p-8">
            <p className="eyebrow mb-7">Desk at a glance</p>
            <dl className="grid grid-cols-2 gap-7">
              {[
                { label: 'Assets under custody', value: 184, prefix: '$', suffix: 'B' },
                { label: 'Median quote time', value: 47, suffix: 's' },
                { label: 'Pairs quoted in size', value: 120 },
                { label: 'Settlement', value: 1, prefix: 'T+' },
              ].map((stat) => (
                <div key={stat.label}>
                  <dd className="font-display text-3xl font-semibold text-fg">
                    <CountUp value={stat.value} prefix={stat.prefix ?? ''} suffix={stat.suffix ?? ''} />
                  </dd>
                  <dt className="mt-1.5 text-2xs uppercase tracking-wider text-fg-subtle">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
            <p className="mt-8 border-t border-line pt-6 text-sm leading-relaxed text-fg-muted">
              Minimum ticket $250,000. Below that the aggregated book usually beats a block, and we
              will say so.
            </p>
          </Card>
        }
      />

      <Section>
        <div className="shell">
          <SectionHeading
            eyebrow="Services"
            title="What the desk actually does"
            body="Six services, each owned by a named person you can call. No ticketing system between you and a decision."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((service) => (
              <StaggerItem key={service.title}>
                <Card interactive className="h-full p-6">
                  <service.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">
                    {service.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{service.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <LogoCloud label="Counterparties, custodians and prime partners" />

      <Section id="enquiry" tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          <SectionHeading
            align="left"
            eyebrow="Get in touch"
            title="Onboarding takes about a week"
            body="KYB documentation, a call with risk, and a FIX certification session. We will tell you on the first call whether we are the right venue for your flow."
            className="lg:sticky lg:top-28 lg:self-start"
          >
            <ul className="space-y-3">
              {[
                'Named relationship manager from day one',
                'Two-day FIX certification',
                'Credit lines for approved counterparties',
                'No exclusivity or minimum volume commitment',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-fg-muted">
                  <Check className="size-4 shrink-0 text-up" />
                  {item}
                </li>
              ))}
            </ul>
          </SectionHeading>

          <Reveal delay={0.1}>
            <Card className="p-8">
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setSent(true);
                }}
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField label="Full name" name="name" required autoComplete="name" placeholder="Ada Lovelace" />
                  <TextField label="Work email" name="email" type="email" required autoComplete="email" placeholder="you@fund.com" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <TextField label="Firm" name="firm" required placeholder="Meridian Capital" />
                  <SelectField
                    label="Firm type"
                    name="type"
                    options={[
                      { value: 'fund', label: 'Hedge fund / asset manager' },
                      { value: 'mm', label: 'Market maker' },
                      { value: 'treasury', label: 'Corporate treasury' },
                      { value: 'family', label: 'Family office' },
                      { value: 'bank', label: 'Bank / broker' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                </div>
                <SelectField
                  label="Expected monthly volume"
                  name="volume"
                  options={[
                    { value: '1-10', label: '$1M – $10M' },
                    { value: '10-50', label: '$10M – $50M' },
                    { value: '50-250', label: '$50M – $250M' },
                    { value: '250+', label: '$250M+' },
                  ]}
                />
                <SelectField
                  label="Primary interest"
                  name="interest"
                  options={[
                    { value: 'otc', label: 'OTC block trading' },
                    { value: 'custody', label: 'Prime custody' },
                    { value: 'api', label: 'FIX / API connectivity' },
                    { value: 'reporting', label: 'Regulatory reporting' },
                  ]}
                />
                <Button type="submit" size="lg" sheen className="w-full">
                  {sent ? (
                    <>
                      <Check className="size-4" />
                      Request received
                    </>
                  ) : (
                    'Request a call'
                  )}
                </Button>
                <p aria-live="polite" className="text-center text-sm text-up">
                  {sent ? 'The desk will reach out within one business day.' : ''}
                </p>
                <p className="text-center text-xs text-fg-subtle">
                  We will only use these details to respond to your enquiry.
                </p>
              </form>
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section>
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <SectionHeading
            align="left"
            eyebrow="Questions"
            title="What desks ask first"
            className="lg:sticky lg:top-28 lg:self-start"
          />
          <Reveal delay={0.1}>
            <DisclosureList items={INSTITUTIONAL_FAQ} />
          </Reveal>
        </div>
      </Section>
    </>
  );
}
