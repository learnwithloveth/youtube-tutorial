import { useMemo, useState } from 'react';
import { ArrowRight, Coins, Lock, ShieldCheck, Timer } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { Badge } from '@/design-system/primitives/Badge';
import { ButtonLink } from '@/design-system/primitives/Button';
import { SegmentedControl } from '@/design-system/primitives/SegmentedControl';
import { DisclosureList } from '@/design-system/primitives/Disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { AssetMark } from '@/components/visuals/AssetMark';
import { Sparkline } from '@/components/visuals/Sparkline';
import { ASSETS } from '@/features/markets/assets';
import { buildSpark } from '@/features/markets/simulation';
import { formatPrice } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/cn';

const STAKEABLE = ASSETS.filter((a) => (a.apy ?? 0) > 0).sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));

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

const YIELD_SPARK = buildSpark('earn-yield', 5, 40);

export default function EarnPage() {
  useSeo({
    title: 'Earn & staking',
    description:
      'Stake 38 assets at up to 12.4% APY. Rewards paid daily, no lock-up on 21 assets, and a slashing shield covering validator faults up to $50M.',
  });

  const [assetId, setAssetId] = useState('tao');
  const [amount, setAmount] = useState(10_000);
  const [horizon, setHorizon] = useState<'1y' | '3y' | '5y'>('1y');

  const asset = STAKEABLE.find((a) => a.id === assetId) ?? STAKEABLE[0];
  const years = horizon === '1y' ? 1 : horizon === '3y' ? 3 : 5;

  const projection = useMemo(() => {
    const rate = (asset.apy ?? 0) / 100;
    // Daily compounding matches how rewards are actually credited.
    const final = amount * Math.pow(1 + rate / 365, 365 * years);
    return { final, earned: final - amount };
  }, [asset, amount, years]);

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
            <ButtonLink to="/signup" size="lg" sheen>
              Start earning
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink to="/learn" variant="outline" size="lg">
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
            <Card className="mt-12 grid gap-10 p-8 lg:grid-cols-[1fr_1fr] md:p-10">
              <div>
                <label htmlFor="stake-asset" className="text-sm font-medium text-fg">
                  Asset
                </label>
                <div className="mask-x mt-3 overflow-x-auto pb-1">
                  <div className="flex gap-2" id="stake-asset">
                    {STAKEABLE.slice(0, 8).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAssetId(a.id)}
                        aria-pressed={a.id === assetId}
                        className={cn(
                          'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all duration-300',
                          a.id === assetId
                            ? 'border-brand-soft/60 bg-brand/15 text-fg'
                            : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                        )}
                      >
                        <AssetMark symbol={a.symbol} glyph={a.glyph} hue={a.hue} size="sm" />
                        {a.symbol}
                      </button>
                    ))}
                  </div>
                </div>

                <label htmlFor="stake-amount" className="mt-8 block text-sm font-medium text-fg">
                  Amount staked
                </label>
                <output data-numeric className="mt-2 block font-display text-4xl font-semibold text-fg">
                  {formatPrice(amount).replace('.00', '')}
                </output>
                <input
                  id="stake-amount"
                  type="range"
                  min={500}
                  max={500_000}
                  step={500}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="mt-5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-[var(--brand)]"
                />

                <SegmentedControl
                  ariaLabel="Time horizon"
                  className="mt-8"
                  segments={[
                    { value: '1y', label: '1 year' },
                    { value: '3y', label: '3 years' },
                    { value: '5y', label: '5 years' },
                  ]}
                  value={horizon}
                  onChange={setHorizon}
                />
              </div>

              <div className="rounded-lg border border-line bg-bg-sunken/70 p-7">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">Projected value</span>
                  <Badge tone="up">{asset.apy?.toFixed(1)}% APY</Badge>
                </div>
                <p data-numeric className="mt-6 font-display text-5xl font-semibold text-fg">
                  {formatPrice(projection.final).replace('.00', '')}
                </p>
                <p data-numeric className="mt-2 text-sm font-medium text-up">
                  +{formatPrice(projection.earned).replace('.00', '')} earned over {years} year
                  {years > 1 ? 's' : ''}
                </p>
                <div className="mt-7">
                  <Sparkline data={YIELD_SPARK} color="var(--up)" width={340} height={80} className="w-full" />
                </div>
                <p className="mt-6 border-t border-line pt-5 text-xs leading-relaxed text-fg-subtle">
                  Assumes the current rate holds and rewards are restaked daily. Rates float with
                  network conditions; this is an illustration, not a forecast.
                </p>
              </div>
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <SectionHeading eyebrow="Rates" title="All staking rates" body="Live rates across every supported asset, updated hourly." />
          <StaggerGroup className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STAKEABLE.map((a) => (
              <StaggerItem key={a.id}>
                <Card interactive className="flex items-center gap-4 p-5">
                  <AssetMark symbol={a.symbol} glyph={a.glyph} hue={a.hue} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{a.name}</p>
                    <p className="text-xs text-fg-subtle">
                      {a.symbol} · {(a.apy ?? 0) > 6 ? 'Unbonding period' : 'Instant unstake'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p data-numeric className="text-xl font-semibold text-up">
                      {a.apy?.toFixed(1)}%
                    </p>
                    <p className="text-2xs uppercase tracking-wider text-fg-subtle">APY</p>
                  </div>
                </Card>
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
                <Card interactive className="h-full p-6">
                  <pillar.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">{pillar.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{pillar.body}</p>
                </Card>
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

      <CtaBand title="Start earning on what you already hold." body="Stake in two taps from any asset in your account. Unstake just as fast on 21 of them." primary={{ label: 'Open an account', to: '/signup' }} secondary={{ label: 'See all rates', to: '/earn' }} />
    </>
  );
}
