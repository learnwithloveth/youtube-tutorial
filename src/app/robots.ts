import type { MetadataRoute } from 'next';

/**
 * robots.txt.
 *
 * The disallow list is not security — anything reachable without a session is
 * public whatever this file says. It exists so that authentication screens and
 * machine endpoints do not compete with real pages in search results, and so
 * that a phishing clone of `/login` has one less legitimate page to rank beside.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://novex.io';

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/login', '/signup', '/forgot-password', '/two-factor', '/verify-identity'],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
