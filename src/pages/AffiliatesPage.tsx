import { useMemo, useState } from 'react';
import { ArrowRight, BarChart3, Banknote, Check, Link2, Megaphone } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { Badge } from '@/design-system/primitives/Badge';
import { ButtonLink } from '@/design-system/primitives/Button';
import { DisclosureList } from '@/design-system/primitives/Disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { formatPrice } from '@/lib/format';
import { useSeo } from '@/lib/seo';

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

export default function AffiliatesPage() {
  useSeo({
    title: 'Affiliate programme',
    description:
      'Earn up to 45% of the trading fees your referrals generate, for the lifetime of the account, with attribution you can audit.',
  });

  const [referrals, setReferrals] = useState(120);
  const [avgVolume, setAvgVolume] = useState(8_000);

  const monthly = useMemo(() => {
    const share = referrals >= 200 ? 0.45 : referrals >= 25 ? 0.4 : 0.3;
    const feeRate = 0.001;
    return referrals * avgVolume * feeRate * share;
  }, [referrals, avgVolume]);

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
            <ButtonLink to="/signup" size="lg" sheen>
              Join the programme
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink to="#calculator" variant="outline" size="lg">
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
                <Card interactive className="h-full p-6">
                  <perk.icon className="size-6 text-brand-soft" />
                  <h2 className="mt-5 font-display text-base font-semibold text-fg">{perk.title}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{perk.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section id="calculator" tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20">
          <Reveal>
            <SectionHeading
              align="left"
              eyebrow="Calculator"
              title="What the programme would pay you"
              body="Based on a 0.10% average taker fee and your tier's revenue share. Move the sliders."
            />
            <div className="mt-10 space-y-9">
              <div>
                <label htmlFor="referrals" className="text-sm text-fg-muted">
                  Active referrals
                </label>
                <output data-numeric className="mt-2 block font-display text-4xl font-semibold text-fg">
                  {referrals.toLocaleString()}
                </output>
                <input
                  id="referrals"
                  type="range"
                  min={1}
                  max={1000}
                  value={referrals}
                  onChange={(e) => setReferrals(Number(e.target.value))}
                  className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--brand)]"
                />
              </div>
              <div>
                <label htmlFor="volume" className="text-sm text-fg-muted">
                  Average monthly volume each
                </label>
                <output data-numeric className="mt-2 block font-display text-4xl font-semibold text-fg">
                  {formatPrice(avgVolume).replace('.00', '')}
                </output>
                <input
                  id="volume"
                  type="range"
                  min={500}
                  max={100_000}
                  step={500}
                  value={avgVolume}
                  onChange={(e) => setAvgVolume(Number(e.target.value))}
                  className="mt-4 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--brand)]"
                />
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <Card className="p-8 md:p-10">
              <div className="flex items-center justify-between">
                <span className="eyebrow">Estimated monthly</span>
                <Badge tone="brand">
                  {referrals >= 200 ? 'Elite · 45%' : referrals >= 25 ? 'Partner · 40%' : 'Standard · 30%'}
                </Badge>
              </div>
              <p data-numeric className="mt-6 font-display text-6xl font-semibold text-fg">
                {formatPrice(monthly).replace('.00', '')}
              </p>
              <p data-numeric className="mt-3 text-sm text-fg-muted">
                {formatPrice(monthly * 12).replace('.00', '')} per year at this rate
              </p>
              <ul className="mt-8 space-y-2.5 border-t border-line pt-6">
                {['Lifetime revenue share', 'No cap on earnings', 'Paid in USDC or fiat', 'Raw attribution export'].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-fg-muted">
                      <Check className="size-4 shrink-0 text-up" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section>
        <div className="shell">
          <SectionHeading eyebrow="Tiers" title="Three tiers, published rates" />
          <StaggerGroup className="mt-14 grid gap-4 md:grid-cols-3">
            {TIERS.map((tier) => (
              <StaggerItem key={tier.name}>
                <Card interactive className="h-full p-7">
                  <h3 className="font-display text-xl font-semibold text-fg">{tier.name}</h3>
                  <p className="mt-1 text-sm text-fg-subtle">{tier.referrals}</p>
                  <p className="mt-6 font-display text-5xl font-semibold text-brand-soft">
                    {tier.share}
                  </p>
                  <p className="mt-2 text-sm text-fg-muted">of trading fees, for life</p>
                  <p className="mt-6 border-t border-line pt-5 text-xs uppercase tracking-wider text-fg-subtle">
                    Paid {tier.payout.toLowerCase()}
                  </p>
                </Card>
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
        primary={{ label: 'Apply now', to: '/signup' }}
        secondary={{ label: 'Ask a question', to: '/contact' }}
      />
    </>
  );
}
