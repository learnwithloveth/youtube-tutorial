import { Bell, Fingerprint, Gauge, QrCode, Repeat, Star, Wifi } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { CountUp } from '@/design-system/primitives/CountUp';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { PhoneMock } from '@/components/visuals/PhoneMock';
import { AppStoreBadges } from '@/components/visuals/AppStoreBadges';
import { Glow } from '@/components/visuals/Aurora';
import { useSeo } from '@/lib/seo';

const FEATURES = [
  { icon: Fingerprint, title: 'Face ID & passkeys', body: 'Sign in and authorise withdrawals without typing a password anywhere in the flow.' },
  { icon: Repeat, title: 'Recurring buys', body: 'Daily, weekly or on payday, with a pause that pauses instead of cancelling.' },
  { icon: Bell, title: 'Alerts under 400 ms', body: 'Push delivered the moment the book crosses your level, not on the next poll.' },
  { icon: Wifi, title: 'Built for bad networks', body: 'Offline-first cache and delta sync — designed on throttled 3G, not office fibre.' },
  { icon: Gauge, title: 'Full order types', body: 'Stop-limit, trailing stop, TWAP and iceberg all work on mobile.' },
  { icon: QrCode, title: 'Scan to pay', body: 'Send to any address or Novex tag by camera, with simulation before you sign.' },
];

const REVIEWS = [
  { stars: 5, title: 'Finally an app that respects my connection', body: 'I trade from a train most mornings. Novex is the only exchange app that does not collapse into spinners.', name: 'martin_k', store: 'App Store' },
  { stars: 5, title: 'The widget is honest', body: 'Shows a stale-data indicator instead of pretending. Small thing. Nobody else does it.', name: 'aoife.dev', store: 'Google Play' },
  { stars: 5, title: 'Recurring buys done right', body: 'Skipping one instalment without killing the whole schedule should not be rare, but it is.', name: 'jrodriguez', store: 'App Store' },
];

export default function AppPage() {
  useSeo({
    title: 'Mobile app for iOS & Android',
    description:
      'The full Novex platform on mobile: advanced order types, staking, self-custody and biometric approval. 4.9 stars across 218,000 reviews.',
  });

  return (
    <>
      <PageHero
        eyebrow="Novex mobile"
        title={
          <>
            The whole exchange,
            <br />
            <span className="text-aurora">in your pocket.</span>
          </>
        }
        body="Not a viewer — the full platform. Advanced orders, staking, self-custody and reserve verification, with biometrics and an offline-first cache."
        align="left"
        actions={<AppStoreBadges />}
        aside={<PhoneMock />}
      />

      <Section>
        <div className="shell">
          <StaggerGroup className="grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Average rating', value: 4.9, decimals: 1, suffix: ' ★' },
              { label: 'Reviews', value: 218_000, compact: true },
              { label: 'Crash-free sessions', value: 99.7, decimals: 1, suffix: '%' },
            ].map((stat) => (
              <StaggerItem key={stat.label}>
                <Card className="p-7 text-center">
                  <p className="font-display text-4xl font-semibold text-fg">
                    <CountUp
                      value={stat.value}
                      decimals={stat.decimals ?? 0}
                      suffix={stat.suffix ?? ''}
                      compact={stat.compact ?? false}
                    />
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-wider text-fg-subtle">{stat.label}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <SectionHeading
            eyebrow="What's inside"
            title="Nothing was left on the desktop"
            body="Feature parity is a policy here, not an aspiration. If it ships on web, it ships on mobile in the same release."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <StaggerItem key={feature.title}>
                <Card interactive className="h-full p-6">
                  <feature.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{feature.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section id="download" className="overflow-hidden">
        <div className="shell">
          <Reveal>
            <Card className="relative overflow-hidden p-8 md:p-14">
              <Glow className="-right-24 -top-24" size={620} opacity={0.35} />
              <div className="grid items-center gap-12 lg:grid-cols-[1fr_auto]">
                <div>
                  <h2 className="text-4xl font-semibold">Point your camera here</h2>
                  <p className="mt-5 max-w-md text-lg text-fg-muted">
                    Scan to open the right store for your device. Or search “Novex” — we are the one
                    with the prism.
                  </p>
                  <AppStoreBadges className="mt-9" />
                </div>
                <div
                  aria-hidden
                  className="mx-auto grid size-44 place-items-center rounded-lg border border-line bg-bg-elev p-4"
                >
                  <QrPlaceholder />
                </div>
              </div>
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <SectionHeading eyebrow="Reviews" title="What people actually wrote" />
          <StaggerGroup className="mt-14 grid gap-4 lg:grid-cols-3">
            {REVIEWS.map((review) => (
              <StaggerItem key={review.title}>
                <Card interactive className="h-full p-6">
                  <div className="flex gap-0.5" aria-label={`${review.stars} out of 5 stars`}>
                    {Array.from({ length: review.stars }, (_, i) => (
                      <Star key={i} className="size-3.5 fill-warn text-warn" />
                    ))}
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold text-fg">{review.title}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-fg-muted">{review.body}</p>
                  <p className="mt-5 border-t border-line pt-4 text-xs text-fg-subtle">
                    {review.name} · {review.store}
                  </p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <CtaBand
        title="Download it and trade from anywhere."
        body="Free on iOS and Android. Your account, your keys, your connection — whatever shape it is in."
        primary={{ label: 'Create free account', to: '/signup' }}
        secondary={{ label: 'Explore features', to: '/features' }}
      />
    </>
  );
}

/** A deterministic pseudo-QR block — decorative, never scanned. */
function QrPlaceholder() {
  const cells = Array.from({ length: 169 }, (_, i) => {
    const x = i % 13;
    const y = Math.floor(i / 13);
    const corner = (x < 3 && y < 3) || (x > 9 && y < 3) || (x < 3 && y > 9);
    return corner || (x * 7 + y * 13 + x * y) % 3 === 0;
  });
  return (
    <div className="grid size-full grid-cols-13 gap-px">
      {cells.map((on, i) => (
        <span key={i} className={on ? 'bg-fg' : 'bg-transparent'} />
      ))}
    </div>
  );
}
