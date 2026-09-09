import type { Metadata } from 'next';
import Link from 'next/link';

import { getFeaturedPost, listBlogPosts } from '@/modules/content';
import { Reveal } from '@/shared/ui/motion/reveal';
import { Badge } from '@/shared/ui/primitives/badge';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Section } from '@/shared/ui/primitives/section';

import { CtaBand } from '../_components/sections/cta-band';
import { PageHero } from '../_components/sections/page-hero';
import { Byline } from './_components/byline';
import { PostGrid } from './_components/post-grid';

export const metadata: Metadata = {
  title: 'Blog',
  description:
    'Engineering write-ups, market-structure research and the decisions we had to argue about internally.',
};

export default function BlogPage() {
  const featured = getFeaturedPost();
  const rest = listBlogPosts().filter((post) => post.slug !== featured?.slug);

  return (
    <>
      <PageHero
        eyebrow="Blog"
        title={
          <>
            Notes from the <span className="text-aurora">order book.</span>
          </>
        }
        body="Engineering write-ups, market-structure research and the occasional decision we had to argue about internally."
      />

      <Section className="pt-0">
        <div className="shell">
          {featured ? (
            <Reveal>
              <Link href={`/blog/${featured.slug}`} className="group block">
                <InteractiveCard className="grid gap-8 p-8 lg:grid-cols-[1.3fr_1fr] lg:items-center md:p-10">
                  <div>
                    <Badge tone="brand">{featured.category}</Badge>
                    <h2 className="mt-5 font-display text-3xl font-semibold leading-tight text-fg transition-colors group-hover:text-brand-soft">
                      {featured.title}
                    </h2>
                    <p className="mt-4 text-lg leading-relaxed text-fg-muted">
                      {featured.excerpt}
                    </p>
                    <Byline post={featured} className="mt-7" />
                  </div>
                  <div
                    aria-hidden
                    className="relative hidden aspect-4/3 overflow-hidden rounded-lg border border-line bg-bg-sunken lg:block"
                  >
                    <div className="aurora-field opacity-90">
                      <i />
                    </div>
                    <div className="absolute inset-0 grid-lines opacity-50" />
                    <span className="absolute bottom-5 right-6 font-mono text-2xs uppercase tracking-[0.2em] text-fg-subtle">
                      Featured
                    </span>
                  </div>
                </InteractiveCard>
              </Link>
            </Reveal>
          ) : null}

          <PostGrid posts={rest} />
        </div>
      </Section>

      <CtaBand
        title="Get the good posts by email."
        body="One newsletter a week: research, releases and the postmortems we would rather you read from us."
        primary={{ label: 'Create an account', href: '/signup' }}
        secondary={{ label: 'Contact the team', href: '/contact' }}
      />
    </>
  );
}
