# ADR-0002: Money is an integer count of minor units

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

The design carried every monetary value as a JavaScript `number`: prices,
market caps, fees, conversion results. The buy/sell widget computed its fee as
`parsed * 0.001` and its received quantity as `netValue / quote.live`.

IEEE-754 doubles cannot represent most decimal fractions. `0.1 + 0.2` evaluates
to `0.30000000000000004`; `2.41 * 100` to `240.99999999999997`. On a widget
whose entire persuasive value is that the numbers look exact, this surfaces as
fees rendered `$1.0000000000000002`.

Doubles also stop counting integers exactly above 2^53. A crypto supply carried
at eight decimal places exceeds that by three orders of magnitude.

## Decision

Monetary amounts are a `Money` value object: an integer count of minor units in
a `bigint`, a currency code, and an **explicit scale**.

Rates are `BasisPoints`: an integer count of hundredths of a percent.

Scale travels with the value rather than being derived from the currency,
because a USD price and a USD fee need different precision. Two decimals is
right for BTC at $79,210.82 and wrong for a stablecoin, where the entire story
is in the fourth decimal — and catastrophic for an asset quoted at $0.00002341,
which rounds to zero.

Arithmetic between different currencies or different scales throws. That is a
programming error, not a runtime condition: there is no sensible value to
return, and returning one would hide the bug.

## Consequences

### Where the discipline shows up

- **DTOs carry exact decimal strings**, not numbers: `price: "79210.82"`. A DTO
  with `price: number` would throw away the precision the domain preserved,
  right at the boundary where it matters most.
- **Postgres columns are `numeric`**, never `double precision`. Drizzle returns
  `numeric` as a string, so a value reaches `Money.fromDecimalString` without
  ever having been a float.
- **Sorting compares digit by digit** (`compareDecimalStrings`). Sorting market
  caps by `Number(a) - Number(b)` is wrong at the top of the table, where
  adjacent values are indistinguishable as doubles and the order becomes
  arbitrary.
- **Conversion is a domain service.** `estimateConversion` does the fee and the
  division in integer arithmetic and returns `Money`, so the widget formats an
  exact result rather than rounding a wrong one.

### The two sanctioned lossy boundaries

Both are named so every call site admits what it is doing:

- `Money.toNumberForDisplay()` — `Intl.NumberFormat` takes a number, so the
  boundary must exist. It lives in the formatters, on values about to become
  pixels.
- `Money.fromUnsafeNumber()` — the feed adapter parses JSON, and JSON numbers
  are already floats by the time we see them. Nothing can recover the digits
  parsing dropped; what this does is stop the damage spreading, by converting to
  an exact integer at the edge.

### Cost

More ceremony than `number`. Every amount is constructed explicitly, and the
compiler rejects mixing scales. The 27 tests in
`shared/kernel/__tests__/money.test.ts` exist to make that ceremony
trustworthy — several of them assert on the exact float failures this ADR
describes.
