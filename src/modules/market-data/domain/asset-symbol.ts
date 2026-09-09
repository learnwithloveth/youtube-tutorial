/**
 * AssetSymbol — the ticker code a listed asset trades under.
 *
 * A value object rather than a `string` because a bare string invites the two
 * bugs this type exists to prevent: comparing "btc" to "BTC" and getting a
 * false miss, and passing a slug or a display name where a symbol was meant.
 */

const SYMBOL_PATTERN = /^[A-Z0-9]{2,12}$/;

export class AssetSymbol {
  private constructor(readonly value: string) {}

  /**
   * Parses a symbol, normalising case. Throws on malformed input because a
   * symbol only ever originates from our own catalogue or a feed response we
   * have already validated — a bad one here means the caller has a bug.
   */
  static parse(raw: string): AssetSymbol {
    const normalised = raw.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(normalised)) {
      throw new TypeError(`Not a valid asset symbol: "${raw}"`);
    }
    return new AssetSymbol(normalised);
  }

  /** Non-throwing parse, for user-supplied input such as a URL segment. */
  static tryParse(raw: string): AssetSymbol | null {
    const normalised = raw.trim().toUpperCase();
    return SYMBOL_PATTERN.test(normalised) ? new AssetSymbol(normalised) : null;
  }

  equals(other: AssetSymbol): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
