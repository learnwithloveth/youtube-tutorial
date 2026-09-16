'use client';

import { useActionState, useState } from 'react';
import { BadgeCheck, Check, CircleAlert } from 'lucide-react';

import type { VerificationStandingDto } from '@/modules/identity';
import { formatDate } from '@/shared/lib/format';
import { Badge, type BadgeTone } from '@/shared/ui/primitives/badge';
import { Button } from '@/shared/ui/primitives/button';

import { Panel, PanelHeader } from '../../../../_console/components/page-header';
import { IDLE_VERIFY_IDENTITY } from '../_lib/form-state';
import { submitVerificationAction } from '../_lib/verification-actions';
import { VerifyIdentityForm } from './verify-identity-form';

/**
 * The Verification tab: where the account holder stands, and where they start.
 *
 * ── Started here, never demanded ──────────────────────────────────────────────
 * Sign-up used to end on this form with no way past it. Now the form stays closed
 * until somebody asks for it, because nothing on an account waits on the outcome.
 *
 * ── The form is offered only when a submission can succeed ────────────────────
 * The use case refuses a second submission while one waits, and any submission
 * after an approval. Showing the form in those states would mean five fields and
 * an upload that end in a refusal, so those states show where the case stands
 * instead.
 *
 * ── Why the action state lives here and not in the form ───────────────────────
 * A successful submission revalidates the page, and the tab re-renders from the new
 * standing. Holding the result up here keeps the confirmation on screen even when
 * that refreshed read fails, rather than replacing it with "could not be read".
 */

const BADGES: Record<VerificationStandingDto['state'], { tone: BadgeTone; label: string } | null> = {
  unverified: { tone: 'neutral', label: 'Not started' },
  pending: { tone: 'warn', label: 'Under review' },
  approved: { tone: 'up', label: 'Verified' },
  rejected: { tone: 'down', label: 'Not accepted' },
  unavailable: null,
};

export function IdentityVerification({ standing }: { standing: VerificationStandingDto }) {
  const [state, submit, pending] = useActionState(submitVerificationAction, IDLE_VERIFY_IDENTITY);
  const [open, setOpen] = useState(false);

  const submitted = state.status === 'submitted';
  const canSubmit = standing.state === 'unverified' || standing.state === 'rejected';
  const showForm = open && canSubmit && !submitted;
  const badge = submitted ? BADGES.pending : BADGES[standing.state];

  return (
    <Panel>
      <PanelHeader
        title={showForm ? 'Verify your identity' : 'Identity verification'}
        subtitle={
          showForm
            ? 'Regulation requires it. Five fields and a photo of one document.'
            : 'A person reviews one government-issued photo document'
        }
        actions={
          showForm ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          ) : badge ? (
            <Badge tone={badge.tone}>{badge.label}</Badge>
          ) : null
        }
      />

      {showForm ? (
        <VerifyIdentityForm state={state} submit={submit} pending={pending} />
      ) : submitted ? (
        <UnderReview message={state.message ?? 'Your document is with a reviewer.'} />
      ) : standing.state === 'pending' ? (
        <UnderReview
          message="Your document is with a reviewer."
          detail={`Submitted ${formatDate(standing.submittedAt)}.`}
        />
      ) : standing.state === 'approved' ? (
        <div className="rounded-lg border border-up/35 bg-up/8 p-6">
          <div className="flex items-center gap-3">
            <BadgeCheck className="size-5 shrink-0 text-up" />
            <p className="text-sm font-medium text-fg">Your identity is verified.</p>
          </div>
          {standing.decidedAt === null ? null : (
            <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
              Approved {formatDate(standing.decidedAt)}.
            </p>
          )}
        </div>
      ) : standing.state === 'rejected' ? (
        <>
          <div className="rounded-lg border border-down/35 bg-down/8 p-6">
            <div className="flex items-center gap-3">
              <CircleAlert className="size-5 shrink-0 text-down" />
              <p className="text-sm font-medium text-fg">
                Your last submission was not accepted.
              </p>
            </div>
            {/* The reason is mandatory on a rejection so that the person refused can
                fix what was wrong, and this is the only place they are shown it. */}
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs text-fg-subtle">
                Reviewer&rsquo;s reason
                {standing.decidedAt === null ? '' : ` · ${formatDate(standing.decidedAt)}`}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                {standing.reason ?? 'No reason was recorded.'}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              Submit again
            </Button>
          </div>
        </>
      ) : standing.state === 'unverified' ? (
        <>
          <p className="text-sm leading-relaxed text-fg-muted">
            You have not verified your identity. It takes five fields and a photo of one
            document, and you can start whenever you are ready.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-5">
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              Start verification
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-fg-subtle">
          Your verification status could not be read just now. This is a failed request,
          not an unverified account.
        </p>
      )}
    </Panel>
  );
}

/** The approved "Submitted" confirmation, shared by a fresh submission and a return visit. */
function UnderReview({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-up/35 bg-up/8 p-6">
      <div className="flex items-center gap-3">
        <Check className="size-5 shrink-0 text-up" />
        <p className="text-sm font-medium text-fg">{message}</p>
      </div>
      <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-fg-subtle">
        {/* No "most checks complete within two minutes". A person looks at this,
            and telling somebody to wait two minutes for a decision that takes a
            working day is how a support queue fills up.

            "The decision arrives by email" was false: nothing sends mail about a
            decision. It reaches the notification bell, and this tab shows it. */}
        {detail === undefined ? '' : `${detail} `}A person reviews every submission, so
        this is not instant. The decision will appear in your notifications and on this
        page.
      </p>
    </div>
  );
}
