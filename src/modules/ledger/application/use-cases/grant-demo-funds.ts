import { Money, err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { platformOwner, userOwner } from '../../domain/account';
import { demoTransactionHash } from '../../domain/chain-reference';
import { LedgerErrors, type LedgerError } from '../../domain/errors';
import { Transfer } from '../../domain/transfer';
import type { LedgerDependencies } from '../ports';

export interface GrantDemoFundsCommand {
  /** Who receives it. Resolved from an account number or an email by the caller. */
  readonly userId: UserId;
  readonly asset: string;
  /**
   * Which chain the funds are to be treated as having arrived on.
   *
   * Optional only where there is no choice to make: an asset that travels on one
   * network defaults to it, and one that travels on several refuses without it.
   * USDT is the case that matters — "USDT" alone does not say whether a student is
   * being shown a Tron deposit or an Ethereum one, and the fee, the address format
   * and the coin that pays for the eventual withdrawal all differ between them.
   *
   * ── It does not create a separate balance, and that is correct ───────────────
   * There is one USDT account per customer whichever chain the tokens came in on,
   * exactly as on a real exchange: you deposit USDT over Tron and your USDT
   * balance rises. The network describes the route in, not a pot of its own — so
   * it lands in the transfer's reference and in what the student is told, and the
   * ledger's account shape is untouched.
   */
  readonly network?: string | undefined;
  /** A decimal string. Never a number. */
  readonly amount: string;
  /**
   * Why, in the operator's words — "Tuesday workshop, group B".
   *
   * Optional, unlike a deposit's reference, and the difference is the point. A
   * deposit's reference is what makes it auditable against something that actually
   * arrived; there is nothing outside this system for a demo grant to be audited
   * against, so requiring one would be asking an operator to invent a fact. The
   * transfer still carries a reference either way — it says who issued it.
   */
  readonly note?: string | undefined;
  /** The operator issuing it. Recorded so the entry has an author. */
  readonly issuedBy: UserId;
}

/**
 * Money conjured for a workshop.
 *
 * ── This is the button `recordDeposit` refuses to be ──────────────────────────
 * `record-deposit.ts` sets out three ways a balance could come into existence and
 * rejects two of them, because a platform that lets anyone credit themselves has
 * made every balance on it fictional. That reasoning is unchanged and this use
 * case does not weaken it. What it does is admit a fourth case the ledger did not
 * have a shape for: a tutor running a class, who needs twenty student accounts to
 * have something in them before anybody can be shown how a withdrawal works.
 *
 *
 *
 * Nothing here can be mistaken later for funds that arrived. That is the whole
 * design, and it is why this is a separate use case rather than `recordDeposit`
 * with a friendlier form in front of it.
 *
 * ── What it deliberately does not do ──────────────────────────────────────────
 * It does not check a limit, price the amount, or ask a second operator. Those
 * controls exist on the withdrawal path because that is where value leaves; this
 * one credits an account from a contra account that is allowed to go negative, and
 * the only thing at stake in getting it wrong is a workshop with the wrong numbers
 * on the board.
 *
 * It also does not take funds back. A clawback is a second balanced transfer in
 * the other direction and the ledger would have no trouble with one; it is absent
 * because nothing has asked for it, and adding a debit path to a credit tool is
 */
export function createGrantDemoFunds(deps: LedgerDependencies) {
  return async function grantDemoFunds(
    command: GrantDemoFundsCommand,
  ): Promise<
    Result<
      {
        transferId: string;
        balance: string;
        asset: string;
        /** How the chosen network is written on a form — "Tron (TRC-20)". */
        networkLabel: string;
        /** The chain-shaped reference this grant was given. */
        txHash: string;
      },
      LedgerError
    >
  > {
    const asset = deps.assets.find(command.asset);
    if (asset === null) return err(LedgerErrors.assetNotSupported(command.asset));

    const chosen = command.network?.trim() ?? '';
    const [only] = asset.networks;
    let network;
    if (chosen.length === 0) {
      // One network is no choice at all, so not making it is not an omission.
      if (asset.networks.length !== 1 || only === undefined) {
        return err(
          LedgerErrors.networkRequired(
            asset.code,
            asset.networks.map((option) => option.label).join(' or '),
          ),
        );
      }
      network = only;
    } else {
      const found = asset.networks.find((option) => option.id === chosen);
      if (found === undefined) {
        return err(LedgerErrors.networkNotSupported(asset.code, chosen));
      }
      network = found;
    }

    let amount: Money;
    try {
      amount = Money.fromDecimalString(command.amount.trim(), asset.code, asset.scale);
    } catch {
      return err(LedgerErrors.amountInvalid('Enter an amount, for example 0.05.'));
    }
    if (amount.isNegative || amount.isZero) {
      return err(LedgerErrors.amountInvalid('A demo grant must be for a positive amount.'));
    }

    const account = await deps.accounts.findOrOpen(userOwner(command.userId), asset);
    const source = await deps.accounts.findOrOpen(platformOwner('demo'), asset);

    const note = command.note?.trim() ?? '';
    // Taken before the transfer is built, because the hash is derived from it —
    // see `chain-reference.ts` for why a demo credit gets a chain-shaped
    // reference at all, and why it is derived rather than drawn.
    const transferId = deps.ids.next();

    const transfer = Transfer.create({
      id: transferId,
      kind: 'deposit',
      occurredAt: deps.clock.now(),
      reference: note.length > 0
        ? `demo funds on ${network.id} (${note}) by ${command.issuedBy}`
        : `demo funds on ${network.id} by ${command.issuedBy}`,
      network: network.id,
      txHash: demoTransactionHash(transferId, network.txHashPrefix),
      entries: [
        { accountId: account.id, delta: amount },
        { accountId: source.id, delta: amount.negate() },
      ],
    });

    account.applyDelta(amount);
    source.applyDelta(amount.negate());

    await deps.accounts.post(transfer, [account, source]);

    return ok({
      transferId: transfer.id,
      balance: account.balance.toDecimalString(),
      asset: asset.code,
      networkLabel: network.label,
      // Read back off the transfer rather than recomputed, so the value the
      // console reports is provably the one that was written.
      txHash: transfer.txHash ?? '',
    });
  };
}

export type GrantDemoFunds = ReturnType<typeof createGrantDemoFunds>;
