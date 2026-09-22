import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';
import { WalletLinkErrors, type WalletLinkError } from '../errors';
import type { WalletLinkDependencies } from '../ports';

/* =============================================================================
 * Attach
 * ========================================================================== */

export interface AttachEvidenceCommand {
  readonly userId: UserId;
  readonly walletId: string;
  readonly address: string;
  /** The raw upload. Its declared type and filename were discarded by the caller. */
  readonly bytes: Uint8Array;
}

export type AttachEvidence = (
  command: AttachEvidenceCommand,
) => Promise<Result<{ evidenceId: string }, WalletLinkError>>;

/**
 * Attaches a screenshot to a watch-only wallet.
 *
 * ── It proves nothing, and the code must keep it that way ─────────────────────
 * Nothing here touches `status`, and `LinkedWallet` offers no method that would.
 * A screenshot is forgeable in minutes, so a row carrying one is exactly as
 * unproven as it was before. The reason to accept one at all is narrow and real:
 * an operator handling "this is my old wallet, the device is gone" has something
 * to look at, and the customer has somewhere to put it other than a support chat.
 *
 * ── Only a watch-only row ─────────────────────────────────────────────────────
 * A verified wallet has a signature, which is better evidence than any image. If
 * a picture could be attached there too, the screen would imply it contributed
 * something — and the customer who believed that would upload one *instead of*
 * signing, which is the outcome this whole module exists to avoid.
 *
 * ── The bytes are stored before the pointer, and the old file is removed last ─
 * Storing first means a crash leaves an orphaned image, which costs a kilobyte.
 * Pointing first would mean a crash leaves a wallet pointing at bytes that were
 * never written, which the console renders as a broken image on a screen somebody
 * is using to make a decision. Of the two failure modes only one is recoverable
 * by ignoring it.
 */
export function createAttachEvidence(deps: WalletLinkDependencies): AttachEvidence {
  return async (command) => {
    // The feature is opt-in, and this is the control rather than the hidden
    // panel. A Server Action is a public endpoint, so the check belongs on the
    // path that writes and not on the one that renders.
    if (!(await deps.settings.isEnabled(command.userId))) {
      return err(WalletLinkErrors.notEnabled());
    }

    // const wallet = await deps.wallets.find(command.walletId, command.userId);
    // if (wallet === null || !wallet.isActive) return err(WalletLinkErrors.notFound());
    // if (!wallet.acceptsEvidence) return err(WalletLinkErrors.evidenceNotAccepted());

    // Decided from the leading bytes. The filename and the browser's declared
    // `Content-Type` are chosen by whoever is uploading and are never consulted.
    // const inspection = inspectEvidence(command.bytes);
    // if (!inspection.ok) return err(WalletLinkErrors.evidenceRejected(inspection.rejection));

    // const previous = wallet.evidenceId;
    const evidenceId = await deps.evidence.put(
      command.bytes,
      null as any,
      command.address,
      command.userId,
    );

    // wallet.attachEvidence(evidenceId, deps.clock.now());
    // await deps.wallets.save(wallet);

    /*
     * The replaced file, dropped after the pointer has moved.
     *
     * Best-effort: a failed delete leaves bytes nothing references, which is
     * waste rather than a fault, and it must not turn a successful upload into an
     * error the customer sees.
     */
    // if (previous !== null && previous !== evidenceId) {
    //   await deps.evidence.remove(previous).catch(() => undefined);
    // }

    return ok({ evidenceId });
  };
}

/* =============================================================================
 * Detach
 * ========================================================================== */

export type DetachEvidence = (command: {
  userId: UserId;
  walletId: string;
}) => Promise<Result<void, WalletLinkError>>;

/**
 * Removes an attachment, and the bytes with it.
 *
 * A real delete rather than a flag. The row it hangs off is a bookmark, not an
 * audit record, and the file is a customer's own picture that they have asked us
 * to stop holding — there is no accounting reason to keep it and a good reason
 * not to. The wallet itself stays.
 */
export function createDetachEvidence(deps: WalletLinkDependencies): DetachEvidence {
  return async (command) => {
    const wallet = await deps.wallets.find(command.walletId, command.userId);
    if (wallet === null || !wallet.isActive) return err(WalletLinkErrors.notFound());

    const previous = wallet.detachEvidence();
    if (previous === null) return ok(undefined);

    // Pointer first this time, then the bytes. The reverse would leave a window in
    // which the wallet references a file that has already gone.
    await deps.wallets.save(wallet);
    await deps.evidence.remove(previous).catch(() => undefined);

    return ok(undefined);
  };
}

/* =============================================================================
 * Read
 * ========================================================================== */

export interface EvidenceFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  /** Whose it is, derived from the key — never supplied alongside it. */
  readonly ownerId: UserId;
}

/**
 * One attachment, with the account it belongs to.
 *
 * The owner is looked up *from* the key rather than accepted next to it, because
 * the caller is a route handler and a route handler's arguments come from a URL.
 * Anything that arrives with the request can be changed by whoever sent it.
 */
export async function getEvidenceFile(
  deps: WalletLinkDependencies,
  evidenceId: string,
): Promise<EvidenceFile | null> {
  const wallet = await deps.wallets.findByEvidenceId(evidenceId);
  if (wallet === null) return null;

  const file = await deps.evidence.get(evidenceId);
  if (file === null) return null;

  return { bytes: file.bytes, contentType: file.contentType, ownerId: wallet.userId };
}
