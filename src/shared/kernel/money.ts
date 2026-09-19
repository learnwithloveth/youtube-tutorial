/**
 * Money — an exact decimal amount, carried as integer minor units in `bigint`.
 *
 * Why not `number`: IEEE-754 cannot represent most decimal fractions. The
 * canonical demonstration is `0.1 + 0.2 === 0.30000000000000004`. On a page
 * that quotes prices this produces figures that are visibly wrong, and in a
 * ledger it produces money that does not exist. There is no rounding discipline
 * that fixes a representation error, so the representation has to be integral.
 *
 * A Money therefore carries three things:
 *   - `minorUnits` — the amount as an integer, in units of 10^-scale
 *   - `currency`   — what the amount is denominated in
 *   - `scale`      — how many decimal places those units represent
 *
 * `scale` is explicit rather than derived from the currency because a USD
 * *price* and a USD *fee* need different precision: BTC at $94,820.44 is fine at
 * scale 2, but SHIB at $0.00002341 is zero at scale 2. The scale travels with
 * the value so the precision a number was captured at is never guessed at
 * downstream.
 *
 * Arithmetic between different currencies or different scales throws. That is a
 * programming error, not a runtime condition — there is no sensible value to
 * return, and returning one would hide the bug.
 */

export type CurrencyCode = string;

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;

export class Money {
  private constructor(
    readonly minorUnits: bigint,
    readonly currency: CurrencyCode,
    readonly scale: number,
  ) {}

  /** Builds from an already-integral amount. The caller owns the scale. */
  static of(minorUnits: bigint, currency: CurrencyCode, scale: number): Money {
    assertValidScale(scale);
    return new Money(minorUnits, normaliseCurrency(currency), scale);
  }

  static zero(currency: CurrencyCode, scale: number): Money {
    return Money.of(0n, currency, scale);
  }

  /**
   * Parses an exact decimal string — the only lossless way in from an external
   * source. Feeds and databases hand us text; keeping it text until it is an
   * integer means the value never passes through a float.
   */
  static fromDecimalString(value: string, currency: CurrencyCode, scale: number): Money {
    assertValidScale(scale);
    const trimmed = value.trim();
    if (!DECIMAL_PATTERN.test(trimmed)) {
      throw new TypeError(`Money.fromDecimalString received a non-decimal string: "${value}"`);
    }

    const negative = trimmed.startsWith('-');
    const unsigned = negative ? trimmed.slice(1) : trimmed;
    const [whole, fraction = ''] = unsigned.split('.');

    // Pad or truncate the fraction to the target scale. Truncation rather than
    // rounding: a price is being *stored* at a declared precision, and rounding
    // half-up here would silently invent a final digit.
    const padded = fraction.padEnd(scale, '0').slice(0, scale);
    const digits = `${whole}${padded}`.replace(/^0+(?=\d)/, '');
    const magnitude = BigInt(digits === '' ? '0' : digits);

    return new Money(negative ? -magnitude : magnitude, normaliseCurrency(currency), scale);
  }

  /**
   * Builds from a JavaScript number.
   *
   * Lossy by construction, and named so that every call site admits it. Use it
   * only for values that were never exact to begin with — hand-authored
   * editorial figures, test fixtures. Never for a value that came off a feed or
   * out of the database, both of which can give us a string.
   */
  static fromUnsafeNumber(value: number, currency: CurrencyCode, scale: number): Money {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Money.fromUnsafeNumber received a non-finite number: ${value}`);
    }
    return Money.fromDecimalString(value.toFixed(scale), currency, scale);
  }

  get isZero(): boolean {
    return this.minorUnits === 0n;
  }

  get isNegative(): boolean {
    return this.minorUnits < 0n;
  }

  add(other: Money): Money {
    this.assertCompatible(other, 'add');
    return new Money(this.minorUnits + other.minorUnits, this.currency, this.scale);
  }

  subtract(other: Money): Money {
    this.assertCompatible(other, 'subtract');
    return new Money(this.minorUnits - other.minorUnits, this.currency, this.scale);
  }

  negate(): Money {
    return new Money(-this.minorUnits, this.currency, this.scale);
  }

  /** Returns this amount restated at a different precision. */
  withScale(nextScale: number): Money {
    assertValidScale(nextScale);
    if (nextScale === this.scale) return this;

    if (nextScale > this.scale) {
      const factor = 10n ** BigInt(nextScale - this.scale);
      return new Money(this.minorUnits * factor, this.currency, nextScale);
    }

    const factor = 10n ** BigInt(this.scale - nextScale);
    return new Money(divideHalfUp(this.minorUnits, factor), this.currency, nextScale);
  }

  /** -1, 0 or 1. Comparison requires the same currency and scale. */
  compare(other: Money): -1 | 0 | 1 {
    this.assertCompatible(other, 'compare');
    if (this.minorUnits < other.minorUnits) return -1;
    if (this.minorUnits > other.minorUnits) return 1;
    return 0;
  }

  equals(other: Money): boolean {
    return (
      this.currency === other.currency &&
      this.scale === other.scale &&
      this.minorUnits === other.minorUnits
    );
  }

  /** The exact value as a decimal string — the canonical serialisation. */
  toDecimalString(): string {
    const negative = this.minorUnits < 0n;
    const digits = (negative ? -this.minorUnits : this.minorUnits).toString().padStart(this.scale + 1, '0');
    const whole = digits.slice(0, digits.length - this.scale);
    const fraction = this.scale === 0 ? '' : `.${digits.slice(digits.length - this.scale)}`;
    return `${negative ? '-' : ''}${whole}${fraction}`;
  }

  /**
   * The same value with its trailing zeros dropped: `0.5` rather than
   * `0.500000000000000000`.
   *
   * ── Still exact ───────────────────────────────────────────────────────────
   * This only ever *removes characters* from `toDecimalString()`. The tempting
   * one-liner — `String(Number(this.toDecimalString()))` — is a rounding
   * function wearing a formatter's clothes: `Number('1.000000000000000001')` is
   * `1.0000000000000002`, and an 18-decimal asset produces values past a
   * double's precision every day.
   *
   * ── When to reach for it ──────────────────────────────────────────────────
   * Headlines only. `toDecimalString()` stays the canonical serialisation and
   * is what gets stored, compared or itemised, because `0.5 ETH` and
   * `0.500000000000000000 ETH` are the same number but not the same evidence —
   * a receipt's detail rows print the scale the ledger actually holds.
   */
  toTrimmedString(): string {
    return trimDecimalString(this.toDecimalString());
  }

  /**
   * The value as a `number`, for presentation only.
   *
   * `Intl.NumberFormat` takes a number, so the boundary has to exist. It lives
   * here, named, at the very edge — never in the domain, and never on a value
   * that is about to be stored or added to something.
   */
  toNumberForDisplay(): number {
    return Number(this.toDecimalString());
  }

  toString(): string {
    return `${this.toDecimalString()} ${this.currency}`;
  }

  /** Plain, serialisable shape for crossing the server/client boundary. */
  toJSON(): MoneyJson {
    return { amount: this.toDecimalString(), currency: this.currency, scale: this.scale };
  }

  static fromJSON(json: MoneyJson): Money {
    return Money.fromDecimalString(json.amount, json.currency, json.scale);
  }

  private assertCompatible(other: Money, operation: string): void {
    if (this.currency !== other.currency) {
      throw new TypeError(
        `Cannot ${operation} ${this.currency} and ${other.currency}: convert to a common currency first.`,
      );
    }
    if (this.scale !== other.scale) {
      throw new TypeError(
        `Cannot ${operation} amounts at scale ${this.scale} and ${other.scale}: restate one with withScale() first.`,
      );
    }
  }
}

export interface MoneyJson {
  readonly amount: string;
  readonly currency: CurrencyCode;
  readonly scale: number;
}

function normaliseCurrency(currency: CurrencyCode): CurrencyCode {
  const upper = currency.trim().toUpperCase();
  if (upper.length < 2) throw new TypeError(`Not a currency code: "${currency}"`);
  return upper;
}

function assertValidScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > 30) {
    throw new RangeError(`Scale must be an integer between 0 and 30, received ${scale}`);
  }
}

/** Integer division rounding halves away from zero, so -0.5 → -1 and 0.5 → 1. */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const remainder = magnitude % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Drops trailing zeros from an exact decimal string, without touching its value.
 *
 * ── Why it is exported separately from `Money` ────────────────────────────────
 * Amounts cross layers as exact decimal *strings*, so by the time a DTO reaches a
 * page or an activity detail line the `Money` is long gone — and the alternative
 * to this is a second regex in the presentation layer that quietly drifts from
 * `toTrimmedString`. One implementation, used by both.
 *
 * ── Still exact ───────────────────────────────────────────────────────────────
 * It only ever removes characters. The tempting `String(Number(decimal))` is a
 * rounding function wearing a formatter's clothes: `Number('1.000000000000000001')`
 * is `1.0000000000000002`, and an 18-decimal asset produces values past a double's
 * precision every day.
 */
/**
 * A decimal string cut down to something a person can read.
 *
 * ── Why 18 zeros is a bug and not a detail ────────────────────────────────────
 * An asset's scale is the protocol's precision, not a display choice: ether is
 * stored at 18 decimals because a wei is 10^-18 of one. Printed straight, an empty
 * ether balance reads "0.000000000000000000", which is noise where a sentence
 * wanted a number — and on a line that is already telling somebody their
 * withdrawal was refused.
 *
 * ── It truncates, and only ever downward ──────────────────────────────────────
 * Digits past the limit are dropped, never rounded. For the balances this is used
 * on that is the safe direction: a rounded-up "available" figure is a promise of
 * money that is not there, and a truncated one is an understatement nobody can act
 * on badly. Trailing zeros then go, so 18 decimals of nothing become "0" rather
 * than "0.000000".
 *
 * Presentation only. It loses information by design, so nothing that will be
 * stored, compared or added to anything else may pass through it — that is what
 * the exact string on the `Money` is for.
 */
export function shortenDecimalString(decimal: string, maximumDecimals = 6): string {
  const point = decimal.indexOf('.');
  if (point === -1) return decimal;

  return trimDecimalString(decimal.slice(0, point + 1 + maximumDecimals));
}

export function trimDecimalString(decimal: string): string {
  // A scale of zero has no point to trim behind, and "1200" must survive intact.
  if (!decimal.includes('.')) return decimal;

  const trimmed = decimal.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}
