import type { UserId } from '@/shared/kernel/ids';


/**
 * A wallet an account has attached to itself.
 *
 * ── Two states, and the difference between them is the whole module ───────────
 * `verified` means a signature over a challenge we issued recovered to this
 * address. `watch-only` means somebody typed the address in and nothing was
 * proved. Both are useful — watching an address you do not control is a legitimate
 * thing to want — and conflating them is not, which is why this is a field on the
 * aggregate and not a nullable timestamp somebody might forget to check.
 *
 * The rule that follows: nothing may be *granted* on the strength of a watch-only
 * row. It is a bookmark. `LinkedWallet.proves()` is the one place that answers
 * whether this row is evidence of anything.
 *
 * ── What this aggregate deliberately does not hold ────────────────────────────
 * No private key, no seed phrase, no mnemonic, no keystore, no signing capability
 * of any kind — and no field one could be put in. A platform that stores a
 * recovery phrase can spend every account that gave it one, and no amount of
 * encryption at rest changes that, because the platform must be able to decrypt it
 * to use it. The connection here is one-directional by construction: the wallet
 * signs, we verify, and we hold nothing that could sign anything.
 *
 * If a future requirement needs to *move* funds from a linked wallet, the answer
 * is a transaction the customer's own wallet signs at that moment — never a key
 * held here. There is no design in which this table holds secret material.
 */

export type LinkStatus = 'verified' | 'watch-only';

/**
 * How the wallet reached us.
 *
 * Recorded because it changes what the row means to somebody reading it later. An
 * `injected` link came from an extension on a device the customer was using; a
 * `walletconnect` link came from a phone that scanned a code. Support answering
 * "was this me" benefits from knowing which.
 */
export type LinkConnector = 'injected' | 'walletconnect' | 'manual';

/*
 * `MAX_WALLETS_PER_USER` used to be here, at 10, on the reasoning that nobody
 * needs fifty. It is gone: an account may link as many addresses as it likes, and
 * the three places that counted active rows before accepting another no longer do.
 */

/** Long enough for "Hardware — cold storage", short enough for a table cell. */
export const MAX_LABEL_LENGTH = 40;

export interface LinkedWalletSnapshot {
  readonly id: string;
  readonly userId: UserId;
  readonly address: string;
  readonly chainId: number;
  readonly status: LinkStatus;
  readonly connector: LinkConnector;
  readonly label: string | null;
  readonly linkedAt: Date;
  readonly verifiedAt: Date | null;
  readonly lastSeenAt: Date;
  readonly revokedAt: Date | null;
  /** Key of an attached screenshot, or null. Never evidence of control. */
  readonly evidenceId: string | null;
  readonly evidenceAt: Date | null;
}

export class LinkedWallet {
  private constructor(
    readonly id: string,
    readonly userId: UserId,
    readonly address: string,
    private chain: number,
    readonly status: LinkStatus,
    readonly connector: LinkConnector,
    readonly additionalInfo: string | null,
    readonly metaData: string | null,
    private name: string | null,
    readonly linkedAt: Date,
    readonly verifiedAt: Date | null,
    private seenAt: Date,
    private revoked: Date | null,
    private evidence: string | null,
    private evidenceOn: Date | null,
  ) {}

  /**
   * A wallet whose control has just been proved.
   *
   * `verifiedAt` is set from the same instant as `linkedAt` rather than left for a
   * later step: there is no path that creates a verified row without a signature
   * having just verified, and a nullable field filled in afterwards is one that can
   * be forgotten.
   */
  static verified(input: {
    id: string;
    userId: UserId;
    address: string;
    chainId: number;
    connector: LinkConnector;
    label: string | null;
    now: Date;
  }): LinkedWallet {
    return new LinkedWallet(
      input.id,
      input.userId,
      input.address,
      input.chainId,
      'verified',
      input.connector,
      null,
      null,
      normaliseLabel(input.label),
      input.now,
      input.now,
      input.now,
      null,
      /*
       * A verified wallet carries no attachment, and that is a retention rule.
       *
       * A screenshot is only ever a stand-in for a signature. Once a signature
       * exists the picture answers nothing that the proof does not answer better,
       * so keeping a customer's image past that point is personal data held
       * without a justification — the same argument `presence` makes for sweeping
       * location fixes. `attachEvidence` discards it on upgrade; see the use case.
       */
      null,
      null,
    );
  }

  /**
   * An address the customer asked to watch, with nothing proved about it.
   *
   * The connector is always `manual`: there is no wallet at the other end of this,
   * only a string. Recording it as `injected` would make the audit trail say a
   * wallet connected when none did.
   */
  static watchOnly(input: {
    id: string;
    userId: UserId;
    address: string;
    chainId: number;
    label: string | null;
    now: Date;
  }): LinkedWallet {
    return new LinkedWallet(
      input.id,
      input.userId,
      input.address,
      input.chainId,
      'watch-only',
      'manual',
      null,
      null,
      normaliseLabel(input.label),
      input.now,
      null,
      input.now,
      null,
      null,
      null,
    );
  }

  static restore(snapshot: LinkedWalletSnapshot): LinkedWallet {
    const address = snapshot.address;
    if (address === null) {
      // A row that cannot be an address is a corrupt row, not a rejected input.
      // Throwing is correct here: it is a bug or a bad migration, and the caller
      // has nothing sensible to do with it.
      throw new TypeError(`Stored wallet ${snapshot.id} has an invalid address`);
    }

    return new LinkedWallet(
      snapshot.id,
      snapshot.userId,
      address,
      snapshot.chainId,
      snapshot.status,
      snapshot.connector,
      null,
      null,
      snapshot.label,
      snapshot.linkedAt,
      snapshot.verifiedAt,
      snapshot.lastSeenAt,
      snapshot.revokedAt,
      snapshot.evidenceId,
      snapshot.evidenceAt,
    );
  }

  get chainId(): number {
    return this.chain;
  }
  get metadata(): string | null {
    return this.metaData;
  }
  get additionalinfo(): string | null {
    return this.additionalInfo;
  }

  get label(): string | null {
    return this.name;
  }

  get lastSeenAt(): Date {
    return this.seenAt;
  }

  get revokedAt(): Date | null {
    return this.revoked;
  }

  get evidenceId(): string | null {
    return this.evidence;
  }

  get evidenceAt(): Date | null {
    return this.evidenceOn;
  }

  /**
   * Whether a file may be attached to this row.
   *
   * Only a watch-only row, and only an active one. A verified wallet has a
   * signature; offering to also upload a picture would suggest the picture
   * contributes something, and a customer who believed that would upload one
   * instead of signing.
   */
  get acceptsEvidence(): boolean {
    return this.status === 'watch-only' && this.revoked === null;
  }

  get isActive(): boolean {
    return this.revoked === null;
  }

  /**
   * Whether this row is evidence that the account controls the address.
   *
   * The one question worth asking about a linked wallet, and the reason it is a
   * method rather than `status === 'verified'` at each call site: a revoked link
   * proves nothing either, and a comparison against the status alone silently
   * forgets that.
   */
  proves(): boolean {
    return this.status === 'verified' && this.revoked === null;
  }

  rename(label: string | null): void {
    this.name = normaliseLabel(label);
  }

  /**
   * Records that a file was attached.
   *
   * ── It cannot change the status, and that is the point ────────────────────
   * There is no branch here that touches `status`, and none that could make
   * `proves()` true. A screenshot is trivially forged, so a row carrying one is
   * exactly as unproven as it was before — which is the whole reason this is a
   * method on the aggregate rather than a column somebody writes directly.
   */
  attachEvidence(id: string, at: Date): void {
    this.evidence = id;
    this.evidenceOn = at;
  }

  /** Detaches it, returning the key so the caller can delete the bytes. */
  detachEvidence(): string | null {
    const previous = this.evidence;
    this.evidence = null;
    this.evidenceOn = null;
    return previous;
  }

  /**
   * Notes that the wallet was connected again, and on which chain.
   *
   * Re-connecting an already-linked wallet updates the chain because a customer
   * who switches network in their wallet and reconnects is telling us where they
   * are now. It never upgrades a `watch-only` row: that would let re-connecting
   * grant a verification no signature was checked for.
   */
  touch(at: Date, chainId: number): void {
    this.seenAt = at;
    this.chain = chainId;
  }

  /**
   * Disconnects the wallet.
   *
   * Marked, not deleted. The trail of which addresses an account attached and when
   * is exactly what a dispute or an investigation reads, and a row removed on
   * request is a row that can be removed to hide something. It stops counting
   * against the cap and stops being shown, which is what "disconnect" means to the
   * person clicking it.
   */
  revoke(at: Date): void {
    this.revoked ??= at;
  }

  snapshot(): LinkedWalletSnapshot {
    return {
      id: this.id,
      userId: this.userId,
      address: this.address,
      chainId: this.chain,
      status: this.status,
      connector: this.connector,
      label: this.name,
      linkedAt: this.linkedAt,
      verifiedAt: this.verifiedAt,
      lastSeenAt: this.seenAt,
      revokedAt: this.revoked,
      evidenceId: this.evidence,
      evidenceAt: this.evidenceOn,
    };
  }
}

/** Trimmed, capped, and empty-means-none. A label of spaces is not a label. */
function normaliseLabel(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim().slice(0, MAX_LABEL_LENGTH);
  return trimmed.length === 0 ? null : trimmed;
}
