/**
 * Runs once when a server instance starts, before it serves anything.
 *
 * The only thing registered here is the market-data refresh loop, and only on the
 * Node runtime: the edge runtime has no timers worth the name and no database
 * client, and importing either there would fail the build rather than the request.
 *
 * The import is dynamic for the same reason. `instrumentation` is loaded in every
 * runtime; a static import of server-only code would be evaluated in all of them.
 *
 * ── A background loop must not be able to take the site down ──────────────────
 * Next answers *every* request with a 500 when this hook throws, and what is
 * started here is a background refresher: prices are read from the database, which
 * a stalled loop leaves stale rather than absent, and `Market.quoteStateAt` already
 * says so on the page. A deployment serving slightly old prices beats one serving
 * nothing, so a failure to start is logged and the server comes up anyway.
 *
 * That is not hypothetical. This hook reaches `server/alerts` → `server/push` →
 * `server/support`, which loads `firebase-admin`, whose `jose` dependency is
 * ESM-only — and `require()` of an ES module only works on Node 22.12 and later.
 * A deployment on an older Node failed here, and took the home page with it. The
 * floor is stated in `engines` in package.json; this stops it being fatal.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { startMarketRefreshLoop } = await import('./server/market-refresh-loop');
    startMarketRefreshLoop();
  } catch (error) {
    // `console` rather than the structured logger: that module is `server-only` and
    // this file is evaluated in every runtime, and a reporting line is not worth a
    // second way for startup to fail.
    console.error('[novex] the market refresh loop did not start', error);
  }
}
