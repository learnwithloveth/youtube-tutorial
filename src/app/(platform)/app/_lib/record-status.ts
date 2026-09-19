import type { TransactionStatus } from '@/modules/ledger';
import type { BadgeTone } from '@/shared/ui/primitives/badge';

/**
 * What a deposit or withdrawal is called on the customer's own screens.
 *
 * ── Three words, because that is how many states money has ────────────────────
 * Pending, Completed, Failed. Every account a person has ever held uses those, or
 * something close enough that they do not have to stop and work it out — and a
 * platform that invents its own vocabulary for the universal thing is asking
 * somebody to learn it while they are worried about their money.
 *
 * The ledger holds four states, not three. `pending` is a request nobody has
 * looked at; `confirming` is one an operator has looked at, with the chain now the
 * thing being waited on. That difference is real and it matters *to the operator* —
 * a pending claim sitting for a day means the queue is broken, and a confirming
 * one sometimes just means blocks are slow. It does not matter to the customer,
 * whose question is only "is it done yet", and whose answer in both cases is no.
 *
 * So the two collapse to one word here, and the detail that is worth having — the
 * operator's note about what is being waited for — is shown on the row beneath it
 * rather than encoded in a badge nobody can decode.
 *
 * ── Why this is shared rather than declared per page ──────────────────────────
 * It was not, and the wallet called a fresh claim "Reported" while the
 * transactions page called the same row "Awaiting review". Two words for one state
 * on two screens of the same account is the kind of thing that reads as two
 * different things having happened.
 */
export interface CustomerStatus {
  readonly label: string;
  readonly tone: BadgeTone;
  /** One line under the badge, for a state the word alone does not explain. */
  readonly hint: string | null;
}

export const CUSTOMER_STATUS: Record<TransactionStatus, CustomerStatus> = {
  pending: {
    label: 'Pending',
    tone: 'warn',
    hint: 'Waiting to be checked.',
  },
  confirming: {
    // The same word, deliberately. An operator having looked is not a state change
    // the customer experiences — what changed for them is that there is now
    // something to say about the wait, which is the hint and the note.
    label: 'Pending',
    tone: 'warn',
    hint: 'Confirming on the network.',
  },
  approved: {
    label: 'Completed',
    tone: 'up',
    hint: null,
  },
  rejected: {
    // "Failed", not "Not accepted". The passive phrasing was precise and read as a
    // euphemism, which on the one screen where somebody is looking for bad news is
    // the wrong trade.
    label: 'Failed',
    tone: 'down',
    hint: null,
  },
};

/** True while a record could still become either outcome. */
export function isPendingStatus(status: TransactionStatus): boolean {
  return status === 'pending' || status === 'confirming';
}
