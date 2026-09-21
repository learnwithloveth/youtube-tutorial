import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { describe, expect, it } from 'vitest';

import { nobleWalletSignatures } from '../signatures';

/**
 * The verifier, against signatures made by an actual key.
 *
 * No I/O, so it belongs in the unit suite despite living in `infrastructure`: this
 * is the one adapter whose correctness is a mathematical property rather than a
 * conversation with a service. It is also the adapter where a silent bug is worst
 * — a verifier that accepts too much makes the "Verified" badge meaningless, and
 * one that accepts too little makes the feature look broken to everyone.
 *
 * The key below is the one from the go-ethereum test fixtures, whose address is
 * published alongside it. Deriving that address from the key is the first
 * assertion, so a wrong derivation cannot be hidden by a self-consistent
 * round trip through our own code.
 */

const PRIVATE_KEY = hexToBytes('4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318');
const ADDRESS = '0x2c7536E3605D9C16a7a3D7b1898e529396a65c23';

/** What a wallet does for `personal_sign`: prefix, keccak, sign, `v` last. */
function personalSign(message: string, key: Uint8Array): string {
  const encoded = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode(`\u0019Ethereum Signed Message:\n${encoded.length}`);

  const payload = new Uint8Array(prefix.length + encoded.length);
  payload.set(prefix, 0);
  payload.set(encoded, prefix.length);

  const signature = secp256k1.sign(keccak_256(payload), key, {
    prehash: false,
    format: 'recovered',
  });

  // `@noble/curves` puts the recovery byte first; Ethereum puts it last, as 27/28.
  const out = new Uint8Array(65);
  out.set(signature.subarray(1), 0);
  out[64] = (signature[0] as number) + 27;
  return `0x${[...out].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe('nobleWalletSignatures.checksum', () => {
  it('produces the EIP-55 form of a lowercase address', () => {
    expect(nobleWalletSignatures.checksum(ADDRESS.toLowerCase())).toBe(ADDRESS);
  });

  it('is idempotent, so a checksummed address survives a second pass', () => {
    expect(nobleWalletSignatures.checksum(ADDRESS)).toBe(ADDRESS);
  });

  it.each([
    // The four published EIP-55 vectors.
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
  ])('matches the published vector %s', (address) => {
    expect(nobleWalletSignatures.checksum(address.toLowerCase())).toBe(address);
  });
});

describe('nobleWalletSignatures.recover', () => {
  const message = 'novex.io wants you to sign in with your Ethereum account:';

  it('recovers the signing address', () => {
    expect(nobleWalletSignatures.recover(message, personalSign(message, PRIVATE_KEY))).toBe(
      ADDRESS,
    );
  });

  it('recovers when the wallet reports v as 0 or 1 rather than 27 or 28', () => {
    const signature = personalSign(message, PRIVATE_KEY);
    const bytes = hexToBytes(signature.slice(2));
    bytes[64] = (bytes[64] as number) - 27;
    const raw = `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;

    expect(nobleWalletSignatures.recover(message, raw)).toBe(ADDRESS);
  });

  it('does not recover the same address for a different message', () => {
    const signature = personalSign(message, PRIVATE_KEY);
    // The property the whole flow rests on: a signature is over *these* bytes.
    // A verifier that ignored the message would return the address here too.
    expect(nobleWalletSignatures.recover(`${message} `, signature)).not.toBe(ADDRESS);
  });

  it('counts the prefix in bytes, so a non-ASCII message still verifies', () => {
    // A UTF-8 message whose character count and byte count differ. Getting this
    // wrong produces a signature that the wallet made and the server rejects.
    const unicode = 'Link this wallet — café €';
    expect(nobleWalletSignatures.recover(unicode, personalSign(unicode, PRIVATE_KEY))).toBe(
      ADDRESS,
    );
  });

  it.each([
    ['empty', ''],
    ['not hex', '0xzz'],
    ['64 bytes, no recovery byte', `0x${'ab'.repeat(64)}`],
    ['66 bytes', `0x${'ab'.repeat(66)}`],
    ['missing the 0x', 'ab'.repeat(65)],
  ])('refuses a signature that is %s', (_label, signature) => {
    expect(nobleWalletSignatures.recover(message, signature)).toBeNull();
  });

  it('refuses an EIP-155 style v, which never applies to personal_sign', () => {
    const bytes = hexToBytes(personalSign(message, PRIVATE_KEY).slice(2));
    bytes[64] = 37;
    const forged = `0x${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;

    expect(nobleWalletSignatures.recover(message, forged)).toBeNull();
  });

  it('returns null rather than throwing on a signature that cannot recover', () => {
    // All-zero r and s is not a point on the curve. The curve library throws; the
    // adapter's contract is that a bad signature is a value, not an exception.
    expect(nobleWalletSignatures.recover(message, `0x${'00'.repeat(64)}1b`)).toBeNull();
  });
});
