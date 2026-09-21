import { describe, expect, it } from 'vitest';

import { requiresGasToken } from '../../../domain/asset';
import { isRetiredAssetCode, LEDGER_ASSETS, quoteSymbolForAsset } from '../assets';

/**
 * Properties of the catalogue itself.
 *
 * No I/O, so it belongs in the unit suite despite living in `infrastructure` — the
 * catalogue is a constant, and what is being checked is that it stays internally
 * consistent as assets are added to it.
 */

describe('the ledger asset catalogue', () => {
  it('gives every asset a unique code', () => {
    const codes = LEDGER_ASSETS.map((asset) => asset.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  /**
   * The invariant `deposit-addresses.ts` builds its variable names on.
   *
   * `DEPOSIT_ADDRESS_<TICKER>_<NETWORK>` is only safe while no two assets share
   * both a ticker and a network — and they cannot, because two assets share a
   * ticker *precisely* when they are the same token on different chains. If this
   * ever fails, two assets are reading one deposit address, and an address for the
   * wrong chain is funds that are gone rather than funds that are late.
   */
  it('never lets two assets share a ticker and a network', () => {
    const pairs = LEDGER_ASSETS.flatMap((asset) =>
      asset.networks.map((network) => `${asset.ticker}:${network.id}`),
    );

    expect(new Set(pairs).size).toBe(pairs.length);
  });

  describe('the two tethers', () => {
    const erc20 = LEDGER_ASSETS.find((asset) => asset.code === 'USDT_ERC20');
    const trc20 = LEDGER_ASSETS.find((asset) => asset.code === 'USDT_TRC20');

    it('are two separate assets, each on exactly one chain', () => {
      expect(erc20?.networks.map((network) => network.id)).toEqual(['ethereum']);
      expect(trc20?.networks.map((network) => network.id)).toEqual(['tron']);
    });

    it('share a ticker, because a person calls both of them USDT', () => {
      expect(erc20?.ticker).toBe('USDT');
      expect(trc20?.ticker).toBe('USDT');
    });

    it('share one market, because a price is the same token on either chain', () => {
      expect(quoteSymbolForAsset('USDT_ERC20')).toBe('USDT');
      expect(quoteSymbolForAsset('USDT_TRC20')).toBe('USDT');
    });

    it('each need a gas token they do not hold', () => {
      // Tether pays no chain's fees. Moving it on Ethereum costs ETH and on Tron
      // costs TRX, which is the rule that stops a withdrawal being queued and then
      // discovered unsendable by an operator.
      expect(requiresGasToken(erc20!, erc20!.networks[0]!)).toBe(true);
      expect(requiresGasToken(trc20!, trc20!.networks[0]!)).toBe(true);
    });

    it('no longer answer to the bare ticker', () => {
      // Ambiguous rather than unknown, which is why the error says so — anything
      // still sending `USDT` is a caller that has not been updated.
      expect(LEDGER_ASSETS.some((asset) => asset.code === 'USDT')).toBe(false);
      expect(isRetiredAssetCode('USDT')).toBe(true);
      expect(isRetiredAssetCode('usdt')).toBe(true);
      expect(isRetiredAssetCode('USDT_ERC20')).toBe(false);
    });
  });

  it('quotes an asset under its own code unless it says otherwise', () => {
    expect(quoteSymbolForAsset('BTC')).toBe('BTC');
    // An unlisted code is handed back rather than substituted, so a caller gets
    // "no such market" instead of somebody else's price.
    expect(quoteSymbolForAsset('nope')).toBe('NOPE');
  });
});
