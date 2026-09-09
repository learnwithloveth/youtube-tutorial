import type { Metadata } from 'next';
import { ArrowRight, BookOpen, Clock, GraduationCap, Lightbulb } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { Card } from '@/shared/ui/primitives/card';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Badge } from '@/shared/ui/primitives/badge';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { DisclosureList } from '@/shared/ui/primitives/disclosure';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { listLearnTracks } from '@/modules/content';

const GLOSSARY = [
  { question: 'Spread', answer: 'The gap between the best bid and the best ask. It is a real cost even though it never appears on your fee statement — you pay half of it going in and half coming out.' },
  { question: 'Slippage', answer: 'The difference between the price you expected and the price you got. Caused by the market moving between your decision and your fill, and by your own order consuming depth.' },
  { question: 'Maker and taker', answer: 'A maker order rests on the book and adds liquidity. A taker order crosses the spread and removes it. Venues charge takers more because liquidity is the scarce thing.' },
  { question: 'Market capitalisation', answer: 'Circulating supply multiplied by price. It is a useful sorting key and a poor measure of how much money is actually in an asset — moving the price of a thin asset changes the cap far more than the flow that moved it.' },
  { question: 'Slashing', answer: 'A protocol penalty applied to a validator that misbehaves or goes offline, taken from the stake backing it. If you delegated to that validator, a share of the penalty is yours.' },
  { question: 'Proof of reserves', answer: 'A cryptographic demonstration that customer balances sum to a published total backed by verifiable on-chain assets. It proves inclusion; it does not by itself prove there are no hidden liabilities.' },
];

export const metadata: Metadata = {
  title: 'Academy',
  description:
    'From your first wallet to derivatives: honest lessons on how crypto markets actually work.',
};

export default function LearnPage() {

  const totalMinutes = listLearnTracks().flatMap((t) => t.lessons).reduce((sum, l) => sum + l.minutes, 0);

  return (
    <>
      <PageHero
        eyebrow="Academy"
        title={
          <>
            Learn enough to
            <br />
            <span className="text-aurora">disagree with us.</span>
          </>
        }
        body={`Twelve lessons, ${totalMinutes} minutes total, written by the people who build the systems being described. No affiliate links, no signals, no urgency.`}
        actions={
          <>
            <ButtonLink href="#tracks" size="lg" sheen>
              Start with foundations
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/blog" variant="outline" size="lg">
              Read the research blog
            </ButtonLink>
          </>
        }
      />

      <Section>
        <div className="shell">
          <StaggerGroup className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: BookOpen, label: 'Lessons', value: '12' },
              { icon: Clock, label: 'Total reading time', value: `${totalMinutes} min` },
              { icon: GraduationCap, label: 'Tracks', value: '3' },
            ].map((stat) => (
              <StaggerItem key={stat.label}>
                <Card className="flex items-center gap-4 p-6">
                  <stat.icon className="size-6 text-brand-soft" />
                  <div>
                    <p data-numeric className="font-display text-2xl font-semibold text-fg">
                      {stat.value}
                    </p>
                    <p className="text-xs uppercase tracking-wider text-fg-subtle">{stat.label}</p>
                  </div>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section id="tracks" tone="sunken">
        <div className="shell space-y-20">
          {listLearnTracks().map((track, trackIndex) => (
            <div key={track.name}>
              <Reveal>
                <p className="eyebrow mb-4">
                  <span aria-hidden className="h-px w-6 bg-gradient-to-r from-transparent to-brand-soft" />
                  Track {String(trackIndex + 1).padStart(2, '0')}
                </p>
                <h2 className="text-3xl font-semibold">{track.name}</h2>
                <p className="mt-3 max-w-2xl text-lg text-fg-muted">{track.description}</p>
              </Reveal>

              <StaggerGroup className="mt-10 grid gap-4 sm:grid-cols-2">
                {track.lessons.map((lesson, i) => (
                  <StaggerItem key={lesson.title}>
                    <InteractiveCard className="group h-full p-6">
                      <div className="flex items-start justify-between gap-4">
                        <span className="font-mono text-2xl font-semibold text-brand-soft/35">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <Badge
                          tone={
                            lesson.level === 'Beginner'
                              ? 'up'
                              : lesson.level === 'Intermediate'
                                ? 'accent'
                                : 'warn'
                          }
                        >
                          {lesson.level}
                        </Badge>
                      </div>
                      <h3 className="mt-4 font-display text-lg font-semibold text-fg">
                        {lesson.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-fg-muted">{lesson.summary}</p>
                      <p className="mt-5 inline-flex items-center gap-1.5 border-t border-line pt-4 text-xs text-fg-subtle">
                        <Clock className="size-3" />
                        {lesson.minutes} min read
                      </p>
                    </InteractiveCard>
                  </StaggerItem>
                ))}
              </StaggerGroup>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <SectionHeading
            align="left"
            eyebrow="Glossary"
            title="Six terms worth getting right"
            body="Most crypto confusion is vocabulary confusion wearing a costume."
            className="lg:sticky lg:top-28 lg:self-start"
          >
            <Lightbulb className="size-6 text-brand-soft" />
          </SectionHeading>
          <Reveal delay={0.1}>
            <DisclosureList items={GLOSSARY} />
          </Reveal>
        </div>
      </Section>

      <CtaBand
        title="Learn on a real account, with real amounts."
        body="You do not need much to start. Ten dollars teaches more than ten articles."
        primary={{ label: 'Create free account', href: '/signup' }}
        secondary={{ label: 'See the fees first', href: '/fees' }}
      />
    </>
  );
}
