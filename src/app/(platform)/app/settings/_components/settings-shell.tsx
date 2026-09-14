'use client';

import { useState, type ReactNode } from 'react';
import { Bell, ShieldCheck, SlidersHorizontal, User } from 'lucide-react';

import type { CurrentUserDto } from '@/modules/identity';
import type { DailyLimitDto } from '@/modules/ledger';
import { usePush } from '@/shared/firebase/use-push';
import { cn } from '@/shared/lib/cn';
import { ButtonLink } from '@/shared/ui/primitives/button-link';

import { PageHeader, Panel, PanelHeader } from '../../../../_console/components/page-header';
import { usd } from '../../_lib/format-usd';
import { PreciseLocationControl } from './precise-location-control';
import { ProfileForm } from './profile-form';

/**
 * Settings.
 *
 * ── Two tabs are gone, and most of a third ─────────────────────────────────────
 * This screen carried five tabs, of which one and a half were real. API keys was a
 * table of invented keys with invented scopes and a revoke button that did nothing —
 * there is no API key context, so the tab is gone rather than mocked. Trading
 * controls and six of seven notification switches went the same way: no matching
 * engine, no alerting, nothing that would have honoured them.
 *
 * What is left is what the platform can actually do. The principle is the one the
 * approvals queue applied to its risk scores — a control that looks like it works
 * and does not is worse than an absent one, because somebody will rely on it.
 *
 * ── The switches that remain do something ──────────────────────────────────────
 * Precise location asks the browser and feeds the presence context. Notifications
 * registers this device with Cloud Messaging and removes it again. Both have a
 * visible effect somewhere else in the product, which is the bar for being here.
 */

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'limits', label: 'Limits', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notifications', icon: Bell },
] as const;

type TabId = (typeof TABS)[number]['id'];

/**
 * A labelled switch.
 *
 * Controlled, not self-managing. The previous version held its own `useState` and
 * defaulted to on, which is how every switch on this page could look enabled while
 * nothing had been enabled — the state lived in the component and died with it.
 */
function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{description}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        // `p-0` is load-bearing. A `<button>` carries user-agent padding, and the
        // knob below is positioned `absolute` with no `left` — so its static
        // position started *inside* that padding, and the "on" translate pushed it
        // off the right-hand end of the track. That is the knob that was hanging
        // outside the pill. Anchoring it explicitly is the fix; killing the padding
        // keeps the geometry arithmetic honest.
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border p-0 transition-colors duration-300',
          checked ? 'border-brand-soft/60 bg-brand' : 'border-line bg-surface',
          disabled && 'opacity-40',
        )}
      >
        <span
          aria-hidden
          // 44px track − 2px border − 18px knob − 4px inset = 20px of travel.
          className={cn(
            'absolute left-0.5 top-0.5 size-4.5 rounded-full bg-white shadow-sm transition-transform duration-300',
            checked ? 'translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
}

/**
 * Push notifications for this browser.
 *
 * The one switch on this page whose "off" is as real as its "on": turning it off
 * deletes the device registration, so nothing is sent here again. A browser that
 * has refused permission cannot be talked into it from JavaScript, which is why
 * the denied state explains itself rather than offering a switch that will not move.
 */
function PushNotificationToggle() {
  const { state, enable, disable } = usePush();

  if (state === 'unconfigured') {
    return (
      <p className="py-3.5 text-xs leading-relaxed text-fg-subtle">
        Notifications are not configured on this deployment.
      </p>
    );
  }

  if (state === 'unsupported') {
    return (
      <p className="py-3.5 text-xs leading-relaxed text-fg-subtle">
        This browser cannot receive web notifications. On iPhone and iPad they arrive
        only for a site added to the Home Screen.
      </p>
    );
  }

  if (state === 'denied') {
    return (
      <p className="py-3.5 text-xs leading-relaxed text-fg-subtle">
        Notifications are blocked for this site. A browser will not re-ask once
        refused — allow them in your browser&rsquo;s site settings and reload.
      </p>
    );
  }

  return (
    <Toggle
      label="Support replies"
      description="A notification on this device when an agent answers you."
      checked={state === 'granted'}
      disabled={state === 'working'}
      onChange={(next) => void (next ? enable() : disable())}
    />
  );
}

/**
 * `sessions` is a slot, not an import.
 *
 * This component is interactive — tabs and switches — so it is a Client Component.
 * The session list needs the session, which only the server can read. Passing the
 * already-rendered element through as a prop is what lets a Server Component live
 * inside a Client Component: it arrives as rendered output rather than as a module
 * the browser has to execute.
 */
export function SettingsShell({
  user,
  limits,
  sessions,
}: {
  user: CurrentUserDto;
  /** Null when the ledger could not be read. A missing limit is not a zero limit. */
  limits: DailyLimitDto | null;
  sessions: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>('profile');

  return (
    <>
      <PageHeader title="Settings" description="Account, security and limits." />

      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        <nav aria-label="Settings sections" className="lg:sticky lg:top-24 lg:self-start">
          <ul className="mask-x flex gap-1 overflow-x-auto pb-1 lg:mask-none lg:flex-col lg:overflow-visible lg:pb-0">
            {TABS.map((item) => (
              <li key={item.id} className="shrink-0 lg:shrink">
                <button
                  type="button"
                  onClick={() => setTab(item.id)}
                  aria-current={tab === item.id ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors',
                    tab === item.id
                      ? 'bg-surface-hover font-medium text-fg'
                      : 'text-fg-muted hover:bg-surface hover:text-fg',
                  )}
                >
                  <item.icon className={cn('size-4', tab === item.id && 'text-brand-soft')} />
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-4">
          {tab === 'profile' ? (
            <Panel>
              <PanelHeader title="Profile" subtitle="How you appear across Novex" />
              <ProfileForm user={user} />
            </Panel>
          ) : null}

          {tab === 'security' ? (
            <>
              <Panel>
                <PanelHeader
                  title="Sign-in"
                  subtitle="What this application actually enforces today"
                />
                <div className="divide-y divide-line/60">
                  {/* The only place this application asks for geolocation. Every
                      other surface uses the coarse, connection-derived location,
                      which needs nothing from the account holder. */}
                  <PreciseLocationControl />
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                  {/* A link, not a button: changing a password goes through the
                      emailed-token flow that already exists, rather than a dialog
                      that would need a second one. */}
                  <ButtonLink href="/forgot-password" variant="outline" size="sm">
                    Change password
                  </ButtonLink>
                </div>

                {/* Passkeys and a hardware key were listed here as active. Neither
                    exists: this application authenticates with a password and a
                    sealed session cookie. Saying so is the honest version of a
                    security page. */}
                <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
                  Sign-in is by password. Passkeys and hardware keys are not supported
                  yet, and this page will say so until they are.
                </p>
              </Panel>

              <Panel>{sessions}</Panel>
            </>
          ) : null}

          {tab === 'limits' ? (
            <Panel>
              <PanelHeader
                title="Daily withdrawal limit"
                subtitle={
                  limits ? `${limits.tier} tier · resets 00:00 UTC` : 'Could not be read'
                }
              />
              {limits === null ? (
                <p className="text-xs leading-relaxed text-fg-subtle">
                  Your limit could not be read just now. This is a failed request, not
                  a limit of zero.
                </p>
              ) : (
                <>
                  <LimitMeter used={limits.usedUsd} cap={limits.capUsd} />
                  <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
                    {/* The rule, stated where it bites. A per-asset cap would be
                        avoidable by withdrawing a different coin, which is why the
                        cap is on value leaving the platform. */}
                    The cap is on value, not on any one asset — a withdrawal is measured
                    in dollars at the price when you request it. Card, bank and API
                    limits are not shown because none of those routes exist yet.
                  </p>
                </>
              )}
            </Panel>
          ) : null}

          {tab === 'notifications' ? (
            <Panel>
              <PanelHeader title="Notifications" subtitle="Per device, not per account" />
              <div className="divide-y divide-line/60">
                <PushNotificationToggle />
              </div>
              <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
                This setting belongs to the browser you are using, not to your account:
                permission is granted per device, and turning it off here stops
                notifications on this one only.
              </p>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}

/**
 * Used against the cap.
 *
 * Both arrive as exact decimal strings and are converted once, here, purely to
 * compute a bar width — the *labels* are rendered straight from the strings, so no
 * displayed number has passed through a float.
 */
function LimitMeter({ used, cap }: { used: string; cap: string }) {
  const capValue = Number(cap);
  const pct = capValue > 0 ? Math.min(100, (Number(used) / capValue) * 100) : 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-fg-muted">Withdrawals</span>
        <span data-numeric className="text-fg">
          {usd(used)} <span className="text-fg-subtle">of {usd(cap)}</span>
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
        <div
          className={cn('h-full rounded-full', pct > 80 ? 'bg-warn' : 'bg-brand')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
