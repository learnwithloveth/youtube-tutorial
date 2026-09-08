import { HomeHero } from '@/components/sections/home/HomeHero';
import { BentoFeatures } from '@/components/sections/home/BentoFeatures';
import { HowItWorks } from '@/components/sections/home/HowItWorks';
import { MarketsPreview } from '@/components/sections/home/MarketsPreview';
import { EarnTeaser } from '@/components/sections/home/EarnTeaser';
import { SecurityBand } from '@/components/sections/home/SecurityBand';
import { AppShowcase } from '@/components/sections/home/AppShowcase';
import { TickerStrip } from '@/features/markets/TickerStrip';
import { LogoCloud } from '@/components/sections/LogoCloud';
import { StatsBand } from '@/components/sections/StatsBand';
import { Testimonials } from '@/components/sections/Testimonials';
import { FaqSection } from '@/components/sections/FaqSection';
import { CtaBand } from '@/components/sections/CtaBand';
import { useSeo } from '@/lib/seo';
import { BRAND } from '@/data/brand';

export default function HomePage() {
  useSeo({
    title: 'Buy, sell and earn on 340+ digital assets',
    description: BRAND.description,
  });

  return (
    <>
      <HomeHero />
      <TickerStrip />
      <StatsBand />
      <BentoFeatures />
      <HowItWorks />
      <MarketsPreview />
      <EarnTeaser />
      <SecurityBand />
      <AppShowcase />
      <LogoCloud />
      <Testimonials />
      <FaqSection />
      <CtaBand />
    </>
  );
}
