import { useMemo, useState } from 'react';
import { ArrowRight, Building, Coins, Globe2, GraduationCap, HeartPulse, Plane } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { Badge } from '@/design-system/primitives/Badge';
import { ButtonLink } from '@/design-system/primitives/Button';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { ROLES } from '@/data/content';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/cn';

const TEAMS = ['All', ...new Set(ROLES.map((r) => r.team))];

const BENEFITS = [
  { icon: Globe2, title: 'Remote-first, timezone-honest', body: 'Nine timezones, four core hours, and meetings that respect the person who is awake at 06:00.' },
  { icon: Coins, title: 'Transparent bands', body: 'Every role has a published band. We do not negotiate against your last salary and we never ask what it was.' },
  { icon: HeartPulse, title: 'Health, everywhere', body: 'Private medical cover for you and dependants in every country we employ people in, not just the headquarters.' },
  { icon: GraduationCap, title: '€4,000 learning budget', body: 'Per year, no approval chain, no requirement that it be strictly job-related.' },
  { icon: Plane, title: 'Minimum leave, not unlimited', body: 'Twenty-eight days is a floor we enforce, because "unlimited" reliably means "less".' },
  { icon: Building, title: 'Three hubs, no mandate', body: 'Zurich, Singapore and Lagos offices if you want one. Nobody is required to be in them.' },
];

const PROCESS = [
  { step: '01', title: 'Intro call, 30 minutes', body: 'With the hiring manager, not a recruiter reading a script. You get the band and the team context up front.' },
  { step: '02', title: 'Craft interview, 90 minutes', body: 'A real problem from our backlog, discussed together. No whiteboard algorithms, no take-home over four hours.' },
  { step: '03', title: 'Team conversations, 2 × 45 minutes', body: 'Two people you would work with weekly. One of them is deliberately from a different discipline.' },
  { step: '04', title: 'Decision within 3 days', body: 'Written feedback either way. If we say no, we tell you specifically why.' },
];

export default function CareersPage() {
  useSeo({
    title: 'Careers',
    description:
      '31 open roles across nine timezones. Published salary bands, a four-step process, and written feedback either way.',
  });

  const [team, setTeam] = useState('All');
  const roles = useMemo(() => (team === 'All' ? ROLES : ROLES.filter((r) => r.team === team)), [team]);

  return (
    <>
      <PageHero
        eyebrow="Careers"
        title={
          <>
            Come build the boring parts
            <br />
            <span className="text-aurora">properly.</span>
          </>
        }
        body="Exchanges are infrastructure. The interesting work is making the unglamorous parts unbreakable — settlement, custody, the tail of the latency distribution."
        actions={
          <ButtonLink to="#roles" size="lg" sheen>
            See {ROLES.length} open roles
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </ButtonLink>
        }
      />

      <Section>
        <div className="shell">
          <SectionHeading
            eyebrow="Benefits"
            title="What we actually offer"
            body="Written plainly, because a benefits page that needs interpretation is a warning sign."
          />
          <StaggerGroup className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map((benefit) => (
              <StaggerItem key={benefit.title}>
                <Card interactive className="h-full p-6">
                  <benefit.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{benefit.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section id="roles" tone="sunken">
        <div className="shell">
          <SectionHeading eyebrow="Open roles" title={`${ROLES.length} roles, nine timezones`} />

          <Reveal className="mask-x mt-12 overflow-x-auto pb-1">
            <div className="flex gap-2">
              {TEAMS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTeam(t)}
                  aria-pressed={team === t}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-all duration-300',
                    team === t
                      ? 'border-brand-soft/60 bg-brand/15 text-fg'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </Reveal>

          <StaggerGroup className="mt-8 overflow-hidden rounded-lg border border-line">
            {roles.map((role) => (
              <StaggerItem key={role.title}>
                <a
                  href="#apply"
                  className="group flex flex-col gap-2 border-b border-line/60 bg-bg-elev/40 px-6 py-5 transition-colors last:border-0 hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-6"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-semibold text-fg">{role.title}</h3>
                    <p className="mt-1 text-sm text-fg-subtle">
                      {role.team} · {role.location}
                    </p>
                  </div>
                  <Badge tone="neutral">{role.level}</Badge>
                  <Badge tone="brand">{role.type}</Badge>
                  <ArrowRight className="hidden size-4 shrink-0 text-fg-subtle transition-all duration-300 group-hover:translate-x-1 group-hover:text-fg sm:block" />
                </a>
              </StaggerItem>
            ))}
          </StaggerGroup>

          {roles.length === 0 ? (
            <p className="mt-8 text-center text-sm text-fg-muted">
              Nothing open on that team right now.
            </p>
          ) : null}
        </div>
      </Section>

      <Section id="apply">
        <div className="shell">
          <SectionHeading
            eyebrow="Process"
            title="Four steps, three days to a decision"
            body="No take-home that eats a weekend, no algorithm trivia, no interview loop that stretches over five weeks."
          />
          <StaggerGroup className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((step) => (
              <StaggerItem key={step.step}>
                <Card interactive className="h-full p-6">
                  <p className="font-mono text-3xl font-semibold text-brand-soft/40">{step.step}</p>
                  <h3 className="mt-4 font-display text-base font-semibold text-fg">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <CtaBand
        title="Nothing fits? Tell us anyway."
        body="We open roles for people more often than we admit publicly. Send us what you would want to work on."
        primary={{ label: 'Get in touch', to: '/contact' }}
        secondary={{ label: 'About Novex', to: '/about' }}
      />
    </>
  );
}
