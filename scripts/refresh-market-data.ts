/**
 * Populates the ticker table from the upstream feed.
 *
 * The same use case the scheduled endpoint runs, invoked from the command line
 * for local development and first-time seeding. It deliberately shares the
 * application code rather than re-implementing the fetch, so there is only one
 * definition of what a refresh does.
 *
 *   pnpm db:refresh
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main(): Promise<void> {
  // Imported after the environment is loaded: the module validates config at
  // first access, and a top-level import would run that too early.
  const { refreshTickers } = await import('../src/modules/market-data/index.js');
  const { createMarketDataModule } = await import('../src/modules/market-data/server.js');

  const marketData = createMarketDataModule();
  const result = await refreshTickers({
    instruments: marketData.instruments,
    tickers: marketData.tickers,
    feed: marketData.feed,
  });

  if (!result.ok) {
    console.error(`Refresh failed: ${result.error.kind}`);
    if ('reason' in result.error) console.error(`  ${result.error.reason}`);
    process.exit(1);
  }

  console.log(
    `Recorded ${result.value.quotesRecorded} of ${result.value.instrumentsRequested} instruments.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
