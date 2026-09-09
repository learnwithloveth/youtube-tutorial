<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Novex — operating notes

Read **[docs/architecture.md](docs/architecture.md)** before writing code. It is
the map of the tree and the reasoning behind each boundary. This file is the
short version: the rules that are easy to break by accident.

## Before you start

| You are about to… | Read first |
| --- | --- |
| Create a file | `docs/architecture.md` §1 — the tree |
| Import across folders | `docs/architecture.md` §2 — the dependency rule |
| Touch **any** numeric amount | `docs/adr/0002-money-as-integer-minor-units.md` |
| Touch a price, quote or feed | `docs/adr/0003-real-market-data-never-simulated.md` |
| Touch a session, password, or token | `docs/adr/0004-identity-sessions-and-email-verification.md` |
| Decide server vs client | `docs/architecture.md` §5 |
| Set caching on a page | `docs/architecture.md` §6 |

Framework questions are answered from `node_modules/next/dist/docs/`, never from
memory. This is Next.js 16: `params` and `searchParams` are Promises, Turbopack
is the default bundler, and `middleware` is now `proxy`.

## The rules

1. **Money is never a `number`.** Integer minor units in a `bigint`, wrapped in
   `Money`. No floats, no `parseFloat`, no arithmetic on `toFixed` output.
   Amounts cross layers as exact decimal strings.

2. **The dependency rule points inward.** `domain` knows nothing. `application`
   knows `domain`. `infrastructure` knows both. `app/` knows only a module's
   public barrel. Never the reverse. `pnpm lint:boundaries` enforces this.

3. **The domain layer imports nothing from `next`, `react`, the database or the
   network.** A framework import in a domain file means the design is wrong.

4. **Never invent a price.** No recent observation is a state to render, not a
   gap to fill. `Market.quoteStateAt()` returns `live | stale | unavailable`;
   handle all three.

5. **Expected failures are values; unexpected failures are exceptions.** Use
   cases return `Result<T, DomainError>`. Reserve `throw` for bugs and
   infrastructure faults.

6. **Server Components read. Route handlers write.** Never mutate during render.
   Never fetch your own route handlers from a Server Component.

7. **Server Components are the default.** Add `'use client'` to the smallest
   leaf that needs it, never to a page that merely contains one widget.

8. **Cross a module boundary only through its barrel.** `@/modules/x` or
   `@/modules/x/server` — never a path inside it.

9. **A page's `revalidate` must be a literal.** Next reads segment config
   statically; an imported constant is not resolvable and the build fails.

10. **Read the session only through `src/server/auth.ts`.** Never read the cookie
    directly. Every Server Action re-derives its own authority — an action is a
    public endpoint, and the page that rendered its form protects nothing.

11. **Never issue a session from a verification link.** The token proves receipt
    of mail, not identity. Links get prefetched and forwarded.

12. **The design is approved.** Port it faithfully. Change visual design or copy
    only when it has become factually false — and say so in a comment at the
    site of the change, as `(marketing)/markets/page.tsx` does.

## Verifying

```bash
pnpm verify          # typecheck + lint + boundaries + unit tests
pnpm build           # the real check: every route must build
```

Both must pass before a change is done.

## Things that will bite you

- **A barrel is imported whole.** Importing a type from a barrel that also
  exports server-only composition drags the database client into the client
  bundle. That is why `market-data` has both `index.ts` and `server.ts`.
- **A value imported from a `'use client'` module into server code is a
  reference, not the value.** The theme storage key lives in its own
  directive-free module for exactly this reason — the earlier version silently
  generated `localStorage.getItem(undefined)`.
- **`useId` is not available in Server Components.** Pass an explicit id instead
  (see `Sparkline`), or hoist shared SVG defs to the layout (see `LogoGradients`).
- **`server-only` needs the `react-server` export condition outside Next.**
  Scripts run as `node --conditions=react-server --import tsx`. Vitest aliases it
  to a stub instead — see `src/test/server-only-stub.ts`.
- **A `'use server'` file may export only async functions.** A constant or an
  object there is a build error, which is why `AuthFormState` and
  `IDLE_FORM_STATE` live in `(auth)/_lib/form-state.ts`.
- **`useSearchParams()` forces a client bailout.** On a prerendered route it must
  sit inside `<Suspense>`, or the build refuses the whole page.
