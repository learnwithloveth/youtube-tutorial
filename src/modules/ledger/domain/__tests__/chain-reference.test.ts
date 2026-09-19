import { describe, expect, it } from 'vitest';

import { derivedTransactionHash, shortenHash } from '../chain-reference';

describe('derivedTransactionHash', () => {
  /* The property the whole thing rests on. A value redrawn on each read is a
     reference that changes while somebody is reading it — the failure the
     overview's deleted performance curve is remembered for. */
  it('is derived, so the same transfer always gets the same hash', () => {
    expect(derivedTransactionHash('transfer-1', '')).toBe(derivedTransactionHash('transfer-1', ''));
    expect(derivedTransactionHash('transfer-1', '')).not.toBe(
      derivedTransactionHash('transfer-2', ''),
    );
  });

  it('is 32 bytes of hex, in the shape the chain writes them', () => {
    const bare = derivedTransactionHash('transfer-1', '');
    expect(bare).toMatch(/^[0-9a-f]{64}$/);

    // Ethereum prefixes; Bitcoin and Tron do not. The prefix is catalogue data so
    // the next chain brings its own convention rather than a special case here.
    const prefixed = derivedTransactionHash('transfer-1', '0x');
    expect(prefixed).toBe(`0x${bare}`);
    expect(prefixed).toMatch(/^0x[0-9a-f]{64}$/);
  });

  /* A hash whose halves repeat, or whose tail is always the same, reads as a
     pattern rather than as a hash — which is the one job this has. */
  it('fills the whole width with distinct blocks', () => {
    const hash = derivedTransactionHash('transfer-1', '');
    const blocks = hash.match(/.{8}/g) ?? [];

    expect(blocks).toHaveLength(8);
    expect(new Set(blocks).size).toBe(8);
  });

  /*
   * The test this file should have opened with.
   *
   * The first implementation restarted FNV-1a each round on `${seed}#${round}`,
   * so every block of one hash was a fixed distance from the last and the result
   * counted in plain sight:
   *
   *     e3b37730 e4b378c3 e5b37a56 e6b37be9 …
   *
   * Every assertion above passed on that: eight blocks, all distinct, right
   * length, right alphabet. "Distinct" is not "unpredictable", and the gap
   * between those two is the whole property. This checks the gap.
   */
  it('does not count, which distinctness alone does not rule out', () => {
    for (const seed of ['transfer-1', 'abc', '0']) {
      const blocks = (derivedTransactionHash(seed, '').match(/.{8}/g) ?? []).map((block) =>
        Number.parseInt(block, 16),
      );
      const gaps = blocks.slice(1).map((value, index) => value - (blocks[index] ?? 0));

      // A constant gap is an arithmetic sequence wearing hexadecimal.
      expect(new Set(gaps).size).toBeGreaterThan(1);
      // And the leading byte must not simply increment, which is how the old one
      // read at a glance: e3…, e4…, e5…
      const leads = blocks.map((value) => value >>> 24);
      expect(leads.every((lead, index) => index === 0 || lead === (leads[index - 1] ?? 0) + 1))
        .toBe(false);
    }
  });

  /* Flipping one character of the seed must change the whole output, not its
     tail. Without an avalanche step the low bits track the last byte fed in. */
  it('avalanches: one character of the seed changes most of the hash', () => {
    const a = derivedTransactionHash('transfer-1', '');
    const b = derivedTransactionHash('transfer-2', '');

    const shared = [...a].filter((character, index) => character === b[index]).length;
    // Two unrelated hex strings share about 1 character in 16 by chance; anything
    // near half means the seed is bleeding through positionally.
    expect(shared).toBeLessThan(a.length / 4);
  });

  it('spreads across close seeds rather than counting', () => {
    // Sequential ids are exactly what this is fed in practice, and neighbouring
    // outputs that shared a prefix would give the game away at a glance.
    const hashes = ['t-1', 't-2', 't-3', 't-4'].map((id) => derivedTransactionHash(id, ''));

    expect(new Set(hashes).size).toBe(4);
    expect(new Set(hashes.map((hash) => hash.slice(0, 8))).size).toBe(4);
  });
});

describe('shortenHash', () => {
  it('keeps both ends, which is what a reader checks', () => {
    const hash = `0x${'a1b2c3d4'.repeat(8)}`;
    const short = shortenHash(hash);

    expect(short.startsWith('0xa1b2c3d4')).toBe(true);
    expect(short.endsWith(hash.slice(-8))).toBe(true);
    expect(short).toContain('…');
  });

  it('leaves a value it cannot usefully shorten alone', () => {
    expect(shortenHash('0xabc')).toBe('0xabc');
  });
});
