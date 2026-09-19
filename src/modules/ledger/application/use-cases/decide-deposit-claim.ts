import { Money, err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { platformOwner, userOwner } from '../../domain/account';
import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { derivedTransactionHash } from '../../domain/chain-reference';
import { Transfer } from '../../domain/transfer';
import type { LedgerDependencies } from '../ports';

export interface DecideDepositClaimCommand {
  readonly claimId: string;
  /** The operator making the call. Never taken from the form. */
  readonly operatorId: UserId;
  readonly decision: 'approve' | 'reject';
  /**
   * What the operator verified actually arrived, as a decimal string.
   *
   * Optional; defaults to the claimed amount. It exists because the two genuinely
   * differ — people mistype, networks take fees, partial sends happen — and the
   * ledger must credit what arrived rather than what was asserted.
   */
  readonly creditedAmount?: string | undefined;
  /** Required on a rejection; the customer is shown it. */
  readonly reason?: string | undefined;
}

/**
 * An operator confirms or refuses a deposit claim.
 *
 * ── Approving is where money is created on the platform's books ────────────────
 * A balanced transfer is posted:
 *
 *   user account   +credited
 *   custody        −credited
 *
 * Custody's balance is therefore the total owed to customers, carried negative,
 * and it is the number that must reconcile against what is actually held on chain
 * and in the bank. That reconciliation is the real control on this flow: a
 * fraudulent approval does not show up as a bad row, it shows up as custody not
 * matching reality.
 *
 * ── One signature, unlike a withdrawal ─────────────────────────────────────────
 * Withdrawals above a threshold need two operators because money leaving is
 * irreversible. A credit is not: it is visible in the next reconciliation and can
 * be reversed with a balancing transfer. The control that matters here is the
 * proof and the on-chain reference, not a second click.
 *
 * ── Self-approval is currently permitted ──────────────────────────────────────
 * An operator used to be refused their own claim. That check is commented out in
 * `DepositClaim.approve`, deliberately, for a deployment used to teach people how
 * deposits work — a tutor walking through the flow on their own account is the
 * ordinary case there. The comment at that method says what it costs and what to
 * restore; it is the first thing to turn back on before real money is held.
 */
export function createDecideDepositClaim(deps: LedgerDependencies) {
  return async function decideDepositClaim(
    command: DecideDepositClaimCommand,
  ): Promise<Result<{ status: 'approved' | 'rejected'; credited: string | null }, LedgerError>> {
    const claim = await deps.claims.find(command.claimId);
    if (claim === null) return err(LedgerErrors.depositClaimNotFound(command.claimId));
    // `confirming` passes: an operator has seen the evidence and is waiting on the
    // chain, which is exactly the claim this use case is for. Only `approved` and
    // `rejected` are terminal — see `DepositClaim.assertUndecided`.
    if (!claim.isUndecided) {
      return err(LedgerErrors.withdrawalAlreadyDecided(claim.status));
    }

    const asset = deps.assets.find(claim.asset);
    if (asset === null) return err(LedgerErrors.assetNotSupported(claim.asset));

    const now = deps.clock.now();

    if (command.decision === 'reject') {
      const reason = command.reason?.trim() ?? '';
      if (reason.length === 0) {
        return err(LedgerErrors.approvalRefused('A rejection needs a reason.'));
      }

      claim.reject(command.operatorId, reason, now);
      await deps.claims.save(claim);

      // No transfer: nothing arrived, so nothing moves and the customer's statement
      // stays empty. The claim itself is the record that they asked.
      return ok({ status: 'rejected', credited: null });
    }

    let credited: Money;
    try {
      credited =
        command.creditedAmount === undefined || command.creditedAmount.trim().length === 0
          ? claim.claimedAmount
          : Money.fromDecimalString(command.creditedAmount.trim(), asset.code, asset.scale);
    } catch {
      return err(LedgerErrors.amountInvalid('Enter the amount that actually arrived.'));
    }

    const account = await deps.accounts.findOrOpen(userOwner(claim.userId), asset);
    const custody = await deps.accounts.findOrOpen(platformOwner('custody'), asset);

    const transferId = deps.ids.next();
    const network = asset.networks.find((option) => option.id === claim.network);
    const evidenced = claim.reference.trim();

    const transfer = Transfer.create({
      id: transferId,
      kind: 'deposit',
      occurredAt: now,
      // The customer's reference and the operator who accepted it. This is the line
      // an auditor reads, so it names both the external evidence and the person who
      // decided it was good.
      reference: `deposit ${claim.reference} confirmed by ${command.operatorId}`,
      // The customer's own hash wins, always. They named the chain when they
      // reported it and gave the hash as their evidence, and an operator approving
      // the claim is agreeing both are right — this is the one place a genuine
      // transaction reference enters the ledger, and a derived value must never
      // overwrite one.
      //
      // The fallback is for a claim submitted without a reference, which the form
      // allows: rather than a blank column, the movement gets a derived reference
      // like every other row. It is not evidence of anything and
      // `chain-reference.ts` says so.
      network: claim.network,
      txHash:
        evidenced.length > 0
          ? evidenced
          : derivedTransactionHash(transferId, network?.txHashPrefix ?? ''),
      entries: [
        { accountId: account.id, delta: credited },
        { accountId: custody.id, delta: credited.negate() },
      ],
    });

    try {
      claim.approve(command.operatorId, credited, transfer.id, now);
    } catch (error) {
      return err(
        LedgerErrors.approvalRefused(
          error instanceof Error ? error.message : 'This approval was refused.',
        ),
      );
    }

    account.applyDelta(credited);
    custody.applyDelta(credited.negate());

    await deps.accounts.post(transfer, [account, custody]);
    await deps.claims.save(claim);

    return ok({ status: 'approved', credited: credited.toDecimalString() });
  };
}

export type DecideDepositClaim = ReturnType<typeof createDecideDepositClaim>;
