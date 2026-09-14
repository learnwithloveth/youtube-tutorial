import { systemClock } from '@/shared/kernel';
import {
  getCandles,
  getOrderBook,
  getRecentTrades,
  getStakingYields,
} from '@/modules/market-data';
import { createMarketDataModule } from '@/modules/market-data/server';

/* Throwaway probe: exercises the composed feeds exactly as a page would. */
async function main() {
  const context = createMarketDataModule(systemClock);
  const instruments = await context.instruments.listListed();
  const btc = instruments.find((i) => i.symbol.value === 'BTC')!.symbol;

  const book = await getOrderBook(context.book, context.clock, btc, 5);
  console.log('\n--- order book ---');
  console.log(
    book === null
      ? 'null'
      : {
          quote: book.quoteCurrency,
          bestBid: book.bestBid,
          bestAsk: book.bestAsk,
          spread: book.spread,
          topBid: book.bids[0],
          topAsk: book.asks[0],
        },
  );

  const candles = await getCandles(context.book, btc, '1h', 3);
  console.log('\n--- candles ---');
  console.log(candles === null ? 'null' : candles.slice(-2));

  const tape = await getRecentTrades(context.book, btc, 3);
  console.log('\n--- tape ---');
  console.log(tape === null ? 'null' : tape.slice(0, 2));

  const yields = await getStakingYields(
    context.yields,
    instruments.map((i) => i.symbol),
  );
  console.log('\n--- staking yields ---');
  for (const y of yields.slice(0, 8)) {
    console.log(
      `${y.symbol.padEnd(6)} ${y.apyPercent.toFixed(2).padStart(6)}%  ` +
        `${y.protocol} (${y.chain}) pool=${y.poolSymbol} tvl=$${(y.tvlUsd / 1e9).toFixed(2)}B`,
    );
  }
}

void main();
