'use client';

import { Clock } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import type { BlogPost } from '@/modules/content';
import { cn } from '@/shared/lib/cn';
import { StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { Badge } from '@/shared/ui/primitives/badge';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';

import { Byline } from './byline';

/**
 * The filterable post grid.
 *
 * Only this part of the blog index is interactive, so only this part is a
 * Client Component. The hero, the featured card and the calls-to-action around
 * it are server-rendered.
 */
export function PostGrid({ posts }: { posts: readonly BlogPost[] }) {
  const categories = useMemo(
    () => ['All', ...new Set(posts.map((post) => post.category))],
    [posts],
  );
  const [category, setCategory] = useState('All');

  const visible = useMemo(
    () => posts.filter((post) => category === 'All' || post.category === category),
    [posts, category],
  );

  return (
    <>
      <div className="mask-x mt-16 overflow-x-auto pb-1">
        <div className="flex gap-2">
          {categories.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setCategory(option)}
              aria-pressed={category === option}
              className={cn(
                'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm transition-all duration-300',
                category === option
                  ? 'border-brand-soft/60 bg-brand/15 text-fg'
                  : 'border-line text-fg-muted hover:border-line-strong hover:text-fg',
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <StaggerGroup className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((post) => (
          <StaggerItem key={post.slug}>
            <Link href={`/blog/${post.slug}`} className="group block h-full">
              <InteractiveCard className="flex h-full flex-col p-6">
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
              </InteractiveCard>
            </Link>
          </StaggerItem>
        ))}
      </StaggerGroup>

      {visible.length === 0 ? (
        <p className="mt-12 text-center text-sm text-fg-muted">Nothing in that category yet.</p>
      ) : null}
    </>
  );
}
