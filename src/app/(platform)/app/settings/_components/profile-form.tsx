'use client';

import { useActionState } from 'react';
import { BadgeCheck, TriangleAlert } from 'lucide-react';

import type { CurrentUserDto } from '@/modules/identity';
import { MAX_DISPLAY_NAME } from '@/modules/identity';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/cn';
import { Badge } from '@/shared/ui/primitives/badge';
import { Button } from '@/shared/ui/primitives/button';
import { TextField } from '@/shared/ui/primitives/field';

import { updateProfileAction } from '../_lib/actions';
import { IDLE_PROFILE_FORM } from '../_lib/form-state';

/**
 * The account holder's own profile.
 *
 * ── What this panel used to say ────────────────────────────────────────────────
 * "Amara Okonkwo · @amara · amara@meridian.capital · member since Mar 14 2021 ·
 * Verified · Gold tier", plus a phone number, a base currency and a time zone —
 * shown identically to every person who signed in. All of it was one fixture
 * object in `_data/data.ts`.
 *
 * ── What is here now, and what went ────────────────────────────────────────────
 * Name and handle are real, stored, and shown everywhere this account appears.
 * Email and member-since are real and read-only.
 *
 * Three fields are gone rather than wired:
 *
 *  - **Phone.** Nothing sends to it and nothing verifies it, so it would be a
 *    string that looks like a recovery method and is not.
 *  - **Base currency.** There are no FX rates in this application. The setting
 *    would change a label and not a number.
 *  - **Time zone.** Every timestamp renders in UTC on purpose — see
 *    `_console/data/format` for why that is load-bearing under SSR.
 *
 * A setting that changes nothing is worse than an absent one, because somebody
 * eventually relies on it.
 */
export function ProfileForm({ user }: { user: CurrentUserDto }) {
  const [state, submit, pending] = useActionState(updateProfileAction, IDLE_PROFILE_FORM);

  // The action returns the freshly resolved name, so the heading updates on save
  // without waiting for the layout's revalidation to reach this subtree.
  const name = state.status === 'saved' && state.name ? state.name : user.name;

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <span
          aria-hidden
          className="grid size-16 place-items-center rounded-full bg-brand/20 text-lg font-semibold text-brand-soft"
        >
          {user.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{name}</p>
          <p className="truncate text-sm text-fg-subtle">
            {user.handle ? `@${user.handle} · ` : ''}member since {formatDate(user.createdAt)}
          </p>
          {/* The one badge that is true. "Verified · Gold tier" claimed a KYC
              process and a tier system, neither of which exists; this says only
              whether the address on the account has been confirmed. */}
          <Badge tone={user.emailVerified ? 'up' : 'warn'} className="mt-2">
            <BadgeCheck className="size-3" />
            {user.emailVerified ? 'Email confirmed' : 'Email not confirmed'}
          </Badge>
        </div>
      </div>

      <form action={submit} className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Display name"
          name="displayName"
          defaultValue={user.displayName ?? ''}
          maxLength={MAX_DISPLAY_NAME}
          placeholder="Optional"
          autoComplete="name"
        />
        <TextField
          label="Handle"
          name="handle"
          defaultValue={user.handle ?? ''}
          placeholder="Optional"
          autoComplete="off"
        />

        <div className="sm:col-span-2">
          <TextField
            label="Email"
            type="email"
            defaultValue={user.email}
            readOnly
            // Not editable here on purpose: changing the address on an account is a
            // re-verification flow, not a text field. Showing it as editable and
            // silently ignoring it would be worse than showing it as it is.
            hint="Contact support to change the address on your account."
          />
        </div>

        {state.message !== null ? (
          <p
            role="status"
            className={cn(
              'flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed sm:col-span-2',
              state.status === 'error'
                ? 'border-down/35 bg-down/8 text-fg'
                : 'border-up/35 bg-up/8 text-fg',
            )}
          >
            {state.status === 'error' ? (
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-down" />
            ) : (
              <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-up" />
            )}
            {state.message}
          </p>
        ) : null}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </form>
    </>
  );
}
