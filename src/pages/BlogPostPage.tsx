import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { Badge } from '@/design-system/primitives/Badge';
import { ButtonLink } from '@/design-system/primitives/Button';
import { Reveal } from '@/design-system/motion/Reveal';
import { BLOG_BY_SLUG, BLOG_POSTS } from '@/data/content';
import { formatDate } from '@/lib/format';
import { useSeo } from '@/lib/seo';

export default function BlogPostPage() {
  const { slug = '' } = useParams();
  const post = BLOG_BY_SLUG.get(slug);

  useSeo({
    title: post ? post.title : 'Post not found',
    description: post ? post.excerpt : 'This article does not exist.',
    noindex: !post,
  });

  if (!post) {
    return (
      <Section>
        <div className="shell max-w-lg text-center">
          <h1 className="text-4xl font-semibold">Post not found</h1>
          <p className="mt-4 text-fg-muted">That article has moved or never existed.</p>
          <ButtonLink to="/blog" className="mt-8">
            Back to the blog
          </ButtonLink>
        </div>
      </Section>
    );
  }

  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 3);

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
              to="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft className="size-3.5" />
              All posts
            </Link>

            <div className="mt-8 flex flex-wrap items-center gap-4 border-y border-line py-5">
              <span
                aria-hidden
                className="grid size-11 place-items-center rounded-full text-sm font-semibold text-white ring-1 ring-inset ring-white/20"
                style={{ background: `linear-gradient(140deg, ${post.hue}, color-mix(in oklab, ${post.hue} 40%, #05060b))` }}
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
              Novex is a fictional exchange built as a design demonstration. The analysis above is
              illustrative and is not investment advice.
            </div>
          </Reveal>
        </div>
      </Section>

      <Section tone="sunken">
        <div className="shell">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
            <h2 className="text-3xl font-semibold">Keep reading</h2>
            <ButtonLink to="/blog" variant="outline" size="sm">
              All posts
              <ArrowRight className="size-3.5" />
            </ButtonLink>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {related.map((item) => (
              <Reveal key={item.slug}>
                <Link to={`/blog/${item.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col p-6">
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
                  </Card>
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
