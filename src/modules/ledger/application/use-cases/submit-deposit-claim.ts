import { Money, err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { DepositClaim } from '../../domain/deposit-claim';
import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { inspectProof, presentProofRejection } from '../../domain/proof-image';
import type { LedgerDependencies } from '../ports';

export interface SubmitDepositClaimCommand {
  readonly userId: UserId;
  readonly asset: string;
  readonly network: string;
  /** A decimal string, straight from the form. Never a number. */
  readonly amount: string;
  /** The customer's transaction hash or bank reference. */
  readonly reference: string;
  /** Raw bytes. The declared content type is deliberately not accepted. */
  readonly proof: Uint8Array;
}

/**
 * A customer submits evidence that they sent funds.
 *
 * ── Nothing is credited ────────────────────────────────────────────────────────
 * This writes a claim and stores an image. No transfer is posted, no balance
 * moves, and the customer's wallet shows the claim as pending. Crediting happens
 * only when an operator has looked at the proof and the chain — see
 * `decideDepositClaim`.
 *
 * ── The proof is validated before anything is written ──────────────────────────
 * Order matters here in a way that is easy to get backwards. The image is sniffed
 * first, because a rejected file should cost nothing; then it is stored; then the
 * claim is saved. If the claim then fails to save, the stored proof is removed —
 * otherwise every failed submission leaves an orphan in a storage budget measured
 * in megabytes.
 */
export function createSubmitDepositClaim(deps: LedgerDependencies) {
  return async function submitDepositClaim(
    command: SubmitDepositClaimCommand,
  ): Promise<Result<{ claimId: string }, LedgerError>> {
    const asset = deps.assets.find(command.asset);
    if (asset === null) return err(LedgerErrors.assetNotSupported(command.asset));

    const network = asset.networks.find((candidate) => candidate.id === command.network);
    if (network === undefined) {
      return err(LedgerErrors.networkNotSupported(asset.code, command.network));
    }

    /*
     * Optional, and usually empty.
     *
     * The form asked for a transaction hash and no longer does: people pasted the
     * wrong one, truncated it, or typed something plausible, and an operator who
     * trusted it was trusting the same person the screenshot came from. What
     * actually decides a claim is the operator finding the transfer on the chain
     * or in the bank — see `decideDepositClaim`, where the amount credited is the
     * one *they* verified, not the one claimed here.
     *
     * The field stays on the command and on the record so an operator can still
     * write one in, and so every claim already stored keeps what it was given.
     */
    const reference = command.reference.trim();

    let amount: Money;
    try {
      amount = Money.fromDecimalString(command.amount.trim(), asset.code, asset.scale);
    } catch {
      return err(LedgerErrors.amountInvalid('Enter the amount you sent, for example 0.05.'));
    }
    if (amount.isNegative || amount.isZero) {
      return err(LedgerErrors.amountInvalid('Enter an amount greater than zero.'));
    }

    // Sniffed from the bytes. What the browser called the file is discarded rather
    // than cross-checked, because cross-checking still leaves the client a vote.
    const inspection = inspectProof(command.proof);
    if (!inspection.ok) {
      return err(LedgerErrors.proofInvalid(presentProofRejection(inspection.rejection)));
    }

    const proofId = await deps.proofs.put(command.proof, inspection.contentType);

    const claim = DepositClaim.submit({
      id: deps.ids.next(),
      userId: command.userId,
      network: network.id,
      claimedAmount: amount,
      reference,
      proofId,
      now: deps.clock.now(),
    });

    try {
      await deps.claims.save(claim);
    } catch (error) {
      // The proof is already stored and the claim that would have referenced it does
      // not exist. Nothing will ever read those bytes again, so they are removed
      // rather than left to accumulate.
      await deps.proofs.remove(proofId).catch(() => {});
      throw error;
    }

    return ok({ claimId: claim.id });
  };
}

export type SubmitDepositClaim = ReturnType<typeof createSubmitDepositClaim>;
