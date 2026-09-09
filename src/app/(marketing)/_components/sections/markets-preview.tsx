import { ArrowRight } from 'lucide-react';

import type { MarketDto } from '@/modules/market-data';
import { Reveal } from '@/shared/ui/motion/reveal';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { Section } from '@/shared/ui/primitives/section';

import { MarketTable } from '../market-table';

export function MarketsPreview({ markets }: { markets: readonly MarketDto[] }) {
  return (
    <Section id="markets">
      <div className="shell">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="eyebrow mb-5">
              <span aria-hidden className="h-px w-6 bg-gradient-to-r from-transparent to-brand-soft" />
              Live markets
            </p>
            <h2 className="text-4xl font-semibold">Prices, moving right now</h2>
            <p className="mt-4 text-lg text-fg-muted">
              Top assets by market capitalisation, from the latest observation of each market.
            </p>
          </div>
          <ButtonLink href="/markets" variant="outline">
            All markets
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ButtonLink>
        </Reveal>

        <Reveal delay={0.1}>
          <MarketTable markets={markets} limit={8} showControls={false} />
        </Reveal>
      </div>
    </Section>
  );
}
