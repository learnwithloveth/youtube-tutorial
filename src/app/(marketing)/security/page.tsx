import type { Metadata } from 'next';
import {
  ArrowRight, BadgeCheck, Bug, FileCheck2, Fingerprint, Landmark, Lock, Server, Snowflake, Users,
} from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { BRAND } from '@/modules/content';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { Card } from '@/shared/ui/primitives/card';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Badge } from '@/shared/ui/primitives/badge';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { DisclosureList } from '@/shared/ui/primitives/disclosure';
import { CountUp } from '@/shared/ui/primitives/count-up';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';

const LAYERS = [
  { icon: Snowflake, title: 'Cold storage', body: '98% of customer assets sit in HSM-backed vaults. Every movement needs quorum approval from key holders in three separate jurisdictions.', meta: 'FIPS 140-2 Level 3' },
  { icon: Lock, title: 'Hot wallet policy', body: 'The hot float is capped at 2% of custody and rebalanced hourly by an automated policy engine with a hard ceiling no operator can raise.', meta: 'Capped at 2%' },
  { icon: Fingerprint, title: 'Account security', body: 'Passkeys by default, hardware 2FA supported, device attestation on every session, and a 24-hour lock on new withdrawal addresses.', meta: 'Phishing-resistant' },
  { icon: Server, title: 'Infrastructure', body: 'Immutable infrastructure, signed builds, no standing production access. Every privileged action requires a second approver and lands in an append-only log.', meta: 'Zero standing access' },
  { icon: Users, title: 'Insider risk', body: 'Dual control on all treasury operations, mandatory leave rotation for key custodians, and background re-screening every 24 months.', meta: 'Dual control' },
  { icon: Bug, title: 'Adversarial testing', body: 'Continuous bug bounty up to $2M, four external penetration tests a year, and a red team that reports to the board rather than to engineering.', meta: '$2M max bounty' },
];

const LICENCES = [
  { region: 'European Economic Area', licence: 'MiCA — CASP authorisation', ref: 'CH-4419' },
  { region: 'Singapore', licence: 'Major Payment Institution', ref: 'PS20210418' },
  { region: 'United States', licence: 'FinCEN MSB registration', ref: '31000217412' },
  { region: 'United Kingdom', licence: 'FCA cryptoasset registration', ref: '928471' },
  { region: 'Nigeria', licence: 'SEC Digital Asset Exchange', ref: 'DAX-0031' },
  { region: 'Japan', licence: 'JFSA Crypto Exchange Operator', ref: '00042' },
];

const SECURITY_FAQ = [
  { question: 'How do I verify my balance is in the reserves?', answer: 'Open Account → Proof of reserves. We give you your account leaf hash and the sibling hashes up the Merkle tree. Recompute the root locally with any SHA-256 implementation and compare it to the root we published on-chain that day. If they match, your balance was included.' },
  { question: 'What is actually covered by the insurance fund?', answer: `The $250M fund covers loss of customer assets from a compromise of ${BRAND.name}-controlled infrastructure, including hot wallet theft and insider misappropriation. It does not cover losses from you sharing credentials, approving a malicious transaction from ${BRAND.name} Wallet, or market movement.` },
  { question: `Do you have access to my ${BRAND.name} Wallet keys?`, answer: `No. ${BRAND.name} Wallet uses threshold MPC with shards held by you, your device secure enclave, and a recovery shard you can assign. ${BRAND.name} never holds a quorum and cannot sign on your behalf, which is also why we cannot recover a wallet if you lose both your device and your recovery shard.` },
  { question: 'What happens during an incident?', answer: 'Incidents are posted to status.novex.io within 15 minutes of detection, updated at least every 30 minutes, and followed by a public postmortem within five business days. We publish the postmortem whether or not customer funds were affected.' },
];

export const metadata: Metadata = {
  title: 'Security',
  description:
    'Proof-of-reserves, HSM cold storage, MPC self-custody and the licences we operate under.',
};

export default function SecurityPage() {

  return (
    <>
      <PageHero
        eyebrow="Security"
        title={
          <>
            Trust, but <span className="text-aurora">verify.</span>
          </>
        }
        body="Every security claim on this page is something you can check yourself — which is the only kind of guarantee worth publishing."
        actions={
          <>
            <ButtonLink href="/signup" size="lg" sheen>
              Verify your own balance
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/status" variant="outline" size="lg">
              System status
            </ButtonLink>
          </>
        }
      />

      <Section id="reserves">
        <div className="shell">
          <Reveal>
            <Card className="overflow-hidden p-8 md:p-12">
              <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
                <div>
                  <Badge tone="up" className="mb-5">
                    <FileCheck2 className="size-3" />
                    Published 3 hours ago
                  </Badge>
                  <h2 className="text-3xl font-semibold">Proof of reserves, every 24 hours</h2>
                  <p className="mt-5 text-lg leading-relaxed text-fg-muted">
                    We publish a Merkle root of all customer balances alongside signed attestations
                    of every on-chain reserve address. Your account page hands you your own leaf and
                    the sibling hashes, so you can prove inclusion without trusting {BRAND.name} — or the
                    auditor.
                  </p>
                  <ButtonLink href="/signup" variant="outline" className="mt-8">
                    See the current attestation
                  </ButtonLink>
                </div>

                <div className="rounded-lg border border-line bg-bg-sunken/70 p-6">
                  <p className="eyebrow mb-5">Latest attestation</p>
                  <dl className="space-y-4 text-sm">
                    {[
                      { k: 'Reserve ratio', v: '104.2%' },
                      { k: 'Customer liabilities', v: '$184.0B' },
                      { k: 'On-chain reserves', v: '$191.7B' },
                      { k: 'Accounts included', v: '41,206,884' },
                    ].map((row) => (
                      <div key={row.k} className="flex justify-between">
                        <dt className="text-fg-subtle">{row.k}</dt>
                        <dd data-numeric className="font-medium text-fg">
                          {row.v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-5 break-all border-t border-line pt-4 font-mono text-2xs text-fg-subtle">
                    root: 0x9f2c4a1e8b73d05f6ae2c9b481d37f0c5a6e29b4d81f7c03ae5b962d174f80cb
                  </p>
                </div>
              </div>
            </Card>
          </Reveal>

          <StaggerGroup className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              { label: 'Assets in cold storage', value: 98, suffix: '%' },
              { label: 'Insurance fund', value: 250, prefix: '$', suffix: 'M' },
              { label: 'Uptime over 5 years', value: 99.997, suffix: '%', decimals: 3 },
            ].map((stat) => (
              <StaggerItem key={stat.label}>
                <Card className="p-7 text-center">
                  <p className="font-display text-4xl font-semibold text-fg">
                    <CountUp
                      value={stat.value}
                      prefix={stat.prefix ?? ''}
                      suffix={stat.suffix}
                      decimals={stat.decimals ?? 0}
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
            eyebrow="Defence in depth"
            title="Six layers, none of which trust the others"
            body="A control that only works when every other control is healthy is not a control."
          />
          <StaggerGroup className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {LAYERS.map((layer) => (
              <StaggerItem key={layer.title}>
                <InteractiveCard className="flex h-full flex-col p-7">
                  <span className="grid size-11 place-items-center rounded-md border border-line bg-surface text-brand-soft">
                    <layer.icon className="size-5" />
                  </span>
                  <h3 className="mt-5 font-display text-lg font-semibold text-fg">{layer.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-fg-muted">{layer.body}</p>
                  <p className="mt-5 border-t border-line pt-4 font-mono text-2xs uppercase tracking-wider text-accent">
                    {layer.meta}
                  </p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section id="licences">
        <div className="shell">
          <SectionHeading
            eyebrow="Regulation"
            title="Licensed in 14 jurisdictions"
            body="Six of them are listed below. The full register, including passporting notices, is in the legal centre."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LICENCES.map((licence) => (
              <StaggerItem key={licence.region}>
                <InteractiveCard className="h-full p-6">
                  <BadgeCheck className="size-5 text-up" />
                  <h3 className="mt-4 font-display text-base font-semibold text-fg">
                    {licence.region}
                  </h3>
                  <p className="mt-1.5 text-sm text-fg-muted">{licence.licence}</p>
                  <p className="mt-4 font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                    Ref {licence.ref}
                  </p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>

          <Reveal>
            <Card className="mt-6 flex flex-wrap items-center justify-between gap-6 p-7">
              <div className="flex items-center gap-4">
                <Landmark className="size-6 text-brand-soft" />
                <div>
                  <p className="font-medium text-fg">Segregated client money</p>
                  <p className="text-sm text-fg-muted">
                    Fiat balances are held at tier-1 banks in accounts titled to customers, never on
                    the {BRAND.name} balance sheet.
                  </p>
                </div>
              </div>
              <ButtonLink href="/legal/terms" variant="outline" size="sm">
                Read the terms
              </ButtonLink>
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <SectionHeading
            align="left"
            eyebrow="Questions"
            title="Security questions we get asked"
            className="lg:sticky lg:top-28 lg:self-start"
          />
          <Reveal delay={0.1}>
            <DisclosureList items={SECURITY_FAQ} />
          </Reveal>
        </div>
      </Section>

      <CtaBand
        title="Open an account and check the maths yourself."
        body="Verification takes about two minutes. Verifying our reserves takes about thirty seconds."
      />
    </>
  );
}
