import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { Badge } from '@/design-system/primitives/Badge';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { BLOG_POSTS, type BlogPost } from '@/data/content';
import { formatDate } from '@/lib/format';
import { useSeo } from '@/lib/seo';
import { cn } from '@/lib/cn';

const CATEGORIES = ['All', ...new Set(BLOG_POSTS.map((p) => p.category))];

function Byline({ post, className }: { post: BlogPost; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ring-1 ring-inset ring-white/20"
        style={{ background: `linear-gradient(140deg, ${post.hue}, color-mix(in oklab, ${post.hue} 40%, #05060b))` }}
      >
        {post.initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-fg">{post.author}</p>
        <p className="truncate text-xs text-fg-subtle">
          {formatDate(post.date)} · {post.readingMinutes} min read
        </p>
      </div>
    </div>
  );
}

export default function BlogPage() {
  useSeo({
    title: 'Blog',
    description:
      'Engineering write-ups, market-structure research, security notes and company decisions from the Novex team.',
  });

  const [category, setCategory] = useState('All');
  const featured = BLOG_POSTS.find((p) => p.featured) ?? BLOG_POSTS[0];
  const posts = useMemo(
    () =>
      BLOG_POSTS.filter((p) => p.slug !== featured.slug).filter(
        (p) => category === 'All' || p.category === category,
      ),
    [category, featured.slug],
  );

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
          <Reveal>
            <Link to={`/blog/${featured.slug}`} className="group block">
              <Card interactive className="grid gap-8 p-8 lg:grid-cols-[1.3fr_1fr] lg:items-center md:p-10">
                <div>
                  <Badge tone="brand">{featured.category}</Badge>
                  <h2 className="mt-5 font-display text-3xl font-semibold leading-tight text-fg transition-colors group-hover:text-brand-soft">
                    {featured.title}
                  </h2>
                  <p className="mt-4 text-lg leading-relaxed text-fg-muted">{featured.excerpt}</p>
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
              </Card>
            </Link>
          </Reveal>

          <Reveal className="mask-x mt-16 overflow-x-auto pb-1">
            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  aria-pressed={category === c}
                  className={cn(
                    'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-all duration-300',
                    category === c
                      ? 'border-brand-soft/60 bg-brand/15 text-fg'
                      : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Reveal>

          <StaggerGroup className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <StaggerItem key={post.slug}>
                <Link to={`/blog/${post.slug}`} className="group block h-full">
                  <Card interactive className="flex h-full flex-col p-6">
                    <div className="flex items-center justify-between">
                      <Badge tone="neutral">{post.category}</Badge>
                      <span className="inline-flex items-center gap-1.5 text-2xs text-fg-subtle">
                        <Clock className="size-3" />
                        {post.readingMinutes} min
                      </span>
                    </div>
                    <h3 className="mt-5 font-display text-lg font-semibold leading-snug text-fg transition-colors group-hover:text-brand-soft">
                      {post.title}
                    </h3>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-fg-muted">{post.excerpt}</p>
                    <Byline post={post} className="mt-6 border-t border-line pt-5" />
                  </Card>
                </Link>
              </StaggerItem>
            ))}
          </StaggerGroup>

          {posts.length === 0 ? (
            <p className="mt-12 text-center text-sm text-fg-muted">Nothing in that category yet.</p>
          ) : null}
        </div>
      </Section>

      <CtaBand
        title="Get the good posts by email."
        body="One newsletter a week: research, releases and the postmortems we would rather you read from us."
        primary={{ label: 'Create an account', to: '/signup' }}
        secondary={{ label: 'Contact the team', to: '/contact' }}
      />
    </>
  );
}
