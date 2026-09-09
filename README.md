# Novex

A crypto exchange marketing site, built on **Next.js 16 (App Router)** and
structured as a **modular monolith** with **clean architecture** and DDD.

The visual design — "Aurora Noir" — is the approved one, ported intact from a
Vite + React Router SPA. What changed underneath it: Server Components by
default, real market data with explicit freshness, exact decimal money, and
layer boundaries a machine checks.

> Novex is a fictional exchange built for design and demonstration. Nothing on
> the site is investment advice or an offer. Market prices are real; a few
> clearly-marked illustrations are not — see
> [`docs/architecture.md` §9](docs/architecture.md).

---

## Getting started

```bash
pnpm install
cp .env.example .env.local     # then fill in DATABASE_URL
docker compose up -d           # Postgres, Mailpit, Jaeger
pnpm db:migrate                # create the tables
pnpm db:refresh                # pull live quotes for all 24 listed assets
pnpm dev
```

| Service | Where |
| --- | --- |
| App | http://localhost:3000 |
| Mailpit — every outbound email lands here | http://localhost:8025 |
| Jaeger | http://localhost:16686 |
| Postgres | `postgres://novex:novex@localhost:5432/novex` |

The site runs without a database — every page renders its full catalogue with
empty price cells, which is what "we do not know the price" honestly looks like.
Signing up needs one.

Without `SMTP_HOST` set, verification emails are written to the server log
instead of sent, so a clone with no Docker can still complete a signup and read
the link from the terminal.

---

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm verify` | **typecheck + lint + boundaries + unit tests** |
| `pnpm test` | Unit tests (domain + application; no I/O) |
| `pnpm test:integration` | Adapter tests (needs `DATABASE_URL`) |
| `pnpm lint:boundaries` | Enforce the dependency rule |
| `pnpm db:generate` / `db:migrate` | Drizzle migrations |
| `pnpm db:refresh` | Pull quotes from the upstream feed |

Run `pnpm verify` before opening a pull request.

---

## Layout

```
src/app/        Presentation — App Router, 31 routes in 2 route groups
src/modules/    The business — identity, market-data, content
src/platform/   Shared infrastructure — db, env, logging
src/server/     Facades the pages call — market-data reads, auth sessions
src/shared/     kernel (Money, Result), lib, ui (the design system)
docs/           Architecture guide and ADRs
```

Imports point inward, and `pnpm lint:boundaries` fails the build when they do
not. Start with **[docs/architecture.md](docs/architecture.md)**.

---

## Trying the auth flow

1. Sign up at `/signup` — you are signed in immediately, with an unconfirmed
   address and a banner saying so.
2. Open http://localhost:8025 and click the confirmation link.
3. The banner disappears; `/forgot-password` sends a reset link the same way.

A reset revokes every existing session, so the old cookie stops working and the
old password stops being accepted. That is deliberate —
[ADR-0004](docs/adr/0004-identity-sessions-and-email-verification.md) explains why.

---

## The three decisions worth knowing before you edit anything

**1. Money is never a `number`.**
Amounts are integer minor units in a `bigint`, wrapped in `Money`, and cross
layers as exact decimal strings. `0.1 + 0.2` is not `0.3`, and no rounding
discipline fixes a representation error. → [ADR-0002](docs/adr/0002-money-as-integer-minor-units.md)

**2. A price is shown as current only if it was observed recently.**
`Market.quoteStateAt()` returns `live | stale | unavailable`, and the type will
not narrow until a caller has handled all three. Nothing invents a price to fill
a gap. → [ADR-0003](docs/adr/0003-real-market-data-never-simulated.md)

**3. A session is read in exactly one place.**
`src/server/auth.ts`. Pages call `getCurrentUser()` or `requireUser()`; nothing
else touches the cookie. Every auth mutation is a Server Action that re-derives
its own authority, because a page-level check does not protect an action.
→ [ADR-0004](docs/adr/0004-identity-sessions-and-email-verification.md)

**4. Server Components are the default.**
A component becomes a Client Component only for state, an event handler or a
browser API — and then it is made a leaf, so the cost does not spread. The
`Card` / `InteractiveCard` split and the extracted calculators exist for this
reason. → [docs/architecture.md §5](docs/architecture.md)

---

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | for auth | Postgres. Absent → no prices and no sign-up; the rest still renders. |
| `SESSION_SECRET` | in production | ≥32 chars; seals session cookies. Development falls back to a fixed value. |
| `APP_URL` | no | Origin used to build links in outbound mail |
| `SMTP_HOST` … `SMTP_FROM` | no | Mail transport. Absent → messages are logged, not sent. |
| `MARKET_DATA_REFRESH_TOKEN` | for refresh | Bearer token for `POST /api/market-data/refresh` |
| `MARKET_DATA_FEED_URL` | no | Defaults to the CoinGecko public API |
| `MARKET_DATA_FEED_API_KEY` | no | Raises the upstream rate limit |
| `NEXT_PUBLIC_SITE_URL` | no | Canonical origin for metadata and the sitemap |

Configuration is parsed once against a Zod schema at first access, so a missing
or malformed variable fails with a message naming it rather than surfacing as
`undefined` deep inside a query.

---

## Keeping prices fresh

`POST /api/market-data/refresh` with `Authorization: Bearer $MARKET_DATA_REFRESH_TOKEN`,
about once a minute. Priced pages regenerate on a 60-second interval, comfortably
inside the five-minute window after which the domain labels a quote stale.

A feed failure returns 503 and changes nothing: the last good observations keep
serving, correctly marked delayed.

---

## Not built yet

- **Rate limiting.** Sign-in locks an account for 15 minutes after five failed
  attempts, but nothing limits attempts per IP across accounts. Needs a shared
  counter store; the `redisdata` volume is reserved for it.
- **Two-factor and identity verification.** `/two-factor` and `/verify-identity`
  are the approved screens with no backend — they navigate without checking
  anything.
- **Passkeys and social sign-in.** Present because the design has them; not
  wired to WebAuthn or any provider.
- **Telemetry.** Jaeger is in the compose file and nothing exports to it yet.
