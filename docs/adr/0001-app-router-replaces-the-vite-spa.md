# ADR-0001: The App Router replaces the Vite SPA

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

The approved design arrived as a Vite + React Router single-page application:
33 page components, a design system, and a full token/effects layer, copied into
`src/` of a fresh Next.js 16 scaffold.

It did not run here, and never had. Verified facts at the time:

- It imported `react-router-dom`, `lucide-react`, `clsx`, `tailwind-merge` and
  `motion` — **none of which were dependencies of this project**.
- It read `import.meta.env.VITE_ROUTER`, a Vite-only API. There is no Vite here.
- `src/app/router.tsx` referenced a `manualChunks` strategy in a
  `vite.config.ts` that does not exist.
- `src/main.tsx` mounted to `#root`, which no Next.js document provides.
- Worse, it sat at `src/pages/`, which **Next.js treats as the Pages Router**.
  Every file in it was being turned into a route.

## Options considered

**A — Restore the SPA: add Vite and react-router, drop Next.js.**
The page components would work largely as written. But marketing pages would
render in the browser, costing SEO, first paint, and bundle size on precisely
the pages where speed is a trust signal. Every business rule would run on the
client or need a separate backend.

**B — Keep both: a Next shell hosting the SPA at a catch-all route.**
Nothing is deleted immediately. But two routers fight for the same URLs, two
rendering models coexist, the bundle doubles, and caching becomes impossible to
reason about.

**C — App Router is canonical; port the design onto it and delete the SPA.**
One routing model, Server Components by default, static shells for marketing.
Costs a hand port of every page and a server/client split decided case by case.

## Decision

**C.** The App Router is the only routing model. The SPA was treated as visual
and inventory reference, moved out of `src/` immediately so it stopped being
routed and typechecked, and deleted once every page had an equivalent.

The design itself is preserved: the same tokens, the same effects layer, the
same copy, the same components. What changed is the framework underneath and the
server/client boundary drawn through it.

## Consequences

- 29 routes, of which 24 asset pages and 6 blog posts are prerendered from
  `generateStaticParams`.
- `useSeo`, which wrote `document.title` from an effect, is replaced by the
  Metadata API. The effect version was worth nothing for sharing or search:
  crawlers and unfurlers read the served HTML and do not run effects.
- Scroll restoration, code splitting and the Suspense boundaries are the
  framework's job now; `ScrollToTop` and `RouteFallback` are gone.
- `ErrorBoundary` became `error.tsx` and `global-error.tsx`, which keep the
  chrome alive around a failed segment instead of replacing the whole page.
- Eight `.woff2` files and a hand-written `@font-face` block became `next/font`,
  which fingerprints, preloads and generates size-adjusted fallback metrics.

## Recovery

The original SPA is in git history at `HEAD:src/pages/**` on this branch's
initial commit, and at `main:_legacy/**`.
