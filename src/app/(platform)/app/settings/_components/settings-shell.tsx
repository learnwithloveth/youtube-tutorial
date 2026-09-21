'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bell, IdCard, ShieldCheck, User, Wallet } from 'lucide-react';

import type {
  CurrentUserDto,
  SignInMethodsDto,
  VerificationStandingDto,
} from '@/modules/identity';
import { BRAND } from '@/modules/content';
import { usePush } from '@/shared/firebase/use-push';
import { cn } from '@/shared/lib/cn';

import { PageHeader, Panel, PanelHeader } from '../../../../_console/components/page-header';
import { pushScopeFor } from '../../../../_lib/console-app';
import { IdentityVerification } from './identity-verification';
import { PreciseLocationControl } from './precise-location-control';
import { ProfileForm } from './profile-form';
import { SignInMethods } from './sign-in-methods';
import { WalletIntegrationGate } from './wallet-integration-gate';

/**
 * Settings.
 *
 * ── Three tabs are gone, and most of a fourth ──────────────────────────────────
 * This screen carried five tabs, of which one and a half were real. API keys was a
 * table of invented keys with invented scopes and a revoke button that did nothing —
 * there is no API key context, so the tab is gone rather than mocked. Trading
 * controls and six of seven notification switches went the same way: no matching
 * engine, no alerting, nothing that would have honoured them.
 *
 * Limits went last, and for a different reason: it was real, but it was a second
 * copy. The wallet page already states the daily cap, what has been used against
 * it and when it resets, beside the withdrawal form where that number decides
 * something. The cap itself is untouched — `checkDailyLimit` still refuses a
 * withdrawal over it. Only the duplicate readout is gone.
 *
 * What is left is what the platform can actually do. The principle is the one the
 * approvals queue applied to its risk scores — a control that looks like it works
 * and does not is worse than an absent one, because somebody will rely on it.
 *
 * ── The switches that remain do something ──────────────────────────────────────
 * Precise location asks the browser and feeds the presence context. Notifications
 * registers this device with Cloud Messaging and removes it again. Both have a
 * visible effect somewhere else in the product, which is the bar for being here.
 *
 * ── Identity verification is started here ──────────────────────────────────────
 * It used to be the last step of sign-up, with no way past it. The Verification
 * tab is now where the account holder starts it, and where they see how their
 * case stands, including a reviewer's reason for turning it down.
 */

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'verification', label: 'Verification', icon: IdCard },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  /* Off by default for every account, and the tab says so rather than being
     hidden: somebody who has never connected a wallet should still be able to
     find out that they could. See `WalletIntegrationGate`. */
  { id: 'wallets', label: 'Wallets', icon: Wallet },
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
function PushNotificationToggle({ userId, scope }: { userId: string; scope: string }) {
  const { state, error, enable, disable } = usePush(userId, scope);

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
    <>
      <Toggle
        // Was "Support replies — a notification on this device when an agent answers
        // you". True when support was the only thing that pushed; this switch now also
        // controls price alerts, deposit and withdrawal decisions and security events,
        // so the old wording described a fraction of what turning it on does.
        label="Push notifications"
        description="Price alerts, deposits, withdrawals, sign-ins and support replies, on this device."
        checked={state === 'granted'}
        disabled={state === 'working'}
        onChange={(next) => void (next ? enable() : disable())}
      />
      {error !== null ? (
        <p role="alert" className="pb-3.5 text-xs leading-relaxed text-down">
          {error}
        </p>
      ) : null}
    </>
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
  sessions,
  verification,
  signInMethods,
  googleConfigured,
  googleNotice,
  wallets,
  walletsEnabled,
  initialTab,
}: {
  user: CurrentUserDto;
  sessions: ReactNode;
  verification: VerificationStandingDto;
  /** Null when the read failed. A missing answer is not "no password". */
  signInMethods: SignInMethodsDto | null;
  /** Whether this deployment has Google credentials at all. */
  googleConfigured: boolean;
  /** The `?google=` outcome the OAuth callback redirected back with. */
  googleNotice?: string | undefined;
  /**
   * The wallet panels, server-rendered. Null when the account has not enabled it.
   *
   * A slot for the same reason `sessions` is one: this component is a client
   * boundary, and the wallet table has no business hydrating. The page decides
   * whether to build it at all, so a disabled account costs no database read.
   */
  wallets: ReactNode;
  walletsEnabled: boolean;
  /**
   * The tab named by `?tab=`, so another page can link straight to one.
   *
   * Arrives unchecked and is matched against `TABS` here, because the page cannot
   * do it: a value imported from a `'use client'` module is only a reference on the
   * server. Anything unrecognised opens on Profile.
   */
  initialTab?: string | undefined;
}) {
  const [tab, setTab] = useState<TabId>(
    () => TABS.find((item) => item.id === initialTab)?.id ?? 'profile',
  );

  return (
    <>
      <PageHeader title="Settings" description="Account, security and limits." />

      <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
        {/* `min-w-0` so the tab strip scrolls inside itself on a narrow screen.
            Without it this grid column grows to the width of all five tabs laid
            out in a row, and the page scrolls sideways rather than the strip. */}
        <nav
          aria-label="Settings sections"
          className="min-w-0 lg:sticky lg:top-24 lg:self-start"
        >
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
              <PanelHeader title="Profile" subtitle={`How you appear across ${BRAND.name}`} />
              <ProfileForm user={user} />
            </Panel>
          ) : null}

          {tab === 'verification' ? <IdentityVerification standing={verification} /> : null}

          {tab === 'security' ? (
            <>
              <SignInMethods
                methods={signInMethods}
                googleConfigured={googleConfigured}
                notice={googleNotice}
              />

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

                {/* Passkeys and a hardware key were listed here as active. Neither
                    exists. The password half is no longer the whole story either:
                    Google sign-in is real now, which is why the line names both and
                    the panel above shows which this account uses.

                    "Change password" used to be a link to the emailed-reset flow
                    from here. It is a form in that panel now — somebody who is
                    signed in and knows their password should not have to go and
                    read their mail to change it. */}
                <p className="mt-5 border-t border-line pt-5 text-xs leading-relaxed text-fg-subtle">
                  Sign-in is by password or Google. Passkeys and hardware keys are not
                  supported yet, and this page will say so until they are. Forgotten your
                  password? Sign out and use the{' '}
                  <Link
                    href="/forgot-password"
                    className="text-brand-soft underline-offset-4 hover:underline"
                  >
                    reset link
                  </Link>
                  .
                </p>
              </Panel>

              <Panel>{sessions}</Panel>
            </>
          ) : null}

          {tab === 'wallets' ? (
            <WalletIntegrationGate enabled={walletsEnabled}>{wallets}</WalletIntegrationGate>
          ) : null}

          {tab === 'notifications' ? (
            <Panel>
              <PanelHeader title="Notifications" subtitle="Per device, not per account" />
              <div className="divide-y divide-line/60">
                <PushNotificationToggle userId={user.id} scope={pushScopeFor(user.role)} />
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

