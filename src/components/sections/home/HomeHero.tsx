import { ArrowRight, PlayCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { Aurora } from '@/components/visuals/Aurora';
import { ButtonLink } from '@/design-system/primitives/Button';
import { BuySellWidget } from '@/features/trade/BuySellWidget';
import { Reveal } from '@/design-system/motion/Reveal';
import { usePrefersReducedMotion } from '@/lib/hooks';

const TRUST = [
  '1:1 proof-of-reserves',
  'Regulated in 14 jurisdictions',
  '$250M insurance fund',
];

export function HomeHero() {
  const reduced = usePrefersReducedMotion();

  return (
    <section className="relative isolate overflow-hidden -mt-18 pb-16 pt-28 md:pb-24 md:pt-32">
      <Aurora grid />

      <div className="shell grid items-center gap-14 lg:grid-cols-[1.08fr_1fr] lg:gap-20">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs text-fg-muted backdrop-blur-md">
              <Sparkles className="size-3.5 text-accent" />
              Novex Earn is live — up to 12.4% APY
              <ArrowRight className="size-3" />
            </span>
          </Reveal>

          <motion.h1
            initial={reduced ? false : { opacity: 0, y: 26, filter: 'blur(12px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 text-6xl font-semibold leading-[1.02]"
          >
            Trade crypto at the
            <br />
            speed of <span className="text-aurora">conviction.</span>
          </motion.h1>

          <Reveal delay={0.14}>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-fg-muted">
              Buy, sell and earn on 340+ digital assets with a matching engine that clears in 0.9
              milliseconds, reserves you can verify yourself, and fees that start at zero.
            </p>
          </Reveal>

          <Reveal delay={0.22}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink to="/signup" size="lg" sheen>
                Start trading free
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </ButtonLink>
              <ButtonLink to="/features" variant="outline" size="lg">
                <PlayCircle className="size-4" />
                Watch the 2-min tour
              </ButtonLink>
            </div>
          </Reveal>

          <Reveal delay={0.3}>
            <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              {TRUST.map((item) => (
                <li key={item} className="inline-flex items-center gap-2 text-sm text-fg-subtle">
                  <ShieldCheck className="size-4 text-up" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
        >
          <BuySellWidget />
        </motion.div>
      </div>
    </section>
  );
}
