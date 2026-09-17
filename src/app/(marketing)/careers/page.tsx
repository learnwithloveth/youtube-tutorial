import { ArrowRight, Building, Coins, Globe2, GraduationCap, HeartPulse, Plane } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { BRAND, listRoles } from '@/modules/content';
import type { Metadata } from 'next';

import { RoleList } from './_components/role-list';

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

export const metadata: Metadata = {
  title: 'Careers',
  description:
    'Open roles across nine timezones, with published salary bands and a hiring process that respects your time.',
};

export default function CareersPage() {
  const roles = listRoles();

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
          <ButtonLink href="#roles" size="lg" sheen>
            See {listRoles().length} open roles
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
                <InteractiveCard className="h-full p-6">
                  <benefit.icon className="size-6 text-brand-soft" />
                  <h3 className="mt-5 font-display text-base font-semibold text-fg">{benefit.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{benefit.body}</p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section id="roles" tone="sunken">
        <div className="shell">
          <SectionHeading eyebrow="Open roles" title={`${listRoles().length} roles, nine timezones`} />

          <RoleList roles={roles} />
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
                <InteractiveCard className="h-full p-6">
                  <p className="font-mono text-3xl font-semibold text-brand-soft/40">{step.step}</p>
                  <h3 className="mt-4 font-display text-base font-semibold text-fg">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
                </InteractiveCard>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <CtaBand
        title="Nothing fits? Tell us anyway."
        body="We open roles for people more often than we admit publicly. Send us what you would want to work on."
        primary={{ label: 'Get in touch', href: '/contact' }}
        secondary={{ label: `About ${BRAND.name}`, href: '/about' }}
      />
    </>
  );
}
