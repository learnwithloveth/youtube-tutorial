import { ArrowRight } from 'lucide-react';
import { Section } from '@/design-system/primitives/Section';
import { MarketTable } from '@/features/markets/MarketTable';
import { ButtonLink } from '@/design-system/primitives/Button';
import { Reveal } from '@/design-system/motion/Reveal';

export function MarketsPreview() {
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
              Top assets by market capitalisation, streamed straight from the Novex order book.
            </p>
          </div>
          <ButtonLink to="/markets" variant="outline">
            All 340+ markets
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ButtonLink>
        </Reveal>

        <Reveal delay={0.1}>
          <MarketTable limit={8} showControls={false} />
        </Reveal>
      </div>
    </Section>
  );
}
