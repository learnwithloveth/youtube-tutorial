import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BRAND } from '@/modules/content';
import { getInstruments, getMarkets } from '@/server/market-data';


import { AppShowcase } from './_components/sections/app-showcase';
import { BentoFeatures } from './_components/sections/bento-features';
import { CtaBand } from './_components/sections/cta-band';
import { EarnTeaser } from './_components/sections/earn-teaser';
import { FaqSection } from './_components/sections/faq-section';
import { HomeHero } from './_components/sections/home-hero';
import { HowItWorks } from './_components/sections/how-it-works';
import { LogoCloud } from './_components/sections/logo-cloud';
import { MarketsPreview } from './_components/sections/markets-preview';
import { SecurityBand } from './_components/sections/security-band';
import { StatsBand } from './_components/sections/stats-band';
import { Testimonials } from './_components/sections/testimonials';
import { TickerStrip } from './_components/ticker-strip';

// Must be a literal: Next reads segment config statically, so an imported
// constant cannot be resolved. See app/_lib/revalidate.ts for the rationale.
export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Buy, sell and earn on 340+ digital assets',
  description: BRAND.description,
};

/**
 * Home.
 *
 * Everything on this page except the priced sections is static markup with no
 * data dependency, so it prerenders into the shell and reaches the browser as
 * HTML. The three sections that need quotes are wrapped in `<Suspense>` and
 * stream in behind it — which is why the hero's largest contentful paint does
 * not wait on a database round trip.
 */
export default function HomePage() {
  return (
    <>
      <Suspense fallback={<HeroFallback />}>
        <PricedHero />
      </Suspense>

      <Suspense fallback={null}>
        <PricedTicker />
      </Suspense>

      <StatsBand />
      <BentoFeatures />
      <HowItWorks />

      <Suspense fallback={null}>
        <PricedMarkets />
      </Suspense>

      <Suspense fallback={null}>
        <StakeableAssets />
      </Suspense>

      <SecurityBand />

      <Suspense fallback={null}>
        <MobileShowcase />
      </Suspense>

      <LogoCloud />
      <Testimonials />
      <FaqSection />
      <CtaBand />
    </>
  );
}

async function PricedHero() {
  const markets = await getMarkets({ limit: 12 });
  return <HomeHero markets={markets} />;
}

async function PricedTicker() {
  const markets = await getMarkets({ limit: 14 });
  return <TickerStrip markets={markets} />;
}

async function PricedMarkets() {
  const markets = await getMarkets();
  return <MarketsPreview markets={markets} />;
}

async function StakeableAssets() {
  const stakeable = await getInstruments({ stakeableOnly: true, limit: 6 });
  return <EarnTeaser stakeable={stakeable} />;
}

async function MobileShowcase() {
  const markets = await getMarkets({ limit: 5 });
  return <AppShowcase holdings={markets} />;
}

/** Holds the hero's height while quotes resolve, so the page does not jump. */
function HeroFallback() {
  return <div className="min-h-[38rem]" aria-hidden />;
}
