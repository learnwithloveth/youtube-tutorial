import { describe, expect, it } from 'vitest';

import { fixedClock } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import { CHALLENGE_TTL_MS, LinkChallenge } from '../link-challenge';

const USER = '11111111-1111-4111-8111-111111111111' as UserId;
const ADDRESS = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23';
const NOW = new Date('2026-09-21T10:00:00.000Z');

function challenge() {
  return LinkChallenge.issue({
    nonce: 'a'.repeat(64),
    userId: USER,
    checksummedAddress: ADDRESS,
    chainId: 1,
    domain: 'novex.io',
    uri: 'https://novex.io',
    now: NOW,
  });
}

describe('LinkChallenge', () => {
  it('builds an EIP-4361 message naming the site, account, chain and expiry', () => {
    const lines = challenge().message().split('\n');

    expect(lines[0]).toBe('novex.io wants you to sign in with your Ethereum account:');
    // The checksummed form, byte for byte — a verifier rebuilds this string and
    // any difference changes the hash.
    expect(lines[1]).toBe(ADDRESS);
    expect(lines).toContain('URI: https://novex.io');
    expect(lines).toContain('Version: 1');
    expect(lines).toContain('Chain ID: 1');
    expect(lines).toContain(`Nonce: ${'a'.repeat(64)}`);
    expect(lines).toContain('Issued At: 2026-09-21T10:00:00.000Z');
    expect(lines).toContain('Expiration Time: 2026-09-21T10:05:00.000Z');
  });

  it('says what the signature does not do, where the signer will read it', () => {
    const message = challenge().message();
    expect(message).toContain('does not move funds');
    expect(message).toContain('permission to spend');
  });

  it('expires exactly at the TTL, not after it', () => {
    const issued = challenge();
    const atExpiry = new Date(NOW.getTime() + CHALLENGE_TTL_MS);

    expect(issued.isExpired(fixedClock(new Date(atExpiry.getTime() - 1)))).toBe(false);
    expect(issued.isExpired(fixedClock(atExpiry))).toBe(true);
  });
});
