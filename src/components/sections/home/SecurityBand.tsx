import { Link } from 'react-router-dom';
import { ArrowRight, FileCheck2, Fingerprint, Landmark, Snowflake } from 'lucide-react';
import { Section } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { Reveal } from '@/design-system/motion/Reveal';
import { CountUp } from '@/design-system/primitives/CountUp';

const PILLARS = [
  { icon: Snowflake, title: '98% cold storage', body: 'HSM-backed vaults with geographically separated quorum approval for every movement.' },
  { icon: FileCheck2, title: 'Daily proof-of-reserves', body: 'A Merkle root published every 24 hours. Verify your own balance is inside it.' },
  { icon: Landmark, title: '$250M insurance fund', body: 'Segregated, on-chain and independently attested — plus an A-rated crime policy.' },
  { icon: Fingerprint, title: 'Passkeys by default', body: 'Phishing-resistant auth, device attestation and withdrawal allow-listing.' },
];

export function SecurityBand() {
  return (
    <Section tone="sunken" id="security">
      <div className="shell">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-end">
          <Reveal>
            <p className="eyebrow mb-5">
              <span aria-hidden className="h-px w-6 bg-gradient-to-r from-transparent to-brand-soft" />
              Security
            </p>
            <h2 className="text-4xl font-semibold">
              Trust, but <span className="text-aurora">verify.</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-fg-muted">
              Every claim on this page is something you can check yourself. That is the only kind of
              security guarantee worth making.
            </p>
            <Link
              to="/security"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-brand-soft transition-colors hover:text-accent"
            >
              Read the security model
              <ArrowRight className="size-4" />
            </Link>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="grid grid-cols-3 divide-x divide-line rounded-lg border border-line bg-bg-elev/60 backdrop-blur-md">
              {[
                { label: 'Uptime, 5 years', value: 99.997, suffix: '%', decimals: 3 },
                { label: 'Funds insured', value: 250, prefix: '$', suffix: 'M' },
                { label: 'Security audits', value: 41, suffix: '' },
              ].map((stat) => (
                <div key={stat.label} className="px-4 py-7 text-center">
                  <p className="font-display text-3xl font-semibold text-fg">
                    <CountUp
                      value={stat.value}
                      prefix={stat.prefix ?? ''}
                      suffix={stat.suffix ?? ''}
                      decimals={stat.decimals ?? 0}
                    />
                  </p>
                  <p className="mt-1.5 text-2xs uppercase tracking-wider text-fg-subtle">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar) => (
            <StaggerItem key={pillar.title}>
              <Card interactive className="h-full p-6">
                <pillar.icon className="size-6 text-brand-soft" />
                <h3 className="mt-5 font-display text-base font-semibold text-fg">{pillar.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{pillar.body}</p>
              </Card>
            </StaggerItem>
          ))}
        </StaggerGroup>
      </div>
    </Section>
  );
}
