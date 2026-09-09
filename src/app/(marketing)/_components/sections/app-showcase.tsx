import { Bell, Fingerprint, Repeat, Wifi } from 'lucide-react';
import { Section } from '@/shared/ui/primitives/section';
import { Reveal } from '@/shared/ui/motion/reveal';
import { PhoneMock } from '@/shared/ui/visuals/phone-mock';
import { AppStoreBadges } from '@/shared/ui/visuals/app-store-badges';
import { Glow } from '@/shared/ui/visuals/aurora';
import type { MarketDto } from '@/modules/market-data';

const PERKS = [
  { icon: Fingerprint, title: 'Face ID and passkeys', body: 'Sign in and authorise withdrawals without a password anywhere in the flow.' },
  { icon: Repeat, title: 'Recurring buys', body: 'Daily, weekly or on payday — with a pause button that actually pauses.' },
  { icon: Bell, title: 'Price alerts that arrive', body: 'Push in under 400 ms from the moment the book crosses your level.' },
  { icon: Wifi, title: 'Works on bad networks', body: 'Offline-first cache and delta sync — designed on a 3G connection, not a fibre desk.' },
];

export function AppShowcase({ holdings }: { holdings: readonly MarketDto[] }) {
  return (
    <Section id="app" className="overflow-hidden">
      <div className="shell grid items-center gap-16 lg:grid-cols-[1fr_1fr]">
        <Reveal className="relative order-2 lg:order-1">
          <Glow className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" size={620} opacity={0.35} />
          <PhoneMock holdings={holdings} />
        </Reveal>

        <div className="order-1 lg:order-2">
          <Reveal>
            <p className="eyebrow mb-5">
              <span aria-hidden className="h-px w-6 bg-gradient-to-r from-transparent to-brand-soft" />
              Novex mobile
            </p>
            <h2 className="text-4xl font-semibold">
              Your whole portfolio, in a pocket that already has enough apps.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-fg-muted">
              4.9 stars across 218,000 reviews. Same order book, same fees, same reserves — with
              biometrics and a widget that does not lie to you about the market.
            </p>
          </Reveal>

          <dl className="mt-10 grid gap-6 sm:grid-cols-2">
            {PERKS.map((perk, i) => (
              <Reveal key={perk.title} delay={0.06 * i}>
                <dt className="flex items-center gap-2.5 font-medium text-fg">
                  <perk.icon className="size-4 text-brand-soft" />
                  {perk.title}
                </dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-fg-muted">{perk.body}</dd>
              </Reveal>
            ))}
          </dl>

          <Reveal delay={0.2}>
            <AppStoreBadges className="mt-10" />
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
