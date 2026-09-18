'use client';

import { useActionState, useState } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';

import { PASSWORD_MIN_LENGTH, type SignInMethodsDto } from '@/modules/identity';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/format';
import { Badge } from '@/shared/ui/primitives/badge';
import { Button } from '@/shared/ui/primitives/button';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { PasswordField } from '@/shared/ui/primitives/field';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { IDLE_SECURITY_FORM } from '../_lib/form-state';
import { changePasswordAction, disconnectGoogleAction } from '../_lib/security-actions';

/**
 * How this account can be signed into, and how to change it.
 *
 * ── Both rows are read, never assumed ─────────────────────────────────────────
 * "Has a password" was true of every account until Google sign-in existed. Now it
 * is a fact about a row, and offering a *change* password form to somebody who has
 * never had one would ask for a current password that does not exist.
 *
 * ── The connect button is absent when Google is not configured ────────────────
 * Not disabled, not greyed out: absent. A control that looks like it works and does
 * not is the thing this codebase keeps deleting.
 */

/** Where a re-authentication comes back to: this form, still open. */
const SECURITY_TAB = '/app/settings?tab=security';

const GOOGLE_NOTICES: Readonly<Record<string, { tone: 'up' | 'down'; message: string }>> = {
  connected: { tone: 'up', message: 'Google connected.' },
  'google-cancelled': { tone: 'down', message: 'Google sign-in was cancelled.' },
  'google-expired': { tone: 'down', message: 'That took too long. Try connecting again.' },
  'google-failed': { tone: 'down', message: 'Google sign-in did not complete. Try again.' },
  'google-unverified': {
    tone: 'down',
    message: 'Google has not confirmed the address on that account, so it cannot be connected.',
  },
  'google-linked-elsewhere': {
    tone: 'down',
    message: 'That Google account is already connected to another account.',
  },
  'google-already-connected': {
    tone: 'down',
    message: 'A Google account is already connected. Disconnect it first.',
  },
  'google-unavailable': {
    tone: 'down',
    message: 'Google sign-in is not configured on this deployment.',
  },
  'account-disabled': { tone: 'down', message: 'This account is not available.' },
};

export function SignInMethods({
  methods,
  googleConfigured,
  notice,
}: {
  /** Null when the read failed. A missing answer is not "no password". */
  methods: SignInMethodsDto | null;
  googleConfigured: boolean;
  /** The `?google=` outcome the callback redirected back with. */
  notice?: string | undefined;
}) {
  const google = methods?.connected.find((account) => account.provider === 'google') ?? null;
  const outcome = notice === undefined ? undefined : GOOGLE_NOTICES[notice];

  return (
    <Panel>
      <PanelHeader
        title="Sign-in method"
        subtitle="What this account can be signed into with"
      />

      {outcome === undefined ? null : (
        <p
          role="status"
          className={cn(
            'mb-4 rounded-md border px-3.5 py-2.5 text-sm',
            outcome.tone === 'up'
              ? 'border-up/35 bg-up/8 text-up'
              : 'border-down/35 bg-down/8 text-down',
          )}
        >
          {outcome.message}
        </p>
      )}

      {methods === null ? (
        <p className="text-xs leading-relaxed text-fg-subtle">
          Your sign-in methods could not be read just now. This is a failed request, not
          an account without a password.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line/60">
            <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <span className="flex min-w-0 items-center gap-3">
                <KeyRound className="size-4 shrink-0 text-fg-subtle" />
                <span className="min-w-0">
                  <span className="block text-sm text-fg">Email and password</span>
                  <span className="block text-xs text-fg-subtle">
                    {methods.hasPassword
                      ? 'Set. Change it below.'
                      : 'Not set — this account signs in with Google.'}
                  </span>
                </span>
              </span>
              <Badge tone={methods.hasPassword ? 'up' : 'neutral'}>
                {methods.hasPassword ? 'Active' : 'Not set'}
              </Badge>
            </li>

            <li className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <span className="flex min-w-0 items-center gap-3">
                <ShieldCheck className="size-4 shrink-0 text-fg-subtle" />
                <span className="min-w-0">
                  <span className="block text-sm text-fg">Google</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {google
                      ? `${google.email} · connected ${formatDate(google.linkedAt)}`
                      : googleConfigured
                        ? 'Not connected'
                        : 'Not configured on this deployment'}
                  </span>
                </span>
              </span>

              {google ? (
                <DisconnectGoogle canDisconnect={methods.hasPassword} />
              ) : googleConfigured ? (
                // A link, not a form: this starts a navigation to Google, and the
                // account decisions happen when it comes back.
                <ButtonLink
                  href="/api/auth/google/start?mode=link&next=/app/settings"
                  variant="outline"
                  size="sm"
                >
                  Connect
                </ButtonLink>
              ) : (
                <Badge tone="neutral">Unavailable</Badge>
              )}
            </li>
          </ul>

          <PasswordForm hasPassword={methods.hasPassword} googleEmail={google?.email ?? null} />
        </>
      )}
    </Panel>
  );
}

function DisconnectGoogle({ canDisconnect }: { canDisconnect: boolean }) {
  const [state, submit, pending] = useActionState(disconnectGoogleAction, IDLE_SECURITY_FORM);

  return (
    <span className="flex flex-wrap items-center justify-end gap-2">
      {state.message === null ? null : (
        <span
          role="status"
          className={cn('text-xs', state.status === 'error' ? 'text-down' : 'text-up')}
        >
          {state.message}
        </span>
      )}
      <form action={submit}>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending || !canDisconnect}
          // Explained rather than silently dead: a disabled control with no reason
          // is the one people file a support ticket about.
          title={
            canDisconnect
              ? undefined
              : 'Set a password first, or this account would have no way to sign in.'
          }
        >
          {pending ? 'Disconnecting…' : 'Disconnect'}
        </Button>
      </form>
    </span>
  );
}

function PasswordForm({
  hasPassword,
  googleEmail,
}: {
  hasPassword: boolean;
  /** The linked Google address, when there is one. The only way back in here. */
  googleEmail: string | null;
}) {
  const [state, submit, pending] = useActionState(changePasswordAction, IDLE_SECURITY_FORM);
  const [open, setOpen] = useState(false);

  // Stays open after a save so the confirmation is visible; closing is a choice the
  // person makes with Cancel.
  if (!open) {
    return (
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          {hasPassword ? 'Change password' : 'Set a password'}
        </Button>
        <span className="text-xs text-fg-subtle">
          {hasPassword
            ? 'Asks for your current one, and signs out your other devices.'
            : 'Adds a second way in, so Google is not the only one.'}
        </span>
      </div>
    );
  }

  return (
    <form action={submit} className="mt-5 space-y-4 border-t border-line pt-5">
      {hasPassword ? (
        <PasswordField
          label="Current password"
          name="currentPassword"
          required
          autoComplete="current-password"
        />
      ) : (
        <p className="text-xs leading-relaxed text-fg-subtle">
          {/* Why there is no "current password" box, said before somebody wonders
              whether the form is broken. */}
          This account has no password yet. If you signed in a while ago, you may be
          asked to sign in again before this is accepted.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField
          label="New password"
          name="newPassword"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
        />
        <PasswordField
          label="Repeat new password"
          name="confirmPassword"
          required
          autoComplete="new-password"
        />
      </div>

      {state.message === null ? null : (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className={cn('text-sm', state.status === 'error' ? 'text-down' : 'text-up')}
        >
          {state.message}
        </p>
      )}

      {/*
        The way out of a stale sign-in, offered rather than described.

        Setting a first password needs identity proved in the last few minutes, and
        an account with no password can only prove it by signing in again. Google
        brings them back to this tab, where the window is fresh and the form is
        where they left it — the alternative was signing out, signing in, and
        finding their way back here on their own.
      */}
      {state.reauth === true && googleEmail !== null ? (
        <ButtonLink
          href={`/api/auth/google/start?next=${encodeURIComponent(SECURITY_TAB)}`}
          size="sm"
          variant="secondary"
        >
          Sign in with Google again
        </ButtonLink>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : hasPassword ? 'Update password' : 'Set password'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
