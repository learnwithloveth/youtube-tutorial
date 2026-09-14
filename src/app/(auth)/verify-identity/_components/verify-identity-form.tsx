'use client';

import { useActionState, useRef, useState } from 'react';
import { ArrowRight, Check, IdCard, Upload } from 'lucide-react';

import { MAX_DOCUMENT_BYTES } from '@/modules/identity';
import { cn } from '@/shared/lib/cn';
import { COUNTRIES } from '@/shared/lib/countries';
import { Button } from '@/shared/ui/primitives/button';
import { SelectField, TextField } from '@/shared/ui/primitives/field';

import { AuthHeading } from '../../_components/auth-shared';
import { submitVerificationAction } from '../_lib/actions';
import { IDLE_VERIFY_IDENTITY } from '../_lib/form-state';

/**
 * Identity verification, as a form that actually submits.
 *
 * ── What this replaced ────────────────────────────────────────────────────────
 * A four-step wizard that stored nothing. "Choose file" was a button with no
 * input behind it; the liveness step was a pulsing circle and no camera; the
 * final step showed "Sanctions screening — In progress" against no screening
 * list, then pushed the customer to `/app` having submitted precisely nothing.
 * Somebody who completed it believed they had applied.
 *
 * ── Why the steps went with it ────────────────────────────────────────────────
 * A stepper earns its complexity when a form is long enough that showing all of it
 * would put somebody off. What is left here is five fields and a file, which is
 * shorter than the sign-up form — and a stepper over five fields hides how short
 * it is, which is the opposite of the reason to use one.
 *
 * The liveness step is not hidden or disabled, it is absent: there is no capture
 * to run, and a greyed-out control implies a switch that exists.
 */

const DOCUMENT_OPTIONS = [
  { value: 'passport', label: 'Passport' },
  { value: 'national-id', label: 'National ID card' },
  { value: 'drivers-licence', label: "Driver's licence" },
];

const MAX_MB = Math.floor(MAX_DOCUMENT_BYTES / (1024 * 1024));

export function VerifyIdentityForm() {
  const [state, submit, pending] = useActionState(
    submitVerificationAction,
    IDLE_VERIFY_IDENTITY,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (state.status === 'submitted') {
    return (
      <div>
        <AuthHeading
          title="Submitted"
          body="Your document is with a reviewer."
        />
        <div className="rounded-lg border border-up/35 bg-up/8 p-6">
          <div className="flex items-center gap-3">
            <Check className="size-5 shrink-0 text-up" />
            <p className="text-sm font-medium text-fg">{state.message}</p>
          </div>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
            {/* No "most checks complete within two minutes". A person looks at
                this, and telling somebody to wait two minutes for a decision that
                takes a working day is how a support queue fills up. */}
            A person reviews every submission, so this is not instant. You can close
            this page — the decision arrives by email.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AuthHeading
        title="Verify your identity"
        body="Regulation requires it. Five fields and a photo of one document."
      />

      <form action={submit} className="space-y-5">
        <TextField
          label="Full name, as written on the document"
          name="fullName"
          required
          autoComplete="name"
          placeholder="Ada Lovelace"
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Date of birth"
            name="dateOfBirth"
            type="date"
            required
            autoComplete="bday"
          />
          <SelectField
            label="Issuing country"
            name="country"
            required
            options={COUNTRIES.map(([code, name]) => ({ value: code, label: name }))}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField label="Document type" name="documentType" options={DOCUMENT_OPTIONS} />
          <TextField
            label="Document number"
            name="documentNumber"
            required
            placeholder="As printed on the document"
          />
        </div>

        <div>
          <label
            htmlFor="verification-document"
            className="grid cursor-pointer place-items-center rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 text-center transition-colors hover:border-brand-soft/60"
          >
            {fileName === null ? (
              <IdCard className="size-8 text-fg-subtle" />
            ) : (
              <Upload className="size-8 text-brand-soft" />
            )}
            <span className="mt-4 text-sm font-medium text-fg">
              {fileName ?? 'Upload or photograph your document'}
            </span>
            <span className="mt-1.5 max-w-xs text-xs leading-relaxed text-fg-subtle">
              All four corners visible and no glare. PNG, JPEG or WebP, up to{' '}
              {MAX_MB} MB.
            </span>
          </label>

          {/* A real input, visually hidden rather than `display: none`, so it stays
              focusable and reachable by keyboard and by a screen reader. */}
          <input
            ref={fileInput}
            id="verification-document"
            name="document"
            type="file"
            required
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
            className="sr-only"
          />
        </div>

        {state.message === null ? null : (
          <p
            className={cn(
              'text-sm',
              state.status === 'error' ? 'text-down' : 'text-fg-muted',
            )}
            role={state.status === 'error' ? 'alert' : undefined}
          >
            {state.message}
          </p>
        )}

        <Button type="submit" size="lg" sheen className="w-full" disabled={pending}>
          {pending ? 'Uploading…' : 'Submit for review'}
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
        </Button>
      </form>

      <p className="mt-8 text-center text-xs leading-relaxed text-fg-subtle">
        {/* The previous copy promised encryption at rest and deletion after 90
            days. Neither is implemented: the bytes sit in Postgres and nothing
            deletes them. Saying so is the only honest option until a retention job
            exists — a privacy promise a system does not keep is the one kind of
            copy that is worse than none. */}
        Your document is stored on our own systems and shown only to the reviewer
        handling your case.
      </p>
    </div>
  );
}
