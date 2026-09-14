import { CheckCircle2, CircleAlert, CircleDot, Wrench } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { Card } from '@/shared/ui/primitives/card';
import { Badge } from '@/shared/ui/primitives/badge';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { buildUptimeBars } from './_lib/uptime-bars';
import type { Metadata } from 'next';

import { getSurfaceAnnouncements } from '@/server/announcements';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

type Health = 'operational' | 'degraded' | 'maintenance';

const SERVICES: { name: string; description: string; health: Health; uptime: number }[] = [
  { name: 'Matching engine', description: 'Order entry, cancellation and fills', health: 'operational', uptime: 99.997 },
  { name: 'REST API', description: 'api.novex.io/v3', health: 'operational', uptime: 99.994 },
  { name: 'WebSocket streams', description: 'stream.novex.io/v3', health: 'operational', uptime: 99.981 },
  { name: 'Web application', description: 'novex.io', health: 'operational', uptime: 99.999 },
  { name: 'Mobile apps', description: 'iOS and Android clients', health: 'operational', uptime: 99.996 },
  { name: 'Fiat deposits', description: 'Card, SEPA, FPS, ACH, PIX, NIP', health: 'degraded', uptime: 99.912 },
  { name: 'On-chain withdrawals', description: '32 supported networks', health: 'operational', uptime: 99.988 },
  { name: 'Novex Wallet', description: 'MPC signing and recovery', health: 'operational', uptime: 99.993 },
  { name: 'Staking rewards', description: 'Delegation and daily distribution', health: 'maintenance', uptime: 99.971 },
];

const INCIDENTS = [
  {
    date: '2026-08-28',
    title: 'Elevated latency on SEPA Instant deposits',
    severity: 'Minor' as const,
    status: 'Monitoring' as const,
    updates: [
      { time: '14:20 UTC', text: 'Our banking partner has confirmed the upstream fix is deployed. We are monitoring settlement times.' },
      { time: '12:05 UTC', text: 'Deposits are completing but taking 8–20 minutes rather than the usual 2. No funds are at risk.' },
      { time: '11:48 UTC', text: 'Investigating reports of delayed SEPA Instant credits.' },
    ],
  },
  {
    date: '2026-08-11',
    title: 'Scheduled maintenance — staking distribution',
    severity: 'Maintenance' as const,
    status: 'Scheduled' as const,
    updates: [
      { time: '02:00 UTC', text: 'Validator set rotation for three networks. Reward accrual continues; distribution is delayed by up to four hours.' },
    ],
  },
  {
    date: '2026-07-19',
    title: 'WebSocket reconnect storm after regional failover',
    severity: 'Major' as const,
    status: 'Resolved' as const,
    updates: [
      { time: '09:41 UTC', text: 'Resolved. Full postmortem published on the blog within five business days, as per policy.' },
      { time: '09:12 UTC', text: 'Connection capacity restored. Clients that backed off exponentially reconnected cleanly.' },
      { time: '08:54 UTC', text: 'A failover in eu-central caused all subscribers to reconnect simultaneously, exhausting the connection pool. REST and matching were unaffected.' },
    ],
  },
];

const HEALTH_META: Record<Health, { label: string; tone: 'up' | 'warn' | 'accent'; Icon: typeof CheckCircle2 }> = {
  operational: { label: 'Operational', tone: 'up', Icon: CheckCircle2 },
  degraded: { label: 'Degraded', tone: 'warn', Icon: CircleAlert },
  maintenance: { label: 'Maintenance', tone: 'accent', Icon: Wrench },
};

/** 90 daily bars. Illustrative, not measured — see `_lib/uptime-bars`. */
function UptimeBars({ seed, health }: { seed: string; health: Health }) {
  const bars = buildUptimeBars(seed, health);
  return (
    <div className="flex h-8 items-end gap-[2px]" aria-hidden>
      {bars.map((tone, i) => (
        <span
          key={i}
          className={cn(
            'h-full flex-1 rounded-[1px] transition-opacity',
            tone === 'up' && 'bg-up/55',
            tone === 'warn' && 'bg-warn/80',
            tone === 'accent' && 'bg-accent/70',
          )}
        />
      ))}
    </div>
  );
}

export const metadata: Metadata = {
  title: 'System status',
  description: 'Live service health, uptime history and the incident log for the Novex platform.',
};

export default async function StatusPage() {
  const notices = await getSurfaceAnnouncements('status');

  const allGreen = SERVICES.every((s) => s.health === 'operational');

  return (
    <>
      <PageHero
        eyebrow="Status"
        title={
          allGreen ? (
            <>
              All systems <span className="text-aurora">operational.</span>
            </>
          ) : (
            <>
              One service <span className="text-aurora">degraded.</span>
            </>
          )
        }
        body="Live health for every component, a 90-day uptime history, and an incident log we publish whether or not anyone noticed."
        actions={
          <>
            <ButtonLink href="/contact" variant="outline" size="lg">
              Report an issue
            </ButtonLink>
            <ButtonLink href="/blog" variant="ghost" size="lg">
              Read our postmortems
            </ButtonLink>
          </>
        }
      />

      <Section className="pt-0">
        <div className="shell">
          <StaggerGroup className="overflow-hidden rounded-lg border border-line">
            {SERVICES.map((service) => {
              const meta = HEALTH_META[service.health];
              return (
                <StaggerItem key={service.name}>
                  <div className="grid gap-4 border-b border-line/60 bg-bg-elev/40 px-6 py-5 last:border-0 lg:grid-cols-[1.2fr_1.4fr_auto] lg:items-center">
                    <div>
                      <h2 className="font-display text-base font-semibold text-fg">{service.name}</h2>
                      <p className="mt-0.5 text-xs text-fg-subtle">{service.description}</p>
                    </div>
                    <div>
                      <UptimeBars seed={service.name} health={service.health} />
                      <div className="mt-1.5 flex justify-between text-2xs text-fg-subtle">
                        <span>90 days ago</span>
                        <span data-numeric>{service.uptime.toFixed(3)}% uptime</span>
                        <span>Today</span>
                      </div>
                    </div>
                    <Badge tone={meta.tone} className="justify-self-start lg:justify-self-end">
                      <meta.Icon className="size-3" />
                      {meta.label}
                    </Badge>
                  </div>
                </StaggerItem>
              );
            })}
          </StaggerGroup>
        </div>
      </Section>

      {/* Real notices, written in the console and published to this surface.
          Above the incident log because a current notice is why somebody opened
          this page, and the log is what they read afterwards. */}
      {notices.length === 0 ? null : (
        <Section>
          <div className="shell">
            <SectionHeading
              eyebrow="Notices"
              title="What we are telling customers right now"
              body="Published from the operations console. Each one comes down on its own schedule."
            />

            <div className="mx-auto mt-14 max-w-3xl space-y-4">
              {notices.map((notice) => (
                <Reveal key={notice.id}>
                  <Card className="p-7">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge
                        tone={
                          notice.tone === 'critical'
                            ? 'down'
                            : notice.tone === 'warning'
                              ? 'warn'
                              : 'accent'
                        }
                        className="capitalize"
                      >
                        {notice.tone}
                      </Badge>
                      <span className="ml-auto text-xs text-fg-subtle">
                        {notice.publishAt === null ? null : formatDate(notice.publishAt)}
                      </span>
                    </div>

                    <h3 className="mt-5 font-display text-xl font-semibold text-fg">
                      {notice.title}
                    </h3>
                    <p className="mt-3 leading-relaxed text-fg-muted">{notice.body}</p>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </Section>
      )}

      <Section tone="sunken">
        <div className="shell">
          <SectionHeading
            eyebrow="Incidents"
            title="The full log, nothing omitted"
            body="Every incident that degraded customer experience, with the update trail exactly as it was posted."
          />

          <div className="mx-auto mt-14 max-w-3xl space-y-4">
            {INCIDENTS.map((incident) => (
              <Reveal key={incident.title}>
                <Card className="p-7">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      tone={
                        incident.severity === 'Major'
                          ? 'down'
                          : incident.severity === 'Minor'
                            ? 'warn'
                            : 'accent'
                      }
                    >
                      {incident.severity}
                    </Badge>
                    <Badge tone={incident.status === 'Resolved' ? 'up' : 'neutral'}>
                      {incident.status}
                    </Badge>
                    <span className="ml-auto text-xs text-fg-subtle">
                      {formatDate(incident.date)}
                    </span>
                  </div>

                  <h3 className="mt-5 font-display text-xl font-semibold text-fg">
                    {incident.title}
                  </h3>

                  <ol className="mt-6 space-y-4 border-l border-line pl-6">
                    {incident.updates.map((update) => (
                      <li key={update.time} className="relative">
                        <span
                          aria-hidden
                          className="absolute -left-[1.7rem] top-1.5 size-2 rounded-full bg-brand-soft"
                        />
                        <p className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                          {update.time}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{update.text}</p>
                      </li>
                    ))}
                  </ol>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <p className="mt-10 flex items-center justify-center gap-2 text-xs text-fg-subtle">
              <CircleDot className="size-3" />
              Status page updates within 15 minutes of detection and at least every 30 minutes
              thereafter.
            </p>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
