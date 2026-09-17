import { ArrowRight } from 'lucide-react';
import { BRAND } from '@/modules/content';
import { Section } from '@/shared/ui/primitives/section';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { AssetMark } from '@/shared/ui/visuals/asset-mark';
import { Glow } from '@/shared/ui/visuals/aurora';
import type { InstrumentDto } from '@/modules/market-data';

/**
 * Takes its assets as a prop rather than importing a fixture: the yields shown
 * are the ones recorded against the listed instruments, so this panel and the
 * Earn page can never disagree about a rate.
 */
export function EarnTeaser({ stakeable }: { stakeable: readonly InstrumentDto[] }) {
  return (
    <Section id="earn" className="overflow-hidden">
      <div className="shell">
        <div className="relative grid items-center gap-12 rounded-2xl border border-line bg-bg-sunken/60 p-8 backdrop-blur-xl md:p-12 lg:grid-cols-[1fr_1.1fr] grain hairline">
          <Glow className="-left-24 -top-24" size={520} opacity={0.4} />
          <Glow className="-bottom-32 -right-16" size={460} opacity={0.3} color="var(--accent)" />

          <Reveal>
            <p className="eyebrow mb-5">
              <span aria-hidden className="size-1.5 rounded-full bg-accent" />
              {BRAND.name} Earn
            </p>
            <h2 className="text-4xl font-semibold">
              Put idle assets to work at up to <span className="text-aurora">12.4% APY</span>
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-fg-muted">
              Native staking on 38 assets with rewards paid daily, no lock-up on 21 of them, and a
              slashing shield that covers validator faults up to $50M.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/earn" size="lg">
                See all rates
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </ButtonLink>
              <ButtonLink href="/learn" variant="ghost" size="lg">
                How staking works
              </ButtonLink>
            </div>
          </Reveal>

          <StaggerGroup className="grid gap-3 sm:grid-cols-2">
            {stakeable.map((asset) => (
              <StaggerItem key={asset.symbol}>
                <InteractiveCard className="flex items-center gap-3 p-4" edge={false}>
                  <AssetMark symbol={asset.symbol} glyph={asset.glyph} hue={asset.hue} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{asset.name}</p>
                    <p className="text-xs text-fg-subtle">{asset.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p data-numeric className="text-lg font-semibold text-up">
                      {asset.yieldPercent?.toFixed(1)}%
                    </p>
                    <p className="text-2xs uppercase tracking-wider text-fg-subtle">APY</p>
                  </div>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </div>
    </Section>
  );
}
