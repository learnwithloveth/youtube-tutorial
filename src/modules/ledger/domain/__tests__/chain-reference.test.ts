import { describe, expect, it } from 'vitest';

import { demoTransactionHash, shortenHash } from '../chain-reference';

describe('demoTransactionHash', () => {
  /* The property the whole thing rests on. A value redrawn on each read is a
     reference that changes while somebody is reading it — the failure the
     overview's deleted performance curve is remembered for. */
  it('is derived, so the same transfer always gets the same hash', () => {
    expect(demoTransactionHash('transfer-1', '')).toBe(demoTransactionHash('transfer-1', ''));
    expect(demoTransactionHash('transfer-1', '')).not.toBe(
      demoTransactionHash('transfer-2', ''),
    );
  });

  it('is 32 bytes of hex, in the shape the chain writes them', () => {
    const bare = demoTransactionHash('transfer-1', '');
    expect(bare).toMatch(/^[0-9a-f]{64}$/);

    // Ethereum prefixes; Bitcoin and Tron do not. The prefix is catalogue data so
    // the next chain brings its own convention rather than a special case here.
    const prefixed = demoTransactionHash('transfer-1', '0x');
    expect(prefixed).toBe(`0x${bare}`);
    expect(prefixed).toMatch(/^0x[0-9a-f]{64}$/);
  });

  /* A hash whose halves repeat, or whose tail is always the same, reads as a
     pattern rather than as a hash — which is the one job this has. */
  it('fills the whole width with distinct blocks', () => {
    const hash = demoTransactionHash('transfer-1', '');
    const blocks = hash.match(/.{8}/g) ?? [];

    expect(blocks).toHaveLength(8);
    expect(new Set(blocks).size).toBe(8);
  });

  it('spreads across close seeds rather than counting', () => {
    // Sequential ids are exactly what this is fed in practice, and neighbouring
    // outputs that shared a prefix would give the game away at a glance.
    const hashes = ['t-1', 't-2', 't-3', 't-4'].map((id) => demoTransactionHash(id, ''));

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
