import { cn } from '@/shared/lib/cn';

const APPLE =
  'M17.05 12.53c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.62-1.7-3.19-1.72-1.36-.14-2.65.8-3.34.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.07 2.66-2.14.84-1.23 1.19-2.42 1.2-2.48-.02-.01-2.3-.88-2.3-3.51zM14.86 5.8c.6-.74 1.01-1.75.9-2.77-.87.04-1.94.59-2.57 1.32-.56.65-1.05 1.7-.92 2.7.98.08 1.98-.5 2.59-1.25z';
const PLAY =
  'M3.6 2.2c-.3.3-.5.8-.5 1.4v16.8c0 .6.2 1.1.5 1.4l.1.1 9.4-9.4v-.2L3.7 2.1l-.1.1zm12.7 6.3L13.4 11l-9-9c.2-.1.5-.1.8.1l11.1 6.4zM17.6 9.3l2.6 1.5c.9.5.9 1.9 0 2.4l-2.6 1.5-3.1-3.1 3.1-3.3zM13.4 13l2.9 2.5-11.1 6.4c-.3.2-.6.2-.8.1l9-9z';

function StoreBadge({
  store,
  line,
  path,
  compact,
}: {
  store: string;
  line: string;
  path: string;
  compact?: boolean;
}) {
  return (
    <a
      href="#download"
      className={cn(
        'group inline-flex items-center gap-3 rounded-md border border-line bg-surface backdrop-blur-md',
        'transition-all duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface-hover',
        compact ? 'px-3.5 py-2' : 'px-5 py-3',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        className={compact ? 'size-5' : 'size-7'}
        fill="currentColor"
        aria-hidden
      >
        <path d={path} />
      </svg>
      <span className="text-left leading-tight">
        <span className="block text-[0.6rem] uppercase tracking-wider text-fg-subtle">{line}</span>
        <span className={cn('block font-semibold text-fg', compact ? 'text-xs' : 'text-sm')}>
          {store}
        </span>
      </span>
    </a>
  );
}

export function AppStoreBadges({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <StoreBadge store="App Store" line="Download on the" path={APPLE} compact={compact} />
      <StoreBadge store="Google Play" line="Get it on" path={PLAY} compact={compact} />
    </div>
  );
}
