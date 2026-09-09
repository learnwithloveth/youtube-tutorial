import type { Metadata } from 'next';

import { EarningsCalculator } from './_components/earnings-calculator';
import { ArrowRight, BarChart3, Banknote, Link2, Megaphone } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { DisclosureList } from '@/shared/ui/primitives/disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';

const PERKS = [
  { icon: Banknote, title: '45% revenue share', body: 'Of the trading fees your referrals generate, for the lifetime of the account. Not 12 months — lifetime.' },
  { icon: BarChart3, title: 'Attribution you can audit', body: 'Every click, signup and fill in a dashboard with a raw CSV export. No black-box attribution model.' },
  { icon: Link2, title: 'Deep links to any page', body: 'Send traffic to a specific market, the fee page, or a staking rate. Attribution survives the whole journey.' },
  { icon: Megaphone, title: 'Creative that is not embarrassing', body: 'Brand kit, screenshots, and copy written by the same team that wrote this page.' },
];

const TIERS = [
  { name: 'Standard', referrals: '1 – 24 active', share: '30%', payout: 'Monthly' },
  { name: 'Partner', referrals: '25 – 199 active', share: '40%', payout: 'Monthly' },
  { name: 'Elite', referrals: '200+ active', share: '45%', payout: 'Weekly' },
];

const AFFILIATE_FAQ = [
  { question: 'When and how do I get paid?', answer: 'Monthly in USDC or to a bank account, on the fifth working day, for the previous calendar month. Elite partners are paid weekly. There is no minimum threshold and no payout fee.' },
  { question: 'What counts as an active referral?', answer: 'An account that completed verification through your link and traded at least once in the trailing 30 days. Dormant accounts do not count towards your tier but you still earn on them if they trade again.' },
  { question: 'Can I run paid search on the Novex brand?', answer: 'No. Brand-term bidding is the one prohibited channel, because it bids up our own cost to acquire someone who was already looking for us. Everything else — content, video, newsletters, communities — is fair game.' },
  { question: 'Is there a cap?', answer: 'No cap on earnings and no cap on referrals. Our largest partner earned $412,000 last quarter, and we would very much like someone to beat that.' },
];

export const metadata: Metadata = {
  title: 'Affiliates',
  description:
    'Earn up to 45% of referred trading fees for life, paid monthly in USDC or fiat, with raw attribution data.',
};

export default function AffiliatesPage() {
  return (
    <>
      <PageHero
        eyebrow="Affiliates"
        title={
          <>
            Send us people you would
            <br />
            <span className="text-aurora">actually recommend.</span>
          </>
        }
        body="Up to 45% of the trading fees your referrals generate, for the lifetime of the account, with attribution data you can export and check yourself."
        actions={
          <>
            <ButtonLink href="/signup" size="lg" sheen>
              Join the programme
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="#calculator" variant="outline" size="lg">
              Estimate earnings
            </ButtonLink>
          </>
        }
      />

      <Section>
        <div className="shell">
          <StaggerGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PERKS.map((perk) => (
              <StaggerItem key={perk.title}>
                <InteractiveCard className="h-full p-6">
                  <perk.icon className="size-6 text-brand-soft" />
                  <h2 className="mt-5 font-display text-base font-semibold text-fg">{perk.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{perk.body}</p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <EarningsCalculator />


      <Section>
        <div className="shell">
          <SectionHeading eyebrow="Tiers" title="Three tiers, published rates" />
          <StaggerGroup className="mt-14 grid gap-4 md:grid-cols-3">
            {TIERS.map((tier) => (
              <StaggerItem key={tier.name}>
                <InteractiveCard className="h-full p-7">
                  <h3 className="font-display text-xl font-semibold text-fg">{tier.name}</h3>
                  <p className="mt-1 text-sm text-fg-subtle">{tier.referrals}</p>
                  <p className="mt-6 font-display text-5xl font-semibold text-brand-soft">
                    {tier.share}
                  </p>
                  <p className="mt-2 text-sm text-fg-muted">of trading fees, for life</p>
                  <p className="mt-6 border-t border-line pt-5 text-xs uppercase tracking-wider text-fg-subtle">
                    Paid {tier.payout.toLowerCase()}
                  </p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <SectionHeading
            align="left"
            eyebrow="Questions"
            title="The programme, in detail"
            className="lg:sticky lg:top-28 lg:self-start"
          />
          <Reveal delay={0.1}>
            <DisclosureList items={AFFILIATE_FAQ} />
          </Reveal>
        </div>
      </Section>

      <CtaBand
        title="Apply in about four minutes."
        body="No minimum audience. We approve on the quality of what you make, not on follower count."
        primary={{ label: 'Apply now', href: '/signup' }}
        secondary={{ label: 'Ask a question', href: '/contact' }}
      />
    </>
  );
}
