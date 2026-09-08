import { ArrowRight } from 'lucide-react';
import { Section } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { ButtonLink } from '@/design-system/primitives/Button';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { AssetMark } from '@/components/visuals/AssetMark';
import { ASSETS } from '@/features/markets/assets';
import { Glow } from '@/components/visuals/Aurora';

const STAKEABLE = ASSETS.filter((a) => (a.apy ?? 0) > 3)
  .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))
  .slice(0, 6);

export function EarnTeaser() {
  return (
    <Section id="earn" className="overflow-hidden">
      <div className="shell">
        <div className="relative grid items-center gap-12 rounded-2xl border border-line bg-bg-sunken/60 p-8 backdrop-blur-xl md:p-12 lg:grid-cols-[1fr_1.1fr] grain hairline">
          <Glow className="-left-24 -top-24" size={520} opacity={0.4} />
          <Glow className="-bottom-32 -right-16" size={460} opacity={0.3} color="var(--accent)" />

          <Reveal>
            <p className="eyebrow mb-5">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              Novex Earn
            </p>
            <h2 className="text-4xl font-semibold">
              Put idle assets to work at up to <span className="text-aurora">12.4% APY</span>
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-fg-muted">
              Native staking on 38 assets with rewards paid daily, no lock-up on 21 of them, and a
              slashing shield that covers validator faults up to $50M.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink to="/earn" size="lg">
                See all rates
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </ButtonLink>
              <ButtonLink to="/learn" variant="ghost" size="lg">
                How staking works
              </ButtonLink>
            </div>
          </Reveal>

          <StaggerGroup className="grid gap-3 sm:grid-cols-2">
            {STAKEABLE.map((asset) => (
              <StaggerItem key={asset.id}>
                <Card interactive className="flex items-center gap-3 p-4" edge={false}>
                  <AssetMark symbol={asset.symbol} glyph={asset.glyph} hue={asset.hue} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{asset.name}</p>
                    <p className="text-xs text-fg-subtle">{asset.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p data-numeric className="text-lg font-semibold text-up">
                      {asset.apy?.toFixed(1)}%
                    </p>
                    <p className="text-2xs uppercase tracking-wider text-fg-subtle">APY</p>
                  </div>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </div>
    </Section>
  );
}
