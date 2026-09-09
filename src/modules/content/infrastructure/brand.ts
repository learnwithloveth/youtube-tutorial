import type { Brand, TrustStat } from '../domain/types';

/** Brand facts, verbatim from the approved design. */
export const BRAND: Brand = {
  name: 'Novex',
  wordmark: 'NOVEX',
  domain: 'novex.io',
  tagline: 'The exchange that moves at the speed of conviction.',
  description:
    'Buy, sell and earn on 340+ digital assets with institutional execution, 1:1 proof-of-reserves and fees that start at 0.00%.',
  founded: 2019,
  hq: 'Zurich · Singapore · Lagos',
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
