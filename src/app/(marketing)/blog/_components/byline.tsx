import type { BlogPost } from '@/modules/content';
import { cn } from '@/shared/lib/cn';
import { formatDate } from '@/shared/lib/format';

/** Author credit. Shared by the listing cards and the post header. */
export function Byline({ post, className }: { post: BlogPost; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ring-1 ring-inset ring-white/20"
        style={{
          background: `linear-gradient(140deg, ${post.hue}, color-mix(in oklab, ${post.hue} 40%, var(--bg)))`,
        }}
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
