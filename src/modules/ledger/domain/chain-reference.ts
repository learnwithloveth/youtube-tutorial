/**
 * Chain-shaped transaction hashes, for movements that never touched a chain.
 *
 * ── Read this before trusting one of these ────────────────────────────────────
 * This platform has no chain client. Nothing it does is ever broadcast, no node
 * confirms anything, and no hash here was returned by any network — every one is
 * computed from the transfer's own id by the function below.
 *
 * It began as a demo-only prop and now runs on every movement, which is a
 * deliberate product decision for a deployment whose job is to *teach* people what
 * an exchange looks like: a statement with a transaction column that is empty on
 * three rows in five does not show anybody how the real thing reads. The cost is
 * stated plainly here because it is real — a reader cannot tell one of these from
 * a hash that came off a chain, and on a platform holding real money that would be
 * a lie rather than a teaching aid.
 *
 * The one exception is a **deposit a customer actually evidenced**: there, the
 * hash they gave is kept, and only a claim submitted without one falls back to a
 * derived value. So a real reference always wins over a manufactured one.
 *
 * Before this platform holds real funds, this is the file to revisit — together
 * with the two self-approval rules currently commented out in `Withdrawal.approve`
 * and `DepositClaim.approve`.
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
 * MurmurHash3's finaliser.
 *
 * FNV-1a accumulates well and *ends* badly: its last operation is a multiply, so
 * the low bits of the result still track the low bits of the last byte fed in.
 * This is the standard fix — three xor-shifts around two multiplies, which pushes
 * every input bit into every output bit. It is what turns an accumulator into
 * something whose output looks like noise.
 */
function mix32(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b) >>> 0;
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35) >>> 0;
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/**
 * FNV-1a, chained across rounds and finalised.
 *
 * Not a cryptographic hash and it does not need to be. The requirements are that
 * it is pure, deterministic, cheap, and spreads its output well enough that the
 * result reads as a hash rather than as a pattern. Reaching for SHA-256 would drag
 * `node:crypto` into a domain file that is meant to import nothing.
 *
 * ── Two details that are load-bearing, both learned the hard way ──────────────
 * The first version wrote `${seed}#${round}` and restarted the accumulator each
 * round. Every round therefore fed identical bytes until the very last one, and
 * FNV-1a's last act is a multiply — so consecutive blocks came out a fixed
 * distance apart and the "hash" was visibly arithmetic:
 *
 *     e3b37730 e4b378c3 e5b37a56 e6b37be9 e7b37d7c …
 *      ↑ +1     ↑ +1     ↑ +1     ↑ +1
 *
 * Distinct, which is all the original test checked, and obviously counting to
 * anybody who looked at it. So: the round goes **first**, where every byte of the
 * seed after it avalanches the difference, the accumulator **carries** from one
 * round to the next so blocks are not independent, and each block is pushed
 * through {@link mix32} before it is printed.
 */
function hexDigest(seed: string, characters: number): string {
  let out = '';
  let carried = 0x811c9dc5;

  for (let round = 0; out.length < characters; round += 1) {
    // The round leads. Putting it last is the bug described above.
    const input = `${round}#${seed}`;
    let hash = carried;

    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      // `Math.imul` keeps the multiply in 32 bits. Plain `*` would overflow into
      // a float above 2^53 and quietly stop being the algorithm.
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }

    carried = hash;
    out += mix32(hash).toString(16).padStart(8, '0');
  }

  return out.slice(0, characters);
}

/**
 * A stable, chain-shaped hash for one transfer.
 *
 * `prefix` comes from the network in the asset catalogue — Ethereum writes its
 * hashes `0x…` and Bitcoin and Tron do not — so the shape matches the chain the
 * movement is described as having crossed rather than a single house style.
 *
 * Named for what it is. It was `demoTransactionHash` while demo grants were the
 * only caller; keeping that name once it runs on withdrawals and deposits would
 * have every call site read as though it were doing something it is not.
 */
export function derivedTransactionHash(transferId: string, prefix: string): string {
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
