import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';

import type { WalletSignatures } from '../../application/ports';

/**
 * EIP-191 signature recovery and EIP-55 checksumming.
 *
 * ── Why two small libraries and not a wallet SDK ──────────────────────────────
 * Verifying a `personal_sign` signature is two primitives: keccak-256 and a
 * secp256k1 public-key recovery. `@noble/hashes` and `@noble/curves` are audited,
 * dependency-free implementations of exactly those — the same ones the large
 * Ethereum SDKs use underneath. Pulling in `viem` or `ethers` for this would add a
 * provider stack, an ABI encoder and a transaction builder to a server that
 * broadcasts nothing, and every one of those is a dependency with an attack
 * surface on the path that decides whether a signature is genuine.
 *
 * ── Nothing here can sign ─────────────────────────────────────────────────────
 * Recovery only. There is no key loading, no `sign`, and no code path that could
 * produce a signature — which is what makes this file safe to have on a server
 * that holds customer accounts.
 *
 * ── What this does not verify: EIP-1271 ───────────────────────────────────────
 * A smart-contract wallet (a Safe, most account-abstraction wallets) has no
 * private key to recover from. It "signs" by implementing `isValidSignature`, and
 * checking one means an `eth_call` against the contract on the right chain — a
 * network dependency this module does not have. Those wallets therefore fail
 * verification here and can still be added as watch-only. Supporting them properly
 * means an RPC port, which is a deliberate follow-up rather than something to fake:
 * accepting a signature we cannot check would make the verified badge a lie.
 */

/** `\x19Ethereum Signed Message:\n` — the EIP-191 personal-sign prefix. */
const PERSONAL_SIGN_PREFIX = '\u0019Ethereum Signed Message:\n';

const HEX_SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

export const nobleWalletSignatures: WalletSignatures = {
  recover(message, signature) {
    if (!HEX_SIGNATURE.test(signature.trim())) return null;

    try {
      const bytes = hexToBytes(signature.trim().slice(2));

      /*
       * The recovery id, normalised.
       *
       * Ethereum writes `v` last and as 27 or 28; the raw recovery id is 0 or 1,
       * and some wallets — and most hardware devices going through a bridge —
       * return it that way. Both are accepted, and anything else is refused rather
       * than coerced: `v` values of 35 and up encode a chain id under EIP-155,
       * which applies to transactions and never to `personal_sign`, so seeing one
       * here means the payload is not what it claims to be.
       */
      const raw = bytes[64];
      if (raw === undefined) return null;
      const recovery = raw >= 27 ? raw - 27 : raw;
      if (recovery !== 0 && recovery !== 1) return null;

      const digest = keccak_256(
        concat(utf8(PERSONAL_SIGN_PREFIX + byteLength(message)), utf8(message)),
      );

      /*
       * `@noble/curves` takes the recovery byte first and returns a *compressed*
       * point. An Ethereum address is the last 20 bytes of the keccak of the
       * uncompressed key without its `0x04` tag, so the point has to be expanded
       * before hashing — hashing the compressed form yields a plausible-looking
       * address that is simply wrong, and every verification would fail with no
       * indication why.
       */
      const compressed = secp256k1.recoverPublicKey(
        concat(new Uint8Array([recovery]), bytes.subarray(0, 64)),
        digest,
        // `prehash: false` because the digest is already keccak-256. Left at its
        // default, the library would sha-256 it again and recover an address that
        // belongs to nobody.
        { prehash: false },
      );
      const uncompressed = secp256k1.Point.fromBytes(compressed).toBytes(false);

      return checksum(toHex(keccak_256(uncompressed.subarray(1)).subarray(-20)));
    } catch {
      /*
       * A signature that does not recover is an expected outcome, not a fault.
       *
       * `@noble/curves` throws on a malformed point, on an out-of-range scalar and
       * on a high `s` value (EIP-2 requires the low form, and the curve library
       * enforces it). All of those mean "this signature is not valid here", which
       * is a `null` the use case turns into a message, not an exception that
       * becomes a 500 on somebody clicking connect.
       */
      return null;
    }
  },

  checksum(address) {
    return checksum(address);
  },
};

/**
 * EIP-55: case as a checksum.
 *
 * Each hex letter is upper-cased when the corresponding nibble of the keccak hash
 * of the *lowercase* address is 8 or above. It turns a mistyped character into an
 * address that fails a check rather than one that silently belongs to nobody.
 */
function checksum(address: string): string {
  const lower = address.toLowerCase().replace(/^0x/, '');
  const hash = toHex(keccak_256(utf8(lower))).slice(2);

  let out = '0x';
  for (let i = 0; i < lower.length; i += 1) {
    const character = lower[i] as string;
    const nibble = Number.parseInt(hash[i] as string, 16);
    out += nibble >= 8 ? character.toUpperCase() : character;
  }
  return out;
}

/**
 * The prefix counts *bytes*, not characters.
 *
 * The statement is ASCII today, so the two agree — but `message.length` would be
 * wrong the moment a non-ASCII character appeared in it, and the failure is a
 * signature that verifies in the wallet and not here, which is close to
 * undiagnosable from the outside.
 */
function byteLength(message: string): number {
  return new TextEncoder().encode(message).length;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  let out = '0x';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}
