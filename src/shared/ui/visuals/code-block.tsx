'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export interface CodeTab {
  label: string;
  filename: string;
  lines: { text: string; tone?: 'comment' | 'str' | 'num' | 'kw' | 'fn' }[];
}

const TONE_CLASS: Record<string, string> = {
  comment: 'text-fg-subtle',
  str: 'text-up',
  num: 'text-accent',
  kw: 'text-pop',
  fn: 'text-brand-soft',
};

/**
 * A tabbed code panel with hand-annotated token tones. Deliberately not a
 * syntax-highlighting library: a highlighter is ~120KB for a marketing page
 * that shows twelve lines of code.
 */
export function CodeBlock({ tabs, className }: { tabs: CodeTab[]; className?: string }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  // `tabs` is authored content, but the index is state; falling back to the
  // first tab keeps the panel rendering if the two ever disagree.
  const tab = tabs[active] ?? tabs[0];

  const copy = async () => {
    if (!tab) return;
    try {
      await navigator.clipboard.writeText(tab.lines.map((line) => line.text).join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard is unavailable in some embedded contexts — fail quietly */
    }
  };

  if (!tab) return null;

  return (
    <div className={cn('overflow-hidden rounded-lg border border-line bg-bg-sunken/80', className)}>
      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            type="button"
            onClick={() => setActive(i)}
            aria-pressed={i === active}
            className={cn(
              'rounded-sm px-3 py-1.5 font-mono text-2xs transition-colors',
              i === active ? 'bg-surface text-fg' : 'text-fg-subtle hover:text-fg',
            )}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="ml-auto grid size-8 place-items-center rounded-sm text-fg-subtle transition-colors hover:bg-surface hover:text-fg"
        >
          {copied ? <Check className="size-3.5 text-up" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto px-5 py-5 font-mono text-xs leading-relaxed">
        <code>
          {tab.lines.map((line, index) => (
            <span
              key={index}
              className={cn('block', line.tone ? TONE_CLASS[line.tone] : 'text-fg-muted')}
            >
              {line.text || ' '}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
