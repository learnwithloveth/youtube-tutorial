import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  Ban,
  Clock,
  Crosshair,
  FileText,
  KeyRound,
  LogIn,
  LogOut,
  MailCheck,
  MapPin,
  Receipt,
  Send,
  UserPlus,
  Wifi,
  ShieldCheck,
  ShieldOff,
  IdCard,
  BellRing,
} from 'lucide-react';

import type { ActivityEventDto, ActivityKind, EventLocation } from '@/modules/activity';
import { formatDuration } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';

import { countryFlag, countryName } from '../../../live/_lib/geography';

/**
 * One account's history, newest first.
 *
 * A Server Component: it renders a fixed past, so there is nothing to refresh and
 * nothing to hydrate. The only live thing on the account page is the strip of open
 * tabs above it, and that comes from presence.
 */

const KIND_META: Record<
  ActivityKind,
  { label: string; icon: typeof LogIn; tone: 'brand' | 'up' | 'warn' | 'neutral' }
> = {
  'page-view': { label: 'Viewed page', icon: FileText, tone: 'neutral' },
  'sign-up': { label: 'Created account', icon: UserPlus, tone: 'brand' },
  'sign-in': { label: 'Signed in', icon: LogIn, tone: 'up' },
  'sign-out': { label: 'Signed out', icon: LogOut, tone: 'neutral' },
  'password-reset': { label: 'Password reset', icon: KeyRound, tone: 'warn' },
  'verification-sent': { label: 'Verification email sent', icon: Send, tone: 'neutral' },
  'email-verified': { label: 'Email verified', icon: MailCheck, tone: 'up' },
  'withdrawal-requested': { label: 'Requested a withdrawal', icon: ArrowUpFromLine, tone: 'warn' },
  'withdrawal-approved': { label: 'Withdrawal approved', icon: BadgeCheck, tone: 'up' },
  'withdrawal-rejected': { label: 'Withdrawal rejected', icon: Ban, tone: 'warn' },
  'deposit-recorded': { label: 'Deposit credited', icon: ArrowDownToLine, tone: 'brand' },
  'deposit-rejected': { label: 'Deposit refused', icon: ArrowDownToLine, tone: 'warn' },
  // Passive, because that is how they are recorded — against the account it
  // happened to, with the operator who did it in the detail line.
  'admin-suspended': { label: 'Console access suspended', icon: ShieldOff, tone: 'warn' },
  'admin-reinstated': { label: 'Console access restored', icon: ShieldCheck, tone: 'up' },
  'receipt-sent': { label: 'Receipt emailed', icon: Receipt, tone: 'neutral' },
  'verification-submitted': { label: 'Submitted identity documents', icon: IdCard, tone: 'neutral' },
  'verification-approved': { label: 'Identity verified', icon: IdCard, tone: 'up' },
  'verification-rejected': { label: 'Identity verification refused', icon: IdCard, tone: 'warn' },
  'price-alert-triggered': { label: 'Price alert fired', icon: BellRing, tone: 'neutral' },
};

export function ActivityTimeline({ events }: { events: readonly ActivityEventDto[] }) {
  if (events.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-fg-subtle">
        Nothing recorded yet. History starts from the first page this account opens
        while signed in.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, index) => {
        const meta = KIND_META[event.kind];

        return (
          <li key={event.id} className="relative flex gap-3 pb-5">
            {/* The rail is drawn per item rather than as one absolute element, so
                it stops at the last entry instead of trailing past it. */}
            {index < events.length - 1 ? (
              <span aria-hidden className="absolute left-[0.9375rem] top-8 h-full w-px bg-line" />
            ) : null}

            <span
              aria-hidden
              className={cn(
                'relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border',
                event.kind === 'page-view'
                  ? 'border-line bg-bg-elev text-fg-subtle'
                  : 'border-brand-soft/40 bg-brand/12 text-brand-soft',
              )}
            >
              <meta.icon className="size-3.5" />
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm text-fg">{meta.label}</span>
                {event.path ? (
                  <span className="font-mono text-xs text-brand-soft">{event.path}</span>
                ) : null}
                {event.detail ? (
                  <span className="font-mono text-xs text-fg">{event.detail}</span>
                ) : null}
                {event.durationSeconds !== null ? (
                  <span className="inline-flex items-center gap-1 text-2xs text-fg-subtle">
                    <Clock className="size-3" />
                    {formatDuration(event.durationSeconds)}
                  </span>
                ) : null}
              </div>

              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-fg-subtle">
                <time dateTime={event.occurredAt}>{stamp(event.occurredAt)}</time>
                <Dot />
                <LocationLabel location={event.location} />
                {event.browser || event.device ? (
                  <>
                    <Dot />
                    <span>
                      {[event.device, event.browser].filter(Boolean).join(' · ')}
                    </span>
                  </>
                ) : null}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Dot() {
  return <span aria-hidden className="text-fg-subtle/50">·</span>;
}

/**
 * The place, with its provenance.
 *
 * The source is shown rather than implied, for the reason it is shown everywhere
 * else: a location the device reported and one guessed from an IP address are not
 * the same claim, and an operator comparing two sign-ins needs to know which is
 * which before drawing a conclusion from the difference.
 */
function LocationLabel({ location }: { location: EventLocation | null }) {
  if (location === null) {
    return (
      <span className="inline-flex items-center gap-1">
        <Wifi className="size-3" />
        Location not resolved
      </span>
    );
  }

  const parts = [location.city, countryName(location.country)].filter(Boolean);

  return (
    <span className="inline-flex items-center gap-1">
      {location.source === 'device' ? (
        <Crosshair className="size-3 text-brand-soft" />
      ) : (
        <MapPin className="size-3" />
      )}
      <span aria-hidden>{countryFlag(location.country)}</span>
      {parts.join(', ') || 'Unknown'}
      {location.source === 'device' ? (
        <Badge tone="brand" className="ml-1 px-1.5 py-0">
          device
        </Badge>
      ) : null}
    </span>
  );
}

/**
 * Timestamps are pinned to UTC.
 *
 * The same rule the rest of the console follows: two operators comparing an
 * incident over a call must be reading the same clock, and a server-rendered local
 * time would differ from the browser's anyway.
 */
const stampFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'UTC',
});

function stamp(iso: string): string {
  return `${stampFormatter.format(new Date(iso))} UTC`;
}
