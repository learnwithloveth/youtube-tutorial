# Architecture

Novex is a **modular monolith**: one deployable Next.js application, internally
divided into bounded contexts that communicate only through published contracts.
Inside each context the layering follows **clean architecture** — dependencies
point inward, toward the domain, and never back out.

This document is the map. It explains where each kind of code lives and, more
usefully, *why the boundary is where it is*.

---

## 1. The tree

```
src/
├── app/                   ══ PRESENTATION ══ Next.js App Router
│   ├── layout.tsx             Root document, fonts, theme
│   ├── error.tsx              Route error boundary
│   ├── global-error.tsx       Boundary for a failure in the root layout
│   ├── not-found.tsx          404
│   ├── sitemap.ts robots.ts   Generated from the same sources as the routes
│   ├── _lib/ _providers/      Private, non-routable app-level helpers
│   ├── (marketing)/           Public, cacheable, SEO-critical  → 22 routes
│   │   ├── _components/       Chrome and sections for this group
│   │   ├── _lib/              Site navigation (information architecture)
│   │   └── legal/             Nested group with its own document chrome
│   ├── (auth)/                Unauthenticated identity flows → 5 routes
│   └── api/                   Route handlers: machines, not browsers
│
├── modules/               ══ THE BUSINESS ══ one folder per bounded context
│   ├── market-data/
│   │   ├── index.ts           PUBLIC BARREL — safe anywhere
│   │   ├── server.ts          PUBLIC BARREL — server-only composition
│   │   ├── module.ts          Composition root: ports → adapters
│   │   ├── domain/            Pure. Imports nothing but the kernel.
│   │   ├── application/       Ports, use cases, queries, DTOs
│   │   └── infrastructure/    Drizzle repositories, HTTP feed, catalogue
│   ├── identity/              Users, sessions, email verification
│   │   ├── domain/            User, Session, VerificationToken, policy
│   │   ├── application/       Ports, use cases, error catalogue, mail copy
│   │   └── infrastructure/    scrypt, AES-GCM sealing, Drizzle, SMTP
│   ├── presence/              Who is on the site, where, and on which page
│   │   ├── domain/            Presence, LocationFix, Coordinates, path rules
│   │   ├── application/       Ports, heartbeat, retention sweep, live query
│   │   └── infrastructure/    Drizzle, CDN geo headers, IP lookup, UA parsing
│   ├── activity/              Append-only history: what an account did, kept
│   │   ├── domain/            ActivityEvent, retention windows per kind
│   │   ├── application/       Ports, append, sweep, per-account timeline
│   │   └── infrastructure/    Drizzle, append-only with aggregate reads
│   ├── ledger/                Balances, transfers, withdrawals and approvals
│   │   ├── domain/            Account, Transfer (balanced), Withdrawal, limits
│   │   ├── application/       Ports, request/decide/deposit, wallet query
│   │   └── infrastructure/    Drizzle, asset catalogue with storage scales
│   ├── wallet-link/           External wallets an account has proved it controls
│   │   ├── domain/            EvmAddress, LinkChallenge (EIP-4361), LinkedWallet
│   │   ├── application/       Ports, issue/redeem/watch, board query
│   │   └── infrastructure/    Drizzle, secp256k1 recovery and EIP-55 checksums
│   └── content/               Supporting context: editorial copy
│
├── platform/              ══ SHARED INFRASTRUCTURE ══
│   ├── db/                    Drizzle client. No tables — see §13
│   ├── env/                   Zod-validated configuration
│   └── observability/         Structured logging
│
├── server/                Facades the pages actually call
│   ├── market-data.ts         Read paths for quotes
│   ├── presence.ts            Live activity; joins presence to identity
│   ├── activity.ts            Append and read the account history trail
│   ├── users.ts               The console account view; joins all three
│   ├── ledger.ts              Wallet and approvals; wires prices to the ledger
│   ├── request-context.ts     Location and device for the current request
│   └── auth.ts                The one place a session is interpreted
│
└── shared/
    ├── kernel/            Money, BasisPoints, Result, Clock
    ├── lib/               cn, formatters, browser hooks
    └── ui/                The design system: primitives, motion, visuals
```

---

## 2. The dependency rule

Imports point inward. Concretely:

| Layer | May import | Must never import |
| --- | --- | --- |
| `domain` | `shared/kernel` only | React, Next, the database, the network, another module |
| `application` | its own `domain`, `shared/kernel` | its own `infrastructure`, another module's internals |
| `infrastructure` | its own `domain` + `application`, `platform` | another module's internals |
| `app` | module **barrels**, `shared`, `server` | any path *inside* a module |
| `platform` | nothing of ours | any module |
| `shared/kernel` | nothing of ours | everything else |

**These are enforced, not documented.** `pnpm lint:boundaries` runs
dependency-cruiser over the tree and fails on a violation. The rules live in
[`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs), each with a comment
explaining what it protects.

The payoff is concrete: the application layer's tests construct fake
repositories and a fixed clock, and exercise the real rules with no database and
no network. That is only possible because the ports point the way they do.

---

## 3. Why `market-data` is split the way it is

The central modelling decision is the split between **`Instrument`** and
**`Ticker`**, and it follows the source of truth:

- An **instrument** is a listed asset *as we describe it* — name, category,
  glyph, brand hue, blurb, quoting precision. Editorial. Changes when a writer
  changes it. Identical whether or not any feed is reachable.
- A **ticker** is *one observation of a market at one instant* — price, 24h and
  7d move, market cap, volume, and the time it was observed. We do not choose
  it, it changes constantly, and it is unavailable when the feed is down.

Keeping them in one object would mean either refetching editorial copy on every
price tick, or being unable to render an asset at all when the feed fails.
Separated, a market page still renders — name, sector, description — with the
price area honestly empty.

### The rule that falls out of it

`Market.quoteStateAt(clock)` returns a three-way union: `live`, `stale` (with an
age), or `unavailable`. A caller cannot render a price without deciding what to
do in all three cases, because the type will not narrow until they have.

**A price is shown as current only when it was actually observed recently.**
Otherwise the page says so, or shows nothing. It never fills the gap.

---

## 4. Money

`Money` carries an integer count of minor units in a `bigint`, plus a currency
and an explicit **scale**.

Floats cannot represent most decimal fractions — `0.1 + 0.2` is
`0.30000000000000004` — and no rounding discipline fixes a representation
error. On a page that quotes prices this produces visibly wrong figures; in a
ledger it produces money that does not exist.

Scale is explicit rather than derived from the currency because a USD *price*
and a USD *fee* need different precision: two decimals is right for BTC and
wrong for a stablecoin, where the whole story is in the fourth.

Three consequences run through the codebase:

1. **Amounts cross layers as exact decimal strings**, not numbers. The DTOs
   carry `price: "79210.82"`. A DTO with `price: number` would discard the
   precision the domain preserved.
2. **`numeric` columns, never `double precision`.** Drizzle returns `numeric` as
   a string, so a value reaches `Money` without ever passing through a float.
3. **One documented lossy boundary**, `Money.toNumberForDisplay()`, used only in
   formatters at the point of render. `Money.fromUnsafeNumber` is named to make
   its one legitimate caller — the feed adapter, parsing JSON that was already
   floats — admit what it is doing.

Rates use `BasisPoints`, an integer count of hundredths of a percent, for the
same reason: `2.41 * 100` is `240.99999999999997`.

---

## 5. The server/client boundary

Server Components are the default. A component becomes a Client Component only
when it needs state, an event handler, or a browser API — and then it is made a
*leaf*, so its cost does not spread.

Two patterns do most of the work:

**Children as a seam.** `Reveal` animates and must be a Client Component, but it
receives already-rendered server output through `children`. The animated
section's markup ships as HTML; only the wrapper hydrates.

**Island extraction.** The fees page is a long static document with one
calculator. The calculator is a Client Component; the page is not. Marking the
whole page `'use client'` would have shipped the fee table, the FAQ and the
comparison grid to the browser as JavaScript for no reason.

The same reasoning produced `Card` (server) and `InteractiveCard` (client) as
separate components, rather than one component with an `interactive` prop that
would have forced every card on all 29 routes into the client bundle.

### Barrels are split by environment

`@/modules/market-data` is safe anywhere: types, DTOs, pure queries, the
conversion service. `@/modules/market-data/server` holds the composition root,
which reaches the Drizzle adapters and the HTTP feed and is marked
`server-only`.

This is not stylistic. A barrel is imported *whole*: when the market table (a
Client Component) imported a single type from a combined barrel, the database
client came with it and the build failed — correctly. The split makes the
boundary a compile error rather than a review comment.

---

## 6. Rendering and caching

| Kind of page | Strategy | Why |
| --- | --- | --- |
| Marketing pages with no market data | Static | Content changes only when the code does |
| Pages showing prices | ISR, `revalidate = 60` | Matches the refresh cadence; served from cache, regenerated in the background |
| Asset and blog detail | `generateStaticParams` | Every listed asset and post is known at build time |
| `/api/*` | Dynamic | Writes and liveness checks are never cached |

`revalidate` must be a **literal** in each page — Next reads segment config
statically, so an imported constant cannot be resolved. The rationale for the
number lives in [`src/app/_lib/revalidate.ts`](../src/app/_lib/revalidate.ts).

Sixty seconds is chosen against the freshness window, not for looks: the domain
labels a quote stale after five minutes, and the regeneration interval has to
sit well inside that, or a cached page could keep asserting "live" for longer
than the quote on it is entitled to.

---

## 7. Reads and writes

**Server Components read. Route handlers write.**

Pages call `src/server/market-data.ts`, a thin facade that binds module queries
to the composed module and wraps them in `React.cache` so repeated calls within
one render become one database round trip.

The only writer of market data is `refreshTickers`, invoked by
`POST /api/market-data/refresh` on a schedule (and by `pnpm db:refresh`
locally). Fetching from the upstream during a page render would put a third
party on every visitor's critical path and make page latency depend on someone
else's uptime.

### Failure is a value, not an exception

Use cases return `Result<T, DomainError>`. A feed failure returns
`feed-unavailable`; the route answers 503 and the scheduler retries, while the
site keeps serving the last good observations — correctly labelled stale.

The ticker read path goes further and **degrades rather than propagating**: a
database error is logged and returns an empty map, so every market resolves to
`unavailable` and the site renders its full catalogue with empty price cells.
Letting that error escape would take down the home page, every asset page and
the build over a dependency that supplies one column of one table.

---

## 8. Testing

| Project | Covers | Needs |
| --- | --- | --- |
| `pnpm test` (unit) | Domain and application layers | Nothing — no I/O by construction |
| `pnpm test:integration` | Adapters against real infrastructure | `DATABASE_URL` |

The unit suite is fast enough to run on every save, and a failure always means a
rule was broken rather than that a service was down. Integration tests are
excluded from the default run so that a missing `DATABASE_URL` never looks like
a broken domain.

`pnpm verify` runs typecheck, lint, boundary rules and unit tests together.

---

## 9. What is generated, and what is observed

The site quotes real market data. Two things on it are illustrations, and both
are isolated and labelled so they cannot be mistaken for observations:

| Thing | Where | Why it is acceptable |
| --- | --- | --- |
| Uptime bars on `/status` | `app/(marketing)/status/_lib/uptime-bars.ts` | There is no uptime telemetry behind this site. Deterministic, kept in the page's private folder, and never near a price. |
| Throughput and yield curves | Constants beside the components that draw them | They illustrate capacity and compounding, not a market. Fixed arrays, not generated. |

The original design drove its prices from a seeded random walk in
`features/markets/simulation.ts`. That file is gone. Invented prices on a page
that looks like an exchange are a misrepresentation, and the whole `market-data`
module is built so that the absence of a price renders as an absence.

---

## 10. Identity

The `identity` module owns credentials and access state, and nothing else. A
user's balances belong to a ledger context and their KYC tier to a compliance
one; letting those fields in here is how a forty-field object forms that every
team edits and nobody understands.

### Sessions are rows, not tokens

The cookie carries an AES-256-GCM sealed session id. The server holds the
authority, which is what makes "log out all devices" take effect immediately
rather than whenever a JWT would have expired. Authenticated encryption rather
than a signature so tampering fails closed instead of decoding to some other id.

`src/server/auth.ts` is the only place a session is interpreted. Pages call
`getCurrentUser()` or `requireUser()`; nothing else reads the cookie. That keeps
revocation, idle timeout and step-up freshness in one auditable place instead of
re-implemented slightly differently at every call site.

### Verification tokens

Single-use, time-limited, stored as a SHA-256 digest, and scoped to the purpose
they were issued for. Confirming an address gets 24 hours; a password reset gets
15 minutes, because a reset link hands over the account and an inbox is not a
vault.

Two details carry most of the security, and both are easy to get wrong:

- **The digest is a fast hash, not scrypt.** The token is 32 bytes of CSPRNG
  output, so guessing is not a threat model and a slow KDF would only add ~100ms
  to every link click. The digest exists so a *database leak* yields nothing
  usable, which one SHA-256 achieves completely.
- **Redemption checks the purpose.** Without it, an email-confirmation token —
  long-lived, low-value, scanned by every mail filter in the chain — could be
  replayed against password reset.

Confirming an address never issues a session. A password reset revokes every
existing one.

### What is deliberately absent

There is no rate limiting yet. Sign-in locks an account for 15 minutes after five
failures, which bounds guessing against one account, but nothing bounds attempts
per IP across accounts. `IdentityErrors.rateLimited` exists and has no producer.
See [ADR-0004](adr/0004-identity-sessions-and-email-verification.md).

### Mail

`EmailSender` is a port; the SMTP adapter is the only implementation. Mailpit in
development and a provider in production speak the same protocol, so the code
path is identical and only configuration differs. With no `SMTP_HOST` set,
messages are written to the log instead — a fresh clone still completes a signup
and prints the link.

Message *content* lives in the application layer, not the adapter, because the
wording of a security email tells someone whether to be alarmed and belongs next
to the rule that sends it.

---

## 11. Presence

The `presence` context answers one question: **who is on the site right now, where
in the world are they, and which page are they on.** It exists to feed the live
board in the operations console.

### The aggregate is a tab, not a user

"Which page is this person on" only has an answer per browsing context. Someone
with the markets page open in one window and the trade screen in another is on
both, and a record keyed by user id would have to pick one and be wrong. So the
identity of a presence row is a UUID the client mints per tab and forgets when the
tab closes; the user id is an attribute attached when there happens to be a
session.

Anonymous visitors are first-class. Most traffic to a public exchange is signed
out, and a board that counted only logged-in users would answer a different
question from the one an operator is asking.

### A location is an observation, not an attribute

The rule `Market.quoteStateAt` enforces for prices, `Presence.locationStateAt`
enforces for locations, for the same reason. Every fix carries three things it
cannot be constructed without — **source**, **precision** and **observedAt** — and
the absence of a location is `null`, which renders as `unavailable`. There is no
default country and no "unknown" placeholder row. We never fill the gap.

Two independent sources feed it, and this is what makes the feature work
regardless of what the visitor grants:

| Source | Needs permission | Precision | Trust |
| --- | --- | --- | --- |
| `edge` | No | City, or only a country | First-hand: the CDN derived it from the connection |
| `network` | No | City, approximately | Second-hand, and wrong behind a VPN |
| `device` | **Yes** | Exact | Precise, and **self-reported** — it arrives in a body the client composes |

The address lookup is **on by default** and needs no configuration: it walks a
chain of free services (`ipwho.is`, `freeipapi.com`, `ipapi.co`) until one
answers. Three reasons it is a chain and not a service:

1. **A free tier is a quota, and a quota is an outage scheduled in advance.** One
   provider means the board stops resolving anyone at whatever hour the day's
   allowance runs out — silently, since a refusal looks exactly like an address
   nobody knows.
2. **They disagree.** An address one service has never seen is often known to
   another, so the next one in line is coverage as well as failover.
3. **A refusal is not an HTTP error.** `ipapi.co` answers `200` with
   `{ error: true, reason: "RateLimited" }`, so a status check alone reads a
   rate-limit as a successful lookup of nowhere.

Each provider owns its own response shape in `providers.ts`, and each is pinned by
a test against a payload captured from the live service. That is not ceremony: two
of the three parsers were wrong when written from documentation — `freeipapi`
returns `timeZones` as an array of the *country's* zones rather than a `timeZone`
string, and `ipwho.is` nests the zone under `timezone.id`. Both produced a
silently null timezone and nothing failed anywhere.

`LocationFix.supersedes` decides which survives, and the order of its tests is the
whole design: a stale incumbent always loses, then **precision**, then source, then
recency. Ranking source above precision is the tempting mistake — it reads as
"trust the CDN over a lookup service" and produces, on a Cloudflare tier that
reports only a country, a board where nobody is ever in a city.

The one rule that makes precise location usable at all lives in `Presence.locate`:
an address fix arrives on *every* heartbeat and a device fix does not, so
last-writer-wins would discard a consented GPS position twenty seconds after it
arrived.

### Local development resolves too

A request from `localhost` carries no client address at all — Next sets no
forwarding headers — so there is nothing to look up and every row would read "not
resolved" until the app was deployed. Outside production the lookup therefore asks
where *this machine* connects from, which on a developer's laptop is genuinely
where the visitor is, because they are the same person on the same network.

It is refused in production, where they are not the same person: a loopback
request there is a health check or a sidecar, and resolving it would pin every one
of them to the datacentre and label it a visitor's location.

### Permission is asked for once, deliberately

`PresenceReporter` never raises a geolocation prompt. It calls `watchPosition` only
after the Permissions API confirms the grant already exists. A prompt fired on page
load is denied almost every time, and a denial is permanent — so the ask lives
behind a control on the settings page, next to a sentence explaining it. Refusing
costs nothing: the connection-derived location is already there.

### What is deliberately not collected

| Not stored | Stored instead | Why |
| --- | --- | --- |
| The IP address | An HMAC digest, truncated | The IPv4 space is enumerable in minutes, so a plain hash of an address *is* the address |
| The user-agent string | `desktop · Safari` | A modern UA is a fingerprint; the console needs two words |
| The query string | The route only | `/reset-password?token=…` would put account-takeover material on an operator's screen |
| Any page history | One row, overwritten | Presence is a question about *now*; the cheapest way not to leak a browsing history is not to keep one |

Rows are swept six hours after a visitor goes quiet. That is a retention limit on
personal data, not a cache policy, which is why the sweep is triggered
opportunistically from the heartbeat rather than left to a cron entry someone has
to remember to configure.

### The console reads across two modules

Presence holds a `UserId` and never reads `id_users`; identity owns those rows and
has never heard of presence. Neither can produce "who is on the pricing page" with
an email attached — so the join happens in `src/server/presence.ts`, above both,
using `describeUsers`. That costs a second query where a SQL join would have done,
and buys a module that can be lifted into its own service without a schema change
in two places.

### Why this is the module most likely to move

Presence is the only write path here that scales with *traffic* rather than with
activity: every open tab writes a row every twenty seconds whether or not anyone
does anything. A relational table is the right first implementation — no new
infrastructure, survives a deploy — and the wrong shape at volume, where this
belongs in a store with native key expiry. `PresenceRepository` is the seam that
makes that swap an adapter and a line in `module.ts`.

---

## 12. Activity

The `activity` context is the account history: what someone did, kept. It feeds
the console's user pages.

### Why it is not part of `presence`

They are opposite shapes. Presence is one row per open tab, overwritten in place,
swept within hours — it answers "who is here *now*" and is explicitly not history.
Activity is append-only, never updated, and retained long enough to be worth
consulting.

One table would force one retention policy onto both, and the choice is
unresolvable: a live board needs rows to vanish the moment they stop being true,
and an audit trail is worthless if it does the same.

### An event is immutable, which changes the location model

`presence` carries a `LocationFix` that goes stale, because "where are they" has an
answer that expires. An event's location does not — where someone signed in from on
Tuesday is still where they signed in from on Tuesday. So `EventLocation` is a
plain snapshot with no freshness rules. Same data, genuinely different concept,
which is why it is a separate type rather than a shared one.

The aggregate has **no setters**. A correction to an audit trail is a new event,
never a rewrite of an old one, and the absence of a mutator is the cheapest way to
guarantee that.

### Page views are written on departure

The event records the page someone *left*, stamped with when they arrived and how
long they stayed. Writing on arrival would leave every row with a null duration
until something went back and filled it in — and a table that gets updated after
the fact is one whose rows can be changed, which is the one property it must not
have.

The consequence: the page someone is on right now has no event yet. That is
correct — it is not history until it is over. `presence` answers where they are
this second, and the console shows both.

`presence` is the only thing that knows a navigation happened and the only thing
that knows the dwell time, so `recordPresence` *reports* both and takes no view on
what should be done with them. The facade decides whether that becomes durable.
Presence does not know the activity module exists and could not write to it.

### Two retention windows

| Kind | Kept | Why |
| --- | --- | --- |
| Sign-ins, resets, verifications | 365 days | A sign-in from an unfamiliar country matters when a dispute surfaces months later |
| Page views | 30 days | Stops being useful almost immediately, and is the more intrusive of the two to hold — it is a browsing history |

Both are swept, and the sweep rides the presence heartbeat rather than a cron
entry, because an un-run sweep is personal data kept past its justification.

### The trail is best-effort, and that is a stated trade

`recordActivity` never fails its caller. A sign-in that succeeded must not become
an error page because an audit insert timed out. So the facade catches everything,
logs, and returns — which means **this trail can have holes**.

It is an operations aid, not a ledger, and nothing in the system makes a decision
by reading it. If it ever needs to be evidential rather than informational, it has
to move into the same transaction as the event it records. That is a different and
much more expensive design, and pretending otherwise would be the dangerous version
of this feature.

### Parallel reads use `allSettled`, not `all`

Not a style preference. The console's account page issues five independent reads
together, and the realistic failure is an unreachable database — in which case all
five reject. `Promise.all` surfaces the first and leaves the other four
unattached, and Node terminates the process on an unhandled rejection by default.
The obvious version turns a degraded panel into a crashed server. `allSettled`
attaches a handler to every one, and degrades better besides: a failure in the
route ranking costs the route ranking rather than the page.

### What is deliberately absent

Failed sign-ins are not recorded. Attributing one requires the identity module to
reveal whether the account exists, which is exactly the enumeration oracle
`requestPasswordReset` is written to avoid. The signal an operator actually needs —
`failedAttempts` and `lockedUntil` — already lives on the user record. Recording
failures properly means an audit port inside identity that the composition root
wires up; that is a deliberate follow-up, not an oversight.

---

## 13. One Postgres schema per bounded context

Each module's tables live in a Postgres schema named after the module:

| Schema | Tables | Module |
| --- | --- | --- |
| `identity` | `users`, `sessions`, `verification_tokens` | identity |
| `presence` | `visitors` | presence |
| `activity` | `events` | activity |
| `market_data` | `tickers` | market-data |
| `wallet_link` | `linked_wallets`, `link_challenges`, `wallet_evidence`, `settings` | wallet-link |

`public` holds nothing, and `platform/db` holds no table definitions at all — only
the client.

### What this replaced, and why it was wrong

Tables were once `public.id_users`, `public.pr_presence`, `public.ac_events`: a
namespace simulated in a string prefix. Two problems, one cosmetic and one
structural.

The cosmetic one first, because it is the one a reader trips over: `id_` is a bad
prefix specifically because `id` means *identifier* everywhere else in a database.
`id_users` reads as "the id of users", not "the identity module's users table".

The structural problem is that Postgres already has namespaces, and a prefix
cannot do what one does:

1. **Isolation the database enforces.** `REVOKE ALL ON SCHEMA identity FROM
   reporting` is a grant. "Do not read tables starting with `id_`" is a code review
   comment, and the boundary this architecture is built around deserves better than
   a convention.
2. **Extraction as a dump.** `pg_dump --schema=identity` is the whole module — its
   tables, indexes, constraints, and any table added to it later. The seam that
   lets a context become its own service, made operational rather than aspirational.
3. **Names that read without a decoder.** `identity.users`, `presence.visitors`,
   `activity.events`.

The table names got shorter as a result, because the schema now carries what the
prefix was carrying. `presence.visitors` rather than `presence.presence`: a row is
one browsing context keyed by a `VisitorId`, and repeating the module name would
have said nothing.

### `tickers` moved out of `platform`

It lived in `platform/db/schema.ts` under the heading "tables shared across
contexts". It was never shared — written by one use case in market-data, read by
one repository in market-data, referenced nowhere else.

Leaving it there inverted the dependency the boundary rules exist to protect.
`platform` is the shared foundation, and `platform-is-a-leaf` forbids it depending
on any module. Holding one module's table never tripped the linter, because a table
definition imports nothing, but it made the foundation the owner of a business
context's storage — with the extraction seam for market-data running through a file
three other modules import.

### The client registers no schema

`drizzle(client, { schema })` exists to power the relational query API
(`db.query.users.findMany`). Registering one would mean `platform/db/client.ts`
enumerating every module's tables, which is the same inversion in a different file.

Each module imports its own tables and uses `db.select().from(table)`, which needs
no registration. The cost is that `db.query.*` is unavailable; the gain is that
`platform` knows nothing about any bounded context.

### The migration is hand-written, and had to be

`0005_schema_per_context.sql` is the only migration in this repository that was not
generated. A generated diff sees `public.id_users` disappear and `identity.users`
appear and expresses that as `DROP TABLE` + `CREATE TABLE` — correct as a diff,
catastrophic as a migration, since the entire point was that every row survives.

`ALTER TABLE … SET SCHEMA` moves a table with its indexes, constraints, defaults
and foreign keys intact: Postgres updates catalogue entries and copies nothing. The
index and constraint renames that follow are cosmetic in the database and
load-bearing in the codebase — Drizzle tracks those names in its snapshot, so
leaving `id_users_email_uq` in place would make the next generated migration drop
and recreate every index.

The snapshot (`meta/0005_snapshot.json`) was written to match, and the check that it
is right is that `drizzle-kit generate` reports **"No schema changes"** against it.
Anything else means the snapshot and the schema files disagree, and the next
migration would be generated from a false baseline.

---

## 14. Ledger

The `ledger` context owns balances and the money that moves between them. It backs
the customer wallet and the operator approvals queue, which are two views of the
same state.

### Double-entry, enforced in the type

`Transfer.create` refuses a set of entries that does not sum to zero **per asset**.
That check is in the domain rather than in a database constraint or a review
convention because it is the property that makes a ledger a ledger: a system that
can write an unbalanced transfer can create money, and it will eventually do so
through a branch nobody tested. Making the balanced set the only constructible
thing means the unbalanced case has no representation to reach.

Per asset, not overall. Summing across assets would let `-1 BTC, +1 USD` pass as
balanced, which is how a ledger loses a bitcoin and reports that everything adds up.

Four owners, so both sides of every movement are accounts:

| Owner | What its balance means |
| --- | --- |
| `user` | What we owe one customer in one asset |
| `custody` | The contra account. Negative by construction; its magnitude is the total customer liability |
| `fees` | Fee revenue, credited when a withdrawal is approved |
| `payable` | Approved withdrawals that have not yet left the platform |

### The balance is stored, and the entries are the truth

Deriving a balance by summing entries is correct and unusable — it turns the
most-read value on the platform into a scan of an account's whole history. So the
balance is stored and updated *in the same transaction as the entries that justify
it*, and remains reconcilable by summing. `version` makes the update optimistic:
two withdrawals that both read version 7 produce two conditional writes at version
7, and only one succeeds.

The guard is checked **inside** the transaction. A conditional write that matches
zero rows is not a database error, so nothing rolls back by itself; throwing from
within `db.transaction()` is what takes the transfer and its entries back out along
with it. A check made after commit would leave the losing transfer on the books
with one side's balance unmoved.

It stays optimistic rather than `SELECT ... FOR UPDATE` because the new balance was
computed from a read the caller made earlier. What needs checking is whether that
read is still current, and a conditional write checks exactly that without holding
a lock while the caller works.

### A withdrawal is a request, not a command

It is the one action that is irreversible once complete and the first thing an
attacker performs. So it becomes a record a human decides on, and the funds are
**held** — reserved, not moved — until they do.

Holding rather than moving is what makes a rejection leave no trace. If the request
had debited the account, the rejection would need a compensating credit and the
customer's statement would show two movements for something that never happened.

| Step | What moves |
| --- | --- |
| Request | Nothing. `amount + fee` is held on the customer's account |
| Reject | Nothing. The hold is released, with a reason the customer is shown |
| Approve | `user -(amount+fee)`, `payable +amount`, `fees +fee`, hold consumed |

`payable` rather than "sent" is the honest end state: the money has left the
customer and has not left the platform. Marking it settled would assert a broadcast
that does not happen, because there is no chain client behind this application.

### There are no withdrawal limits

This deployment enforces no ceiling on withdrawals. There was one, and the shape
of it is worth recording because the code still reads as if something is missing
where it used to be:

- A **tier ladder** (`standard` through `institutional`) in `domain/limits.ts`,
  with a **daily cap in USD** per tier — on value rather than per asset, since
  someone at their bitcoin limit would simply withdraw ether instead.
- A **dual-control threshold** well below that cap, above which a second operator
  had to sign.
- A **per-asset minimum**, and a **refusal to proceed at all when the feed could
  not price the asset**, because an unpriced withdrawal could not be shown to be
  inside the USD cap.

All of it is gone. `domain/limits.ts` was replaced by `domain/approvals.ts`, which
holds a single constant: **one signature releases any amount.** `requestWithdrawal`
now refuses only what cannot be executed — an unlisted asset, an address that does
not match the chain, an amount that will not parse, a balance that is not there,
and a token whose network fee has no gas to pay it. The valuation is still
recorded when the feed has one, and `Withdrawal.valuedAtUsd` stays nullable,
because the statement, the receipt and the operator queue all read it; nothing
decides on it.

Two operator-side rules survive, because neither is a ceiling on the customer: an
operator still cannot approve their own withdrawal, and a decided withdrawal
cannot be decided again. One operator can *reject* anything — declining to move
money is always safe, and requiring a second signature to stop a payment would
mean an operator who spots fraud cannot act.

### Deposits are operator-recorded, and that is a real limitation

On a real exchange a deposit originates outside the application: a chain listener
sees a confirmed transaction, or a banking partner posts a settlement webhook. This
platform has neither. Three options existed and only one was honest:

1. Let the customer credit themselves from the UI — a button that prints money.
2. Simulate arrivals on a timer — the same, slower and harder to notice.
3. Require an operator to record what actually arrived, against a reference.

This is the third. The wallet's deposit tab shows an address and an instruction; it
credits nothing. When a chain listener exists it calls `recordDeposit` with the
transaction hash as the reference and nothing else in the ledger changes.

Deposit addresses come from configuration (`DEPOSIT_ADDRESS_*`) and are absent by
default — the panel warns rather than showing a plausible-looking string, because
an address that is not ours is a customer's funds sent nowhere.

### One asset per token *per chain*

`USDT` was one catalogue row with two networks, and that made it one balance. A
customer with 100 on Tron and 100 on Ethereum had "200 USDT" — a number that
cannot be withdrawn, cannot be sent anywhere and describes no position anybody
holds. They are different contracts on unconnected chains; moving value between
them needs a bridge and a counterparty.

The catalogue now lists `USDT_ERC20` and `USDT_TRC20` as separate assets, each
with one network. The alternative — adding a network column to `LedgerAccount` —
was rejected because it leaves the pooling *representable* and merely discouraged,
so every sum in the system has to remember to group by chain. Separate codes make
it unrepresentable: `Money` carries the code as its currency and `Transfer.create`
already refuses a set of entries that does not balance **per asset**, so a transfer
taking from one tether and giving to the other throws in the domain.

Three things fall out of it:

- **A code is no longer a market symbol.** Two tether assets are quoted by one
  tether instrument, because a price is a statement about the token's dollar value
  and not about which chain a unit sits on. `quoteSymbolOf` is the mapping, and a
  screen that still matched on the code would render both balances "not priced".
- **A code is no longer what a screen prints.** Nobody says "USDT_ERC20", so
  `ticker` (`USDT` for both) is display and `name` (`Tether (ERC-20)`) carries the
  chain. Where two rows would otherwise read alike — a filter chip, a withdrawal
  asset picker — the *name* is shown, because those are the controls where picking
  the wrong chain is silent.
- **The bare ticker is ambiguous, not unknown.** `USDT` is refused with a message
  naming both options rather than "unsupported", since anything still sending it is
  a caller that has not been updated rather than one asking for something absent.

Existing rows were split by `0029_split_usdt_by_chain.sql`. Withdrawals and deposit
claims record their network, so those are decidable and were rewritten. Accounts
and entries do not, so the migration **refuses** rather than guessing: a combined
balance cannot be divided into two chains from the row itself, and choosing one
would assign somebody's money to a chain it may not be on.

### The asset catalogue is code

An asset's **storage scale** is not data that changes; it is the definition of what
the integer in the balance column means, and changing it is a migration that
rewrites every row. A table would make the most dangerous value in the system
editable by anyone with database access and no migration.

It is also a different number from market-data's *quoting* precision, which changes
when a writer decides a price reads better with fewer decimals. Sharing one would
let an editorial decision divide everyone's balance by a hundred.

### What is deliberately absent

No trading, no staking, no transfers between customers, and no payout broadcast.
The approvals queue ends at `payable`; something has to pick those up and send
them, and that something needs a chain client and a hot-wallet policy that do not
exist here.

Risk scores and surveillance signals are also absent from the approvals screen. The
fixtures had them and they were `Math.random()`; a number presented as risk on the
one screen where somebody decides whether to release funds is worse than no number
at all.

---

## 15. Wallet link

The `wallet-link` context answers one question: **which external addresses has this
account proved it controls?** It backs the Wallets tab in customer settings and the
external-wallets panel on the console's account page, and nothing else.

### It is off until the account holder turns it on

Most people with an account here will never connect an external wallet, so the tab
opens on a single **Enable** button and the feature is absent until it is pressed.
A row in `wallet_link.settings` is the setting — no boolean, because a boolean has
three states in practice and every reader has to decide what "no row" means. Here
the absence *is* off.

The switch is a control rather than a curtain: `issueChallenge`, `linkWallet`,
`watchAddress` and `attachEvidence` each read it back before doing anything, so an
account with it off cannot have a wallet attached by a POST that skipped the UI. A
Server Action is a public endpoint, and hiding a panel protects nothing.

Turning it **off** is refused while any wallet is still attached. The tempting
implementation hides the panel and leaves the rows — and then "off" means "you
still have three wallets linked and cannot see them", while the addresses stay on
an operator's screen. Disconnecting is one click per wallet and always available,
so only the misleading shortcut is blocked.

### It holds no key material, and has nowhere to put any

Every column is either public — an address, a chain id — or ours: a row id, a
nonce, a timestamp. There is no private key, no mnemonic, no keystore, and no
encrypted blob that could be decrypted into one. That is a property of the design
rather than of the current requirements.

The reason is not squeamishness. A platform holding a recovery phrase can spend
every account that phrase unlocks, instantly and irreversibly, and encryption at
rest does not change it — the platform must be able to decrypt the phrase in order
to use it, so anything that compromises the platform compromises the funds. There
is no threat model in which storing one is acceptable, which is why the absence is
structural: no field, no parameter, no code path.

This matters for a second reason. "Connect your wallet manually with your seed
phrase" is the standard framing of a crypto phishing page. A real exchange's
wallet screen is the thing those pages imitate, so this one states plainly what it
will never ask for — in the page header, beside the manual-entry form, and in the
message the wallet itself displays. Somebody who reads it here is better prepared
to refuse the same request somewhere else.

### Two states, and the difference is the whole module

| State | Means | Proves |
| --- | --- | --- |
| `verified` | A signature over a challenge we issued recovered to this address | Control, at that moment |
| `watch-only` | Somebody typed the address in | Nothing |

Watching an address is a legitimate thing to want — a cold wallet nobody wishes to
connect — so it is supported, and marked. Conflating the two is what would make the
verified badge meaningless, so `LinkedWallet.proves()` is the single place that
answers whether a row is evidence of anything, and it accounts for revocation as
well as status.

### The challenge is EIP-4361, and every field in it is load-bearing

A wallet shows the signer the exact bytes it will sign. A bare nonce is
unreadable, and the habit that teaches — approve whatever the site asked for — is
the habit every signature-based theft depends on. So the message is Sign-In with
Ethereum: a structured statement naming the site, the account, the chain and an
expiry, which a person can tell apart from a transaction.

- **`domain` / `uri`** — a signature harvested by another site does not verify
  here, because the text the victim signed names that site. Both come from
  `APP_URL`, never from a request header, because a domain the caller supplies
  binds a signature to nothing.
- **`nonce`** — single use, enforced by a conditional `UPDATE … WHERE consumed_at
  IS NULL … RETURNING`. A read-then-write would let two submissions of the same
  signature both see an unspent challenge. Without this, a captured signature is a
  bearer credential forever.
- **`Expiration Time`** — five minutes, which bounds what an intercepted,
  unredeemed challenge is worth.

The message is **rebuilt from the stored row** at verification time, never taken
from the request. Hashing a message the client sent proves the client signed
something; it does not prove they signed what we issued.

The nonce is spent *before* the signature is checked, and a failure does not put it
back. That costs a legitimate customer one extra click and denies an attacker
repeated attempts against a live nonce.

### An attachment is not a second kind of proof

A watch-only row may carry one screenshot — the wallet app showing the address, a
hardware-wallet receipt. It exists for the case support actually meets: "this is
my old wallet and the device is gone", where there is no signature to be had and
an operator otherwise has nothing to look at.

It proves nothing, and the code is arranged so it cannot start to. Attaching a
file touches no status, `LinkedWallet` exposes no method that would, and
`acceptsEvidence` is false for a verified row — so the upload is not even offered
next to a signature. The tempting version of this feature, "upload a screenshot
and we will mark it verified", would make the badge mean two different things, and
the weaker meaning is the one that would spread. Both the customer's screen and
the operator's say which it is.

A signature supersedes it. When a watch-only row is upgraded, the pointer clears
and **the bytes are deleted** — the image was held only because there was no
proof, and holding it afterwards is personal data kept past its justification,
which is the same argument `presence` makes for sweeping location fixes.

The bytes go through `shared/kernel/image-bytes`, shared with deposit proofs and
chat attachments: the type is sniffed from the leading bytes, the filename and the
declared `Content-Type` are discarded, and SVG is refused outright. They are
served from `api/wallet-link/evidence/[evidenceId]` with the same header set as a
deposit proof — `nosniff`, a sandboxed CSP, `no-store` — because two upload paths
with different hardening is one hardened path and one way in. The owner is derived
from the key rather than accepted beside it, since everything in a URL is chosen
by the caller. The 1 MB cap is half the ledger's, because this table grows with
accounts rather than with claims.

### Why two small crypto libraries and not a wallet SDK

Verification is two primitives: keccak-256 and a secp256k1 public-key recovery.
`@noble/hashes` and `@noble/curves` are audited, dependency-free implementations of
exactly those — the same code the large Ethereum SDKs use underneath. `viem` or
`ethers` would add a provider stack, an ABI encoder and a transaction builder to a
server that broadcasts nothing, and each is surface on the path that decides
whether a signature is genuine. Nothing in the adapter can *produce* a signature,
only recover from one.

The domain layer imports neither, because it imports nothing. An EIP-55 checksum
needs keccak, so it lives behind the `WalletSignatures` port and the domain handles
only the syntactic shape of an address — which is also why storage is lowercase
(the unique index does case-insensitive comparison) and display is checksummed.

### What is deliberately absent

| Not supported | Why |
| --- | --- |
| EIP-1271 smart-contract wallets | Verifying one is an `eth_call` against the contract, and this module has no RPC. Those wallets fail verification and can still be watched. Accepting a signature we cannot check would make the badge a lie. |
| On-chain balances | Needs an RPC port and the `live \| stale \| unavailable` discipline §3 requires. A balance rendered from a stale read is the same mistake as a stale price. |
| Anything the link authorises | A proved address grants nothing — no withdrawal route, no limit, no tier. It is a recorded fact, and every consumer of it would need its own decision. |

The WalletConnect relay is optional and off by default: without
`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` the QR option is not rendered, rather than
rendered and unable to pair. Browser extensions (EIP-6963) and a wallet's own
in-app browser need no configuration at all. Its client is loaded by a dynamic
`import()` inside the click handler, so the largest dependency in the application
is fetched only by somebody who presses that button.
