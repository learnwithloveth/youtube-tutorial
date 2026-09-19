import { Money } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

/**
 * A ledger account: one owner, one asset, one balance.
 *
 * ── Why platform accounts exist at all ─────────────────────────────────────────
 * Double-entry only balances if both sides of every movement are accounts. A
 * customer's bitcoin does not arrive from nowhere — it arrives from custody, and
 * the fee on a withdrawal does not vanish, it lands in fee revenue. Modelling only
 * customer balances would mean every transfer had one leg, which is not
 * bookkeeping, it is a mutable number with extra steps.
 *
 * So there are four owners and the books close across all of them:
 *
 *   `user`     what we owe one customer, in one asset
 *   `custody`  the contra account. Its balance is the total customer liability,
 *              carried negative because it is the source every credit comes from
 *   `fees`     fee revenue, credited when a withdrawal is approved
 *   `payable`  approved withdrawals that have not yet left. Money that is no
 *              longer the customer's and not yet off the platform
 *   `demo`     the contra account for funds an operator issued for a workshop.
 *              Negative like custody, and deliberately *not* custody — see below
 *
 * ── Why demo funds get a contra account of their own ───────────────────────────
 * A demo grant has to balance like everything else, so it needs a second leg. The
 * obvious candidate is `custody`, and it is the wrong one: custody's magnitude is
 * the platform's liability to its customers, the number that is supposed to be
 * backed by what is actually held on chain and in the bank. Drawing workshop money
 * from it would inflate that number by funds nobody ever sent, and the one figure
 * on the treasury screen whose whole job is to be checkable would stop being
 * checkable.
 *
 * Separated, both numbers stay true and their difference is legible: custody is
 * what is owed, `demo` is what was conjured for a classroom, and an operator can
 * see at a glance which is which.
 *
 * ── The balance is stored, not derived ─────────────────────────────────────────
 * Purists derive a balance by summing entries. That is correct and unusable: it
 * turns every balance read into a scan of the account's entire history, and an
 * exchange reads balances constantly.
 *
 * So the balance is stored and updated *in the same transaction as the entries
 * that justify it*, which is what real ledgers do. The entries remain the record
 * of truth; the balance is a materialised view of them that must be reconcilable
 * by summing. `version` makes the update optimistic — two concurrent withdrawals
 * cannot both read a balance, both find it sufficient, and both write.
 */

export type AccountId = string;

export type PlatformPurpose = 'custody' | 'fees' | 'payable' | 'demo';

export type AccountOwner =
  | { readonly kind: 'user'; readonly userId: UserId }
  | { readonly kind: 'platform'; readonly purpose: PlatformPurpose };

export function userOwner(userId: UserId): AccountOwner {
  return { kind: 'user', userId };
}

export function platformOwner(purpose: PlatformPurpose): AccountOwner {
  return { kind: 'platform', purpose };
}

/**
 * The account's stable identifier, derived from its owner and asset.
 *
 * Derived rather than random so an account is addressable before it exists: the
 * first credit to a new customer does not need a lookup, an insert and a second
 * lookup — it upserts on a key both sides can compute. It also makes a row
 * self-describing in a database console, which matters on the one table an
 * operator reads when the numbers are disputed.
 */
export function accountIdFor(owner: AccountOwner, asset: string): AccountId {
  const scope = owner.kind === 'user' ? `user:${owner.userId}` : `platform:${owner.purpose}`;
  return `${scope}:${asset.toUpperCase()}`;
}

export interface LedgerAccountSnapshot {
  readonly id: AccountId;
  readonly owner: AccountOwner;
  readonly asset: string;
  readonly balance: Money;
  /**
   * The part of the balance that is spoken for and cannot be spent again.
   *
   * A hold is not a transfer. Requesting a withdrawal does not move money — it
   * reserves it, pending a decision that may be a rejection. Modelling the
   * reservation as entries would mean a rejected withdrawal had to be reversed
   * with compensating entries, and the customer's statement would show two
   * movements for something that never happened.
   */
  readonly held: Money;
  readonly version: number;
}

export class LedgerAccount {
  readonly id: AccountId;
  readonly owner: AccountOwner;
  readonly asset: string;
  private _balance: Money;
  private _held: Money;
  readonly version: number;

  private constructor(snapshot: LedgerAccountSnapshot) {
    this.id = snapshot.id;
    this.owner = snapshot.owner;
    this.asset = snapshot.asset;
    this._balance = snapshot.balance;
    this._held = snapshot.held;
    this.version = snapshot.version;
  }

  static open(owner: AccountOwner, asset: string, scale: number): LedgerAccount {
    const zero = Money.zero(asset, scale);
    return new LedgerAccount({
      id: accountIdFor(owner, asset),
      owner,
      asset: asset.toUpperCase(),
      balance: zero,
      held: zero,
      version: 0,
    });
  }

  static rehydrate(snapshot: LedgerAccountSnapshot): LedgerAccount {
    return new LedgerAccount(snapshot);
  }

  get balance(): Money {
    return this._balance;
  }

  get held(): Money {
    return this._held;
  }

  /** What may actually be spent: the balance less anything already reserved. */
  get available(): Money {
    return this._balance.subtract(this._held);
  }

  get isPlatform(): boolean {
    return this.owner.kind === 'platform';
  }

  /**
   * Applies one entry's delta.
   *
   * Refuses to take a customer account negative. A platform account may go
   * negative and routinely does — `custody` is negative by construction, since it
   * is the source every customer credit is drawn from — so the rule is scoped to
   * the accounts where a negative balance would mean money that does not exist.
   */
  applyDelta(delta: Money): void {
    const next = this._balance.add(delta);
    if (!this.isPlatform && next.isNegative) {
      throw new RangeError(
        `Applying ${delta.toString()} to ${this.id} would overdraw it to ${next.toString()}.`,
      );
    }
    this._balance = next;
  }

  /** Reserves part of the balance. Returns false when there is not enough free. */
  hold(amount: Money): boolean {
    if (amount.isNegative) throw new RangeError('A hold cannot be negative.');
    if (this.available.compare(amount) < 0) return false;
    this._held = this._held.add(amount);
    return true;
  }

  /** Gives a reservation back, when a withdrawal is rejected or abandoned. */
  release(amount: Money): void {
    if (this._held.compare(amount) < 0) {
      throw new RangeError(`Cannot release ${amount.toString()} from ${this.id}: not held.`);
    }
    this._held = this._held.subtract(amount);
  }

  snapshot(): LedgerAccountSnapshot {
    return {
      id: this.id,
      owner: this.owner,
      asset: this.asset,
      balance: this._balance,
      held: this._held,
      version: this.version,
    };
  }
}
