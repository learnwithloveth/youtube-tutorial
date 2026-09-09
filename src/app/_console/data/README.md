# Console demo data

Everything in this folder and in the two consoles' `_data/` folders is
**generated fixture data**. There is no backend behind the dashboard or the
admin console: portfolio values, holdings, P&L, order books, transactions,
approval queues, KYC cases and audit entries are all invented.

## Why it lives here and not in `src/modules/`

`modules/` holds bounded contexts with real behaviour — `identity` authenticates
people against a database, `market-data` records observations from a price feed.
Putting fixtures beside them would invite a reader to mistake one for the other,
and would let a page import demo figures through the same barrel it imports real
ones.

The rule this follows is the one in
[ADR-0003](../../../docs/adr/0003-real-market-data-never-simulated.md): generated
figures stay isolated, clearly named, and never sit next to observed ones.

## What is real on these surfaces

The session. `requireUser` and `requireAdmin` check a real database row, the
signed-in address in the top bar is the account you actually registered, and
signing out revokes the session server-side.

Everything else on the screen is a fixture.

## Determinism

Series and queues are built from a seeded PRNG anchored to a fixed `NOW`
(`series.ts`), so the demo reads identically on every machine and in every
screenshot, and the server and client render the same values.

## The admin store resets on reload

`(admin)/_data/store.tsx` is a reducer in React state. Approving something
updates the rail badge, the command-centre counters and the audit log together
because they read one state — and a hard reload starts over, because nothing is
persisted. That is a property of there being no backend, not a bug.
