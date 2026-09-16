/**
 * Runs once when a server instance starts, before it serves anything.
 *
 * The only thing registered here is the market-data refresh loop, and only on the
 * Node runtime: the edge runtime has no timers worth the name and no database
 * client, and importing either there would fail the build rather than the request.
 *
 * The import is dynamic for the same reason. `instrumentation` is loaded in every
 * runtime; a static import of server-only code would be evaluated in all of them.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { startMarketRefreshLoop } = await import('./server/market-refresh-loop');
  startMarketRefreshLoop();
}
