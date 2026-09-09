# ADR-0003: Market data is observed, never simulated

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

The design shipped `features/markets/simulation.ts`: a seeded PRNG driving a
random walk, ticking every 1.5 seconds in the browser. Prices moved on the
market table, the ticker rail, the buy/sell widget and the phone mock.

Its own comment was candid about why — *"the marketing site must feel alive on
camera without shipping a socket connection or leaking a production API key"* —
and as a design artefact that is a reasonable trade. As a running site it is
not: invented prices on a page that looks like an exchange are a
misrepresentation, whatever the disclaimer says.

The 24-asset catalogue also carried hardcoded prices, market caps and volumes,
which are wrong the day after they are written.

## Decision

Prices come from a real market data provider, are stored with the time they were
observed, and are rendered with an explicit freshness state.

- **`Instrument`** holds what we author: name, category, glyph, hue, blurb,
  quoting precision, staking yield. No prices.
- **`Ticker`** holds one observation: price, 24h/7d move, market cap, volume,
  supply, the real 7-day series behind the sparkline, and `observedAt`.
- **`Market.quoteStateAt(clock)`** returns `live`, `stale` (with an age), or
  `unavailable`. A caller cannot render a price without handling all three,
  because the union will not narrow until they do.

Writes happen only in `refreshTickers`, called by
`POST /api/market-data/refresh` on a schedule. Never during a page render.

`simulation.ts` is deleted, not relocated.

## Consequences

- The sparklines are real. CoinGecko returns 168 hourly prices per asset;
  the adapter downsamples to 48 points and normalises to 0..1 so a $79,000 asset
  and a $0.22 one are both legible in the same cell. The *shape* is rescaled;
  the observations behind it are not invented.
- **No price is a first-class state.** An asset with no recent observation
  renders an em dash, the buy/sell widget stands down with an explanation, and
  the ticker rail omits the row. Nothing substitutes a zero or a remembered
  figure.
- A database failure on the read path is logged and returns no rows, so the site
  renders its full catalogue with empty price cells rather than failing. That is
  a truthful degradation: we genuinely do not know the price.
- Two claims in the approved copy had to change, because they became false:
  - `/markets` said prices came *"straight from the Novex matching engine … with
    no delayed feed and no aggregator in between."* They come from an
    aggregator.
  - The home page said *"streamed straight from the Novex order book."*

  Both now describe live market data stamped with an observation time.

## What is still an illustration

Two things on the site are drawn rather than measured, and both are isolated so
they cannot be confused with observations:

- **`/status` uptime bars** — there is no uptime telemetry behind this site.
  Deterministic, in the page's own private `_lib`, documented as illustrative.
- **Throughput and yield curves** — fixed arrays beside the components that draw
  them. They illustrate capacity and compounding, not a market.

Neither sits anywhere near the market-data module.
