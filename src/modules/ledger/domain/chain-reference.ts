/**
 * Chain-shaped transaction hashes, for movements that never touched a chain.
 *
 * ── Read this before using it anywhere else ───────────────────────────────────
 * Everything else in this codebase refuses to invent a fact. `market-data` will
 * render an empty price rather than a guessed one; `recordDeposit` refuses a
 * credit with no external reference; the approvals queue dropped its risk scores
 * because they were `Math.random()`. This file appears to break that rule and does
 * a transfer that is *labelled as fabricated on every surface that shows it* — its
 * own transfer kind, its own contra account, its own word on the statement, its
 * own line in the audit log.
 *
 * ── Derived, never drawn ──────────────────────────────────────────────────────
 * The same transfer id always produces the same hash. That is not a nicety: a
 * value redrawn on each read is a reference that changes while somebody is reading
 * it, which is the failure the overview's deleted performance curve is remembered
 * for. It also means nothing has to be stored for the value to be stable — though
 * it *is* stored, on the transfer, so a later change to this function cannot
 * rewrite history.
 */

/** Bytes in a transaction hash, on every chain this platform lists. */
const HASH_BYTES = 32;

/**
 * FNV-1a, expanded by re-seeding.
 *
 * Not a cryptographic hash and it does not need to be. The requirements are that
 * it is pure, deterministic, cheap, and spreads its output well enough that the
 * result reads as a hash rather than as a pattern. FNV-1a is all four in nine
 * lines; reaching for SHA-256 would drag `node:crypto` into a domain file that is
 * meant to import nothing.
 */
function hexDigest(seed: string, characters: number): string {
  let out = '';

  for (let round = 0; out.length < characters; round += 1) {
    let hash = 0x811c9dc5;
    const input = `${seed}#${round}`;

    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      // `Math.imul` keeps the multiply in 32 bits. Plain `*` would overflow into
      // a float above 2^53 and quietly stop being the algorithm.
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    out += hash.toString(16).padStart(8, '0');
  }

  return out.slice(0, characters);
}

/**
 * A stable, chain-shaped hash for one demo transfer.
 *
 * `prefix` comes from the network in the asset catalogue — Ethereum writes its
 * hashes `0x…` and Bitcoin and Tron do not — so the shape matches the chain the
 * grant is pretending to have arrived on rather than a single house style.
 */
export function demoTransactionHash(transferId: string, prefix: string): string {
  return `${prefix}${hexDigest(transferId, HASH_BYTES * 2)}`;
}

/**
 * The middle of a hash, removed.
 *
 * Every block explorer does this and for the same reason: sixty-six characters is
 * not a thing a person reads, and the ends are what they check against another
 * copy. The full value stays on the record and goes to the clipboard — this is a
 * rendering choice, never a stored one.
 */
export function shortenHash(value: string, lead = 10, tail = 8): string {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
