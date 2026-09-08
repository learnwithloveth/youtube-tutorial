import { useEffect } from 'react';
import { BRAND } from '@/data/brand';

export interface SeoInput {
  title: string;
  description: string;
  /** Overrides the default `<page> — NOVEX` composition. */
  absoluteTitle?: boolean;
  noindex?: boolean;
}

function upsertMeta(selector: string, attrs: Record<string, string>): void {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    document.head.appendChild(el);
  }
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
}

/**
 * Client-side document head manager.
 * In an SSR/SSG deployment this is replaced by framework metadata, but the
 * contract (title composition, description, OG/Twitter parity) stays identical.
 */
export function useSeo({ title, description, absoluteTitle, noindex }: SeoInput): void {
  useEffect(() => {
    const composed = absoluteTitle ? title : `${title} — ${BRAND.name}`;
    document.title = composed;

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: composed });
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[name="twitter:card"]', {
      name: 'twitter:card',
      content: 'summary_large_image',
    });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: composed });
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    });
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: noindex ? 'noindex,nofollow' : 'index,follow',
    });
  }, [title, description, absoluteTitle, noindex]);
}
