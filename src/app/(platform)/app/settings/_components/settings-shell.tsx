'use client';

import { useState, type ReactNode } from 'react';
import {
  Bell, Check, Copy, Fingerprint, Key, Plus, ShieldCheck, SlidersHorizontal, Trash2, User,
} from 'lucide-react';
import { PageHeader, Panel, PanelHeader } from '../../../../_console/components/page-header';
import { TableShell, Td, Th, Tr } from '../../../../_console/components/table';
import { Meter } from '@/shared/ui/charts/stat-tile';
import { Button } from '@/shared/ui/primitives/button';
import { Badge } from '@/shared/ui/primitives/badge';
import { SelectField, TextField } from '@/shared/ui/primitives/field';
import { PreciseLocationControl } from './precise-location-control';
import { ACCOUNT, API_KEYS } from '../../../_data/data';
import { money } from '../../../../_console/data/format';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'api', label: 'API keys', icon: Key },
  { id: 'limits', label: 'Limits', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notifications', icon: Bell },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** A labelled switch. State is carried by the track position and the label. */
function Toggle({
  label, description, defaultOn = false,
}: {
  label: string;
  description?: string;
  defaultOn?: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-start justify-between gap-6 py-3.5">
      <div className="min-w-0">
        <p className="text-sm text-fg">{label}</p>
        {description ? <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((v) => !v)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300',
          on ? 'border-brand-soft/60 bg-brand' : 'border-line bg-surface',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-4.5 rounded-full bg-white shadow-sm transition-transform duration-300',
            on ? 'translate-x-[1.4rem]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

/**
 * `sessions` is a slot, not an import.
 *
 * This component is interactive — tabs, toggles, a clipboard — so it is a Client
 * Component. The session list needs the session, which only the server can read.
 * Passing the already-rendered element through as a prop is what lets a Server
 * Component live inside a Client Component: it arrives as rendered output rather
 * than as a module the browser has to execute.
 */
export function SettingsShell({ sessions }: { sessions: ReactNode }) {

  const [tab, setTab] = useState<TabId>('profile');
  const [copied, setCopied] = useState<string | null>(null);

  const copyKey = async (prefix: string) => {
    try {
      await navigator.clipboard.writeText(`${prefix}••••••••••••`);
      setCopied(prefix);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard unavailable in some embedded contexts */
    }
  };

  return (
    <>
      <PageHeader title="Settings" description="Account, security, keys and limits." />

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
            <>
              <Panel>
                <PanelHeader title="Profile" subtitle="How you appear across Novex" />
                <div className="mb-6 flex items-center gap-4">
                  <span
                    aria-hidden
                    className="grid size-16 place-items-center rounded-full text-lg font-semibold text-white"
                    style={{ background: `linear-gradient(140deg, ${ACCOUNT.hue}, color-mix(in oklab, ${ACCOUNT.hue} 40%, #05060b))` }}
                  >
                    {ACCOUNT.initials}
                  </span>
                  <div>
                    <p className="font-medium text-fg">{ACCOUNT.name}</p>
                    <p className="text-sm text-fg-subtle">
                      {ACCOUNT.handle} · member since {formatDate(ACCOUNT.memberSince)}
                    </p>
                    <Badge tone="up" className="mt-2">
                      <ShieldCheck className="size-3" />
                      Verified · {ACCOUNT.tier} tier
                    </Badge>
                  </div>
                </div>
                <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
                  <TextField label="Legal name" defaultValue={ACCOUNT.name} />
                  <TextField label="Display handle" defaultValue={ACCOUNT.handle} />
                  <TextField label="Email" type="email" defaultValue={ACCOUNT.email} />
                  <TextField label="Phone" defaultValue="+41 •• ••• 4412" />
                  <SelectField
                    label="Base currency"
                    options={[
                      { value: 'usd', label: 'US Dollar (USD)' },
                      { value: 'eur', label: 'Euro (EUR)' },
                      { value: 'gbp', label: 'Pound Sterling (GBP)' },
                      { value: 'ngn', label: 'Naira (NGN)' },
                    ]}
                  />
                  <SelectField
                    label="Time zone"
                    options={[
                      { value: 'utc', label: 'UTC' },
                      { value: 'cet', label: 'Europe/Zurich (CET)' },
                      { value: 'wat', label: 'Africa/Lagos (WAT)' },
                      { value: 'sgt', label: 'Asia/Singapore (SGT)' },
                    ]}
                  />
                  <div className="sm:col-span-2">
                    <Button type="submit">Save changes</Button>
                  </div>
                </form>
              </Panel>

              <Panel>
                <PanelHeader title="Verification" subtitle="Required by our regulators, completed once" />
                <ul className="divide-y divide-line/60">
                  {[
                    ['Identity document', 'Passport · verified 14 Mar 2021'],
                    ['Proof of address', 'Utility bill · verified 14 Mar 2021'],
                    ['Source of funds', 'Employment · verified 2 Feb 2024'],
                  ].map(([label, detail]) => (
                    <li key={label} className="flex items-center justify-between gap-4 py-3.5">
                      <div>
                        <p className="text-sm text-fg">{label}</p>
                        <p className="text-xs text-fg-subtle">{detail}</p>
                      </div>
                      <Badge tone="up">
                        <Check className="size-3" />
                        Verified
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Panel>
            </>
          ) : null}

          {tab === 'security' ? (
            <>
              <Panel>
                <PanelHeader title="Authentication" subtitle="Phishing-resistant by default" />
                <div className="divide-y divide-line/60">
                  <div className="flex items-center justify-between gap-6 py-3.5">
                    <div>
                      <p className="flex items-center gap-2 text-sm text-fg">
                        <Fingerprint className="size-4 text-brand-soft" />
                        Passkey
                      </p>
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        MacBook Pro secure enclave · added 11 Feb 2026
                      </p>
                    </div>
                    <Badge tone="up">Active</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-6 py-3.5">
                    <div>
                      <p className="flex items-center gap-2 text-sm text-fg">
                        <Key className="size-4 text-brand-soft" />
                        Hardware security key
                      </p>
                      <p className="mt-0.5 text-xs text-fg-subtle">YubiKey 5C · added 3 Apr 2025</p>
                    </div>
                    <Badge tone="up">Active</Badge>
                  </div>
                  <Toggle
                    label="Require 2FA on every withdrawal"
                    description="Not just on new addresses — every outbound transfer."
                    defaultOn
                  />
                  <Toggle
                    label="24-hour hold on new withdrawal addresses"
                    description="A newly added address cannot receive funds until the hold expires."
                    defaultOn
                  />
                  <Toggle
                    label="Anti-phishing code in every email"
                    description="A code only you and Novex know, shown in the header of each message."
                    defaultOn
                  />
                  {/* The only place this application asks for geolocation. Every
                      other surface uses the coarse, connection-derived location,
                      which needs nothing from the account holder. */}
                  <PreciseLocationControl />
                </div>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5">
                  <Button variant="outline" size="sm">Add another passkey</Button>
                  <Button variant="ghost" size="sm">Change password</Button>
                </div>
              </Panel>

              <Panel>{sessions}</Panel>
            </>
          ) : null}

          {tab === 'api' ? (
            <Panel>
              <PanelHeader
                title="API keys"
                subtitle="Idempotency keys are honoured for 24 hours on every mutating endpoint"
                actions={<Button size="sm"><Plus className="size-3.5" />New key</Button>}
              />
              <TableShell caption="API keys with scopes and last use" minWidth="46rem">
                <thead>
                  <tr>
                    <Th>Label</Th><Th>Key</Th><Th>Scopes</Th>
                    <Th>IP allow-list</Th><Th>Last used</Th><Th numeric>{''}</Th>
                  </tr>
                </thead>
                <tbody>
                  {API_KEYS.map((key) => (
                    <Tr key={key.id}>
                      <Td>
                        <p className="text-sm font-medium text-fg">{key.label}</p>
                        <p className="text-2xs text-fg-subtle">Created {formatDate(key.createdAt)}</p>
                      </Td>
                      <Td>
                        <button
                          type="button"
                          onClick={() => copyKey(key.prefix)}
                          className="inline-flex items-center gap-1.5 font-mono text-2xs text-fg-muted transition-colors hover:text-fg"
                        >
                          {key.prefix}••••
                          {copied === key.prefix ? (
                            <Check className="size-3 text-up" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {key.scopes.map((scope) => (
                            <Badge
                              key={scope}
                              tone={scope === 'transfer' ? 'warn' : scope === 'trade' ? 'brand' : 'neutral'}
                            >
                              {scope}
                            </Badge>
                          ))}
                        </span>
                      </Td>
                      <Td className="font-mono text-2xs">
                        {key.ipAllowList.length > 0 ? key.ipAllowList.join(', ') : (
                          <span className="text-warn">Any IP</span>
                        )}
                      </Td>
                      <Td>{key.lastUsed}</Td>
                      <Td numeric>
                        <button
                          type="button"
                          aria-label={`Revoke ${key.label}`}
                          className="grid size-7 place-items-center rounded-sm border border-line text-fg-muted transition-colors hover:border-down/50 hover:text-down"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </TableShell>
              <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
                A key with the <span className="text-warn">transfer</span> scope can move funds off
                the exchange. Pair it with an IP allow-list, and never put one in client-side code.
              </p>
            </Panel>
          ) : null}

          {tab === 'limits' ? (
            <>
              <Panel>
                <PanelHeader title="Daily limits" subtitle={`${ACCOUNT.tier} tier · resets 00:00 UTC`} />
                <div className="space-y-5">
                  <Meter label="Withdrawals" value={12_400} max={250_000} formatValue={money} />
                  <Meter label="Card purchases" value={3_100} max={10_000} formatValue={money} tone="warn" />
                  <Meter label="Bank deposits" value={5_000} max={500_000} formatValue={money} />
                  <Meter label="API order notional" value={184_000} max={2_000_000} formatValue={money} />
                </div>
              </Panel>

              <Panel>
                <PanelHeader title="Trading controls" subtitle="Guardrails you set on yourself" />
                <div className="divide-y divide-line/60">
                  <Toggle
                    label="Confirm orders above $25,000"
                    description="An extra confirmation step on large tickets."
                    defaultOn
                  />
                  <Toggle
                    label="Block market orders on thin books"
                    description="Rejects a market order when the top ten levels cannot fill it within 2%."
                    defaultOn
                  />
                  <Toggle label="Allow margin products" description="Currently unavailable in your jurisdiction." />
                  <Toggle
                    label="Daily loss circuit breaker"
                    description="Pauses trading for 24 hours after a 15% single-day drawdown."
                  />
                </div>
              </Panel>
            </>
          ) : null}

          {tab === 'notifications' ? (
            <Panel>
              <PanelHeader title="Notifications" subtitle="Per-channel, per-event" />
              <div className="divide-y divide-line/60">
                <Toggle label="Order fills" description="Push and email when an order fills or partially fills." defaultOn />
                <Toggle label="Price alerts" description="Delivered under 400 ms of the book crossing your level." defaultOn />
                <Toggle label="Staking rewards" description="A daily summary rather than one message per payout." defaultOn />
                <Toggle label="Deposits and withdrawals" description="Every movement of money in or out." defaultOn />
                <Toggle label="Security events" description="New device, new address, key created. Cannot be disabled." defaultOn />
                <Toggle label="Product news" description="Occasional releases and research. No more than monthly." />
                <Toggle label="Market commentary" description="Weekly note from the research desk." defaultOn />
              </div>
              <p className="mt-5 border-t border-line pt-4 text-xs text-fg-subtle">
                Security notifications are mandatory and cannot be switched off.
              </p>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
