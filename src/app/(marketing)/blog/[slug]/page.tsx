import Link from 'next/link';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { PageHero } from '../../_components/sections/page-hero';
import { CtaBand } from '../../_components/sections/cta-band';
import { Section } from '@/shared/ui/primitives/section';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Badge } from '@/shared/ui/primitives/badge';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { Reveal } from '@/shared/ui/motion/reveal';
import { BRAND, getBlogPost, listBlogPosts } from '@/modules/content';
import { formatDate } from '@/shared/lib/format';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { listBlogSlugs } from '@/modules/content';


/** Every post is known at build time, so every post gets a static page. */
export function generateStaticParams(): { slug: string }[] {
  return listBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: 'Post not found', robots: { index: false, follow: false } };

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      publishedTime: post.date,
      authors: [post.author],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);

  // A missing post is a 404. The design answered 200 with an in-page message,
  // which tells search engines the URL is legitimate.
  if (!post) notFound();

  const related = listBlogPosts().filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <PageHero
        eyebrow={post.category}
        title={post.title}
        body={post.excerpt}
        align="center"
      />

      <Section className="pt-0">
        <div className="shell">
          <Reveal className="mx-auto max-w-3xl">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft className="size-3.5" />
              All posts
            </Link>

            <div className="mt-8 flex flex-wrap items-center gap-4 border-y border-line py-5">
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-full text-sm font-semibold text-white ring-1 ring-inset ring-white/20"
                style={{ background: `linear-gradient(140deg, ${post.hue}, color-mix(in oklab, ${post.hue} 40%, var(--bg)))` }}
              >
                {post.initials}
              </span>
              <div className="mr-auto">
                <p className="text-sm font-medium text-fg">{post.author}</p>
                <p className="text-xs text-fg-subtle">{post.role}</p>
              </div>
              <span className="text-xs text-fg-subtle">{formatDate(post.date)}</span>
              <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle">
                <Clock className="size-3" />
                {post.readingMinutes} min read
              </span>
            </div>

            <article className="mt-10 space-y-6">
              {post.body.map((paragraph, i) => (
                <p
                  key={i}
                  className={
                    i === 0
                      ? 'text-xl leading-relaxed text-fg'
                      : 'text-lg leading-relaxed text-fg-muted'
                  }
                >
                  {paragraph}
                </p>
              ))}
            </article>

            <div className="mt-12 rounded-lg border border-line bg-bg-sunken/60 p-6 text-sm leading-relaxed text-fg-subtle">
              {BRAND.name} is a fictional exchange built as a design demonstration. The analysis above is
              illustrative and is not investment advice.
            </div>
          </Reveal>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold">Keep reading</h2>
            <ButtonLink href="/blog" variant="outline" size="sm">
              All posts
              <ArrowRight className="size-3.5" />
            </ButtonLink>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {related.map((item) => (
              <Reveal key={item.slug}>
                <Link href={`/blog/${item.slug}`} className="group block h-full">
                  <InteractiveCard className="flex h-full flex-col p-6">
                    <Badge tone="neutral">{item.category}</Badge>
                    <h3 className="mt-5 font-display text-lg font-semibold leading-snug text-fg transition-colors group-hover:text-brand-soft">
                      {item.title}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-fg-muted">
                      {item.excerpt}
                    </p>
                    <p className="mt-5 text-xs text-fg-subtle">
                      {item.author} · {item.readingMinutes} min
                    </p>
                  </InteractiveCard>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <CtaBand />
    </>
  );
}
