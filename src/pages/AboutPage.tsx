import { ArrowRight, Compass, Eye, Scale, Users } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { LogoCloud } from '@/components/sections/LogoCloud';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { ButtonLink } from '@/design-system/primitives/Button';
import { CountUp } from '@/design-system/primitives/CountUp';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { BRAND } from '@/data/brand';
import { useSeo } from '@/lib/seo';

const VALUES = [
  { icon: Eye, title: 'Publish the uncomfortable number', body: 'Latency benchmarks, postmortems, fee schedules, reserve gaps. If a number would embarrass us, that is usually the argument for publishing it.' },
  { icon: Scale, title: 'No structural conflicts', body: 'No payment for order flow, no proprietary desk trading against customers, no spread markup hidden inside a quoted rate.' },
  { icon: Compass, title: 'Build for the edges', body: 'The worst connection, the smallest balance, the least experienced user. Design for them and the centre takes care of itself.' },
  { icon: Users, title: 'Small teams, long tenure', body: 'Fewer people with more context beats more people with less. Median engineering tenure is 4.1 years.' },
];

const TIMELINE = [
  { year: '2019', title: 'Founded in Zurich', body: 'Four engineers and a thesis: the retail order path should be the institutional order path.' },
  { year: '2020', title: 'First licence', body: 'FINMA-supervised operations begin. The matching engine handles its first million orders.' },
  { year: '2021', title: 'Singapore hub', body: 'Major Payment Institution licence granted. APAC volume overtakes Europe within nine months.' },
  { year: '2022', title: 'Proof of reserves', body: 'First daily Merkle attestation published — eleven months before it became an industry expectation.' },
  { year: '2023', title: 'Novex Wallet', body: 'MPC self-custody ships with no seed phrase. One million wallets created in the first quarter.' },
  { year: '2024', title: 'The Rust rewrite', body: 'The new matching core goes live after five months of shadow replay. Tail latency falls 94%.' },
  { year: '2025', title: 'MiCA authorisation', body: 'Passporting into 27 EEA markets. Institutional custody crosses $100B.' },
  { year: '2026', title: 'Lagos engineering hub', body: 'Third engineering site opens as African volume triples year over year.' },
];

const LEADERS = [
  { name: 'Isabelle Moreau', role: 'Chief Executive', bio: 'Previously ran market structure at a European clearing house. Wrote the original matching engine spec.', initials: 'IM', hue: '#8B5CF6' },
  { name: 'Daniel Reyes', role: 'VP Engineering', bio: 'Fifteen years in payments infrastructure. Owns the postmortem policy and defends it in board meetings.', initials: 'DR', hue: '#22D3EE' },
  { name: 'Marcus Vogel', role: 'Head of Security', bio: 'Former offensive security lead. Reports to the board rather than to engineering, deliberately.', initials: 'MV', hue: '#E879F9' },
  { name: 'Amara Okonkwo', role: 'Head of Market Structure', bio: 'Publishes the research that makes our commercial team uncomfortable. That is the job.', initials: 'AO', hue: '#34D399' },
  { name: 'Priya Raman', role: 'Principal Engineer', bio: 'Led the Rust rewrite. Maintains the benchmark methodology we publish quarterly.', initials: 'PR', hue: '#FBBF24' },
  { name: 'Tolu Adeyemi', role: 'Design Lead', bio: 'Made the whole mobile team work on throttled 3G for a quarter. Retention went up.', initials: 'TA', hue: '#FB7185' },
];

export default function AboutPage() {
  useSeo({
    title: 'About',
    description:
      'Founded in 2019 on one thesis: the retail order path should be the institutional order path. Nine timezones, 41 million traders, one order book.',
  });

  return (
    <>
      <PageHero
        eyebrow="About"
        title={
          <>
            We rebuilt the exchange
            <br />
            <span className="text-aurora">from the order book up.</span>
          </>
        }
        body={`Founded in ${BRAND.founded} on a single thesis: retail orders should take exactly the same path as institutional flow. Everything else followed from that.`}
        actions={
          <>
            <ButtonLink to="/careers" size="lg" sheen>
              See open roles
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink to="/blog" variant="outline" size="lg">
              Read the engineering blog
            </ButtonLink>
          </>
        }
      />

      <Section>
        <div className="shell">
          <StaggerGroup className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: 'Founded', value: 2019 },
              { label: 'Employees', value: 840 },
              { label: 'Countries served', value: 180 },
              { label: 'Median tenure (years)', value: 4.1, decimals: 1 },
            ].map((stat) => (
              <StaggerItem key={stat.label}>
                <Card className="p-7 text-center">
                  <p className="font-display text-4xl font-semibold text-fg">
                    <CountUp value={stat.value} decimals={stat.decimals ?? 0} />
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
            eyebrow="Principles"
            title="Four things we will not trade away"
            body="Every one of these has cost us revenue at least once. That is roughly the test of whether a value is real."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2">
            {VALUES.map((value) => (
              <StaggerItem key={value.title}>
                <Card interactive className="h-full p-7">
                  <value.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-lg font-semibold text-fg">{value.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-fg-muted">{value.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section>
        <div className="shell">
          <SectionHeading eyebrow="History" title="Eight years, in order" />
          <div className="mx-auto mt-16 max-w-3xl">
            <ol className="relative space-y-10 border-l border-line pl-8">
              {TIMELINE.map((entry) => (
                <Reveal as="li" key={entry.year} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[2.3rem] top-1.5 grid size-4 place-items-center rounded-full border border-line-strong bg-bg"
                  >
                    <span className="size-1.5 rounded-full bg-brand-soft" />
                  </span>
                  <p className="font-mono text-2xs uppercase tracking-[0.18em] text-accent">
                    {entry.year}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-semibold text-fg">{entry.title}</h3>
                  <p className="mt-2 leading-relaxed text-fg-muted">{entry.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <SectionHeading eyebrow="Leadership" title="Who is accountable for what" />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LEADERS.map((leader) => (
              <StaggerItem key={leader.name}>
                <Card interactive className="h-full p-6">
                  <span
                    aria-hidden
                    className="grid size-12 place-items-center rounded-full text-sm font-semibold text-white ring-1 ring-inset ring-white/20"
                    style={{ background: `linear-gradient(140deg, ${leader.hue}, color-mix(in oklab, ${leader.hue} 40%, #05060b))` }}
                  >
                    {leader.initials}
                  </span>
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">{leader.name}</h3>
                  <p className="text-sm text-brand-soft">{leader.role}</p>
                  <p className="mt-3 text-sm leading-relaxed text-fg-muted">{leader.bio}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <LogoCloud label="Investors and infrastructure partners" />

      <CtaBand
        title="Come build the boring parts properly."
        body="Thirty-one open roles across nine timezones, and a hiring process that respects your time."
        primary={{ label: 'See open roles', to: '/careers' }}
        secondary={{ label: 'Press enquiries', to: '/press' }}
      />
    </>
  );
}
