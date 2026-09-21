import { describe, expect, it } from 'vitest';

import type { UserId } from '@/shared/kernel/ids';

import { EvmAddress } from '../address';
import { LinkedWallet, MAX_LABEL_LENGTH } from '../linked-wallet';

const USER = '11111111-1111-4111-8111-111111111111' as UserId;
const ADDRESS = EvmAddress.parse('0x2c7536E3605D9C16a7a3D7b1898e529396a65c23') as EvmAddress;
const NOW = new Date('2026-09-21T10:00:00.000Z');

function verified() {
  return LinkedWallet.verified({
    id: 'w1',
    userId: USER,
    address: ADDRESS,
    chainId: 1,
    connector: 'injected',
    label: 'Main',
    now: NOW,
  });
}

function watching() {
  return LinkedWallet.watchOnly({
    id: 'w2',
    userId: USER,
    address: ADDRESS,
    chainId: 1,
    label: null,
    now: NOW,
  });
}

describe('LinkedWallet', () => {
  it('proves control only when verified and still connected', () => {
    expect(verified().proves()).toBe(true);
    // The distinction the module exists for: an address somebody typed proves
    // nothing about who controls it.
    expect(watching().proves()).toBe(false);
  });

  it('stops proving anything once disconnected', () => {
    const wallet = verified();
    wallet.revoke(new Date('2026-09-22T10:00:00.000Z'));

    expect(wallet.proves()).toBe(false);
    expect(wallet.isActive).toBe(false);
  });

  it('keeps the first revocation time when disconnect is submitted twice', () => {
    const wallet = verified();
    const first = new Date('2026-09-22T10:00:00.000Z');
    wallet.revoke(first);
    wallet.revoke(new Date('2026-09-23T10:00:00.000Z'));

    expect(wallet.revokedAt).toEqual(first);
  });

  it('records a watch-only row as manual, never as a wallet that connected', () => {
    expect(watching().connector).toBe('manual');
    expect(watching().verifiedAt).toBeNull();
  });

  it('follows the chain the wallet reconnects on', () => {
    const wallet = verified();
    const later = new Date('2026-09-21T11:00:00.000Z');
    wallet.touch(later, 8453);

    expect(wallet.chainId).toBe(8453);
    expect(wallet.lastSeenAt).toEqual(later);
    // Reconnecting reports where the wallet is now. It never upgrades a status.
    expect(wallet.status).toBe('verified');
  });

  it('never upgrades a watch-only row by reconnecting', () => {
    const wallet = watching();
    wallet.touch(new Date('2026-09-21T11:00:00.000Z'), 1);

    expect(wallet.status).toBe('watch-only');
    expect(wallet.proves()).toBe(false);
  });

  it('accepts a file only on an active watch-only row', () => {
    expect(watching().acceptsEvidence).toBe(true);
    // A verified wallet has a signature. Offering an upload beside it would imply
    // the picture contributes something.
    expect(verified().acceptsEvidence).toBe(false);

    const disconnected = watching();
    disconnected.revoke(new Date('2026-09-22T10:00:00.000Z'));
    expect(disconnected.acceptsEvidence).toBe(false);
  });

  it('attaching a file changes nothing about what the row proves', () => {
    const wallet = watching();
    wallet.attachEvidence('file-1', NOW);

    expect(wallet.evidenceId).toBe('file-1');
    // The property this whole feature has to preserve: a screenshot is forgeable,
    // so a row carrying one is exactly as unproven as it was before.
    expect(wallet.status).toBe('watch-only');
    expect(wallet.proves()).toBe(false);
  });

  it('hands back the key it detaches, so the caller can delete the bytes', () => {
    const wallet = watching();
    wallet.attachEvidence('file-1', NOW);

    expect(wallet.detachEvidence()).toBe('file-1');
    expect(wallet.evidenceId).toBeNull();
    expect(wallet.evidenceAt).toBeNull();
    // Detaching twice is not an error; it simply has nothing to hand back.
    expect(wallet.detachEvidence()).toBeNull();
  });

  it('a newly verified wallet carries no attachment', () => {
    expect(verified().evidenceId).toBeNull();
  });

  it('trims, caps and empties labels', () => {
    const wallet = verified();

    wallet.rename('   Cold storage   ');
    expect(wallet.label).toBe('Cold storage');

    wallet.rename('   ');
    expect(wallet.label).toBeNull();

    wallet.rename('x'.repeat(MAX_LABEL_LENGTH + 20));
    expect(wallet.label).toHaveLength(MAX_LABEL_LENGTH);
  });

  it('refuses to restore a row whose address is not an address', () => {
    expect(() =>
      LinkedWallet.restore({
        id: 'w3',
        userId: USER,
        address: 'not-an-address',
        chainId: 1,
        status: 'verified',
        connector: 'injected',
        label: null,
        linkedAt: NOW,
        verifiedAt: NOW,
        lastSeenAt: NOW,
        revokedAt: null,
        evidenceId: null,
        evidenceAt: null,
      }),
    ).toThrow(TypeError);
  });
});
