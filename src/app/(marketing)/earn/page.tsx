import { ArrowRight, Coins, Lock, ShieldCheck, Timer } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { DisclosureList } from '@/shared/ui/primitives/disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import type { Metadata } from 'next';

import { getInstruments } from '@/server/market-data';

import { StakingCalculator } from './_components/staking-calculator';

const PILLARS = [
  { icon: Timer, title: 'Rewards paid daily', body: 'Not weekly, not at epoch end. Balances compound every 24 hours at 00:00 UTC.' },
  { icon: Lock, title: 'No lock-up on 21 assets', body: 'Unstake instantly where the protocol allows it. Where it does not, we show the exact unbonding window before you commit.' },
  { icon: ShieldCheck, title: 'Slashing shield', body: 'Validator faults are covered up to $50M from a dedicated fund — you keep your principal.' },
  { icon: Coins, title: '8% commission, flat', body: 'The industry charges 25–35% of your rewards. We take 8% and publish the validator performance.' },
];

const EARN_FAQ = [
  { question: 'Where does the yield come from?', answer: 'From the protocol itself. When you stake, Novex delegates your assets to validators that secure the underlying network, and the network mints rewards for that work. There is no lending, no rehypothecation, and no counterparty taking the other side of a trade.' },
  { question: 'Can I lose my staked assets?', answer: 'Two ways, both bounded. Validators can be slashed for misbehaviour — our shield covers that up to $50M. And the asset itself can fall in price; staking pays you in the same asset, so a 9% APY on something that halves is still a loss in dollar terms.' },
  { question: 'How long does unstaking take?', answer: 'Instantly for 21 of the 38 supported assets. The rest follow the protocol unbonding period — 2 days on Cosmos, around 28 on Polkadot, variable on Ethereum depending on the exit queue. The exact window is shown before you confirm.' },
  { question: 'Do I keep custody while staking?', answer: 'Assets staked from your exchange account remain in Novex custody and are included in the daily proof-of-reserves. Assets staked from Novex Wallet stay in your own MPC custody throughout.' },
];

export const metadata: Metadata = {
  title: 'Earn & staking',
  description:
    'Native staking on 38 assets at up to 12.4% APY, rewards paid daily, with an 8% flat commission.',
};

export default async function EarnPage() {
  const stakeable = await getInstruments({ stakeableOnly: true });

  return (
    <>
      <PageHero
        eyebrow="Novex Earn"
        title={
          <>
            Idle assets are
            <br />
            <span className="text-aurora">a rounding error.</span>
          </>
        }
        body="Native staking on 38 assets at up to 12.4% APY. Rewards paid daily, principal never lent out, and an 8% flat commission instead of the industry's 25–35%."
        actions={
          <>
            <ButtonLink href="/signup" size="lg" sheen>
              Start earning
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/learn" variant="outline" size="lg">
              How staking works
            </ButtonLink>
          </>
        }
      />

      <Section>
        <div className="shell">
          <SectionHeading
            eyebrow="Calculator"
            title="What your assets would have earned"
            body="Daily compounding at the current rate. Rates are variable and past performance guarantees precisely nothing."
          />

          <Reveal delay={0.1}>
            <StakingCalculator assets={stakeable} />
          </Reveal>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <SectionHeading eyebrow="Rates" title="All staking rates" body="Live rates across every supported asset, updated hourly." />
          <StaggerGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stakeable.map((a) => (
              <StaggerItem key={a.symbol}>
                <InteractiveCard className="flex items-center gap-4 p-5">
                  <AssetMark symbol={a.symbol} glyph={a.glyph} hue={a.hue} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{a.name}</p>
                    <p className="text-xs text-fg-subtle">
                      {a.symbol} · {(a.yieldPercent ?? 0) > 6 ? 'Unbonding period' : 'Instant unstake'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p data-numeric className="text-xl font-semibold text-up">
                      {a.yieldPercent?.toFixed(1)}%
                    </p>
                    <p className="text-2xs uppercase tracking-wider text-fg-subtle">APY</p>
                  </div>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section>
        <div className="shell">
          <SectionHeading eyebrow="How it works" title="Yield without the counterparty risk" body="Novex Earn is native protocol staking. No lending desk, no rehypothecation, no one on the other side of your position." />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((pillar) => (
              <StaggerItem key={pillar.title}>
                <InteractiveCard className="h-full p-6">
                  <pillar.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{pillar.body}</p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <SectionHeading align="left" eyebrow="Questions" title="Before you stake anything" className="lg:sticky lg:top-28 lg:self-start" />
          <Reveal delay={0.1}>
            <DisclosureList items={EARN_FAQ} />
          </Reveal>
        </div>
      </Section>

      <CtaBand title="Start earning on what you already hold." body="Stake in two taps from any asset in your account. Unstake just as fast on 21 of them." primary={{ label: 'Open an account', href: '/signup' }} secondary={{ label: 'See all rates', href: '/earn' }} />
    </>
  );
}
