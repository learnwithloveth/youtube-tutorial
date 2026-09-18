import type { Brand, TrustStat } from '../domain/types';

/**
 * The site's name and description, as the deployment sets them.
 *
 * ── Read from the environment, and why it is safe in a browser bundle ──────────
 * `WEBSITE_NAME` and `WEBSITE_DESCRIPTION` are inlined at build time by `env` in
 * `next.config.ts`, so this module evaluates to the same strings on the server and
 * in the browser — which matters, because Client Components render the name too.
 * Both are read as whole `process.env.X` expressions, the only form the inlining
 * recognises.
 *
 * Unset or blank falls back to the approved design's name and description, so a
 * clone with no `.env` still renders a complete site rather than an empty title.
 */
const DEFAULT_NAME = 'Novex';
const DEFAULT_DESCRIPTION =
  'Buy, sell and earn on 340+ digital assets with institutional execution, 1:1 proof-of-reserves and fees that start at 0.00%.';

const NAME = process.env.WEBSITE_NAME?.trim() || DEFAULT_NAME;
const DESCRIPTION = process.env.WEBSITE_DESCRIPTION?.trim() || DEFAULT_DESCRIPTION;

/** Brand facts. The name and description come from the environment; the rest is the approved design. */
export const BRAND: Brand = {
  name: NAME,
  wordmark: NAME.toUpperCase(),
  domain: 'novex.io',
  tagline: 'The exchange that moves at the speed of conviction.',
  description: DESCRIPTION,
  founded: 2019,
  hq: 'Zurich · Singapore · Paris',
  support: 'support@novex.io',
  press: 'press@novex.io',
  social: {
    x: 'https://x.com/novex',
    github: 'https://github.com/novex',
    linkedin: 'https://linkedin.com/company/novex',
    youtube: 'https://youtube.com/@novex',
  },
};

export const TRUST_STATS: readonly TrustStat[] = [
  { label: 'Assets under custody', value: 184_000_000_000, prefix: '$', compact: true },
  { label: 'Verified traders', value: 41_200_000, compact: true },
  { label: 'Matching latency', value: 0.9, suffix: 'ms', decimals: 1 },
  { label: 'Proof-of-reserves', value: 100, suffix: '%' },
];
