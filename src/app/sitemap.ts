import type { MetadataRoute } from 'next';

import { listBlogSlugs } from '@/modules/content';
import { getInstruments } from '@/server/market-data';

/**
 * The sitemap.
 *
 * Generated from the same sources the routes are: the instrument catalogue and
 * the content module. A hand-maintained list of URLs drifts the first time
 * someone lists an asset and forgets to update it, and a sitemap that lies is
 * worse than none.
 *
 * Authentication routes are absent by design — they are `noindex` and have
 * nothing to offer a search result.
 */

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '/', priority: 1, changeFrequency: 'daily' },
  { path: '/markets', priority: 0.9, changeFrequency: 'hourly' },
  { path: '/trade', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/earn', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/fees', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/features', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/security', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/wallet', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/app', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/institutional', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/developers', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/blog', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/learn', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/about', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/careers', priority: 0.5, changeFrequency: 'weekly' },
  { path: '/affiliates', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/press', priority: 0.4, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.4, changeFrequency: 'yearly' },
  { path: '/status', priority: 0.4, changeFrequency: 'hourly' },
  { path: '/legal/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/legal/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/legal/cookies', priority: 0.3, changeFrequency: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://novex.io';
  const lastModified = new Date();

  const instruments = await getInstruments();

  return [
    ...STATIC_ROUTES.map((route) => ({
      url: `${base}${route.path}`,
      lastModified,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    ...instruments.map((instrument) => ({
      url: `${base}/markets/${instrument.slug}`,
      lastModified,
      changeFrequency: 'hourly' as const,
      priority: 0.7,
    })),
    ...listBlogSlugs().map((slug) => ({
      url: `${base}/blog/${slug}`,
      lastModified,
      changeFrequency: 'yearly' as const,
      priority: 0.5,
    })),
  ];
}
