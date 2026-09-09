import { toInstrumentDto, type InstrumentDto } from '../dto';
import type { InstrumentRepository } from '../ports';

/**
 * Instruments without prices.
 *
 * A separate read path from `listMarkets` because several surfaces — the Earn
 * teaser, the asset picker, the sitemap — need the catalogue and never show a
 * quote. Asking for markets there would issue a ticker lookup whose result is
 * thrown away, and would tie a page that has no price on it to the freshness of
 * a feed.
 */

export interface ListInstrumentsOptions {
  /** Only assets that offer a staking yield, richest first. */
  readonly stakeableOnly?: boolean;
  readonly limit?: number;
}

export async function listInstruments(
  instruments: InstrumentRepository,
  options: ListInstrumentsOptions = {},
): Promise<InstrumentDto[]> {
  const all = await instruments.listListed();

  let selected = all;
  if (options.stakeableOnly) {
    selected = all
      .filter((instrument) => instrument.offersYield)
      .sort((a, b) => (b.stakingYieldBasisPoints ?? 0) - (a.stakingYieldBasisPoints ?? 0));
  }

  const limited = options.limit ? selected.slice(0, options.limit) : selected;
  return limited.map(toInstrumentDto);
}
