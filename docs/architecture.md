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
│   └── content/               Supporting context: editorial copy
│
├── platform/              ══ SHARED INFRASTRUCTURE ══
│   ├── db/                    Drizzle client + physical schema
│   ├── env/                   Zod-validated configuration
│   └── observability/         Structured logging
│
├── server/                Facades the pages actually call
│   ├── market-data.ts         Read paths for quotes
│   ├── presence.ts            Live activity; joins presence to identity
│   ├── activity.ts            Append and read the account history trail
│   ├── users.ts               The console account view; joins all three
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
