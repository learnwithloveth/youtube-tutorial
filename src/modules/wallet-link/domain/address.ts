/**
 * An EVM account address.
 *
 * ── Why this is syntactic only ────────────────────────────────────────────────
 * The canonical display form of an Ethereum address is EIP-55: the hex digits are
 * upper- or lower-cased according to the keccak-256 hash of the lowercase string,
 * which turns a 40-character blob into something with a checksum in it. That check
 * is the reason a mistyped address is usually caught before funds move.
 *
 * Computing it needs keccak, and keccak comes from a library. The domain layer
 * imports nothing but the kernel — `pnpm lint:boundaries` enforces it — so the
 * checksum lives behind the `WalletSignatures` port and is applied one layer out.
 * What is left here is exactly the part that needs no cryptography: the shape.
 *
 * ── Lowercase is the stored form ──────────────────────────────────────────────
 * Equality between addresses is case-insensitive, and two rows differing only in
 * case are the same account. Storing the lowercase form makes a unique index do
 * that comparison, rather than every query remembering to `lower()` both sides.
 */

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export class EvmAddress {
  private constructor(readonly value: string) {}

  /**
   * Parses an address, or returns null.
   *
   * Null rather than a throw because the overwhelmingly common source of a bad
   * address is a person pasting one, which is an expected failure and belongs in
   * a `Result` at the use case above — not in an exception.
   */
  static parse(raw: string): EvmAddress | null {
    const trimmed = raw.trim();
    if (!ADDRESS_PATTERN.test(trimmed)) return null;
    return new EvmAddress(trimmed.toLowerCase());
  }

  /** True when both refer to the same account, whatever case either was written in. */
  equals(other: EvmAddress): boolean {
    return this.value === other.value;
  }

  /**
   * `0x1f98…f984` — the form used in a table cell.
   *
   * Four leading and four trailing hex digits, because that is the span people
   * actually compare against what their wallet shows. Never the only thing on
   * screen: the full address is always available to copy, since a shortened
   * address cannot be checked against anything.
   */
  short(): string {
    return `${this.value.slice(0, 6)}…${this.value.slice(-4)}`;
  }

  toString(): string {
    return this.value;
  }
}
