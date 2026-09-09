'use client';

import { AnimatePresence, motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/cn';

export interface DisclosureItem {
  question: string;
  answer: ReactNode;
}

/** WAI-ARIA disclosure pattern with height-animated panels. */
export function DisclosureList({
  items,
  className,
}: {
  items: DisclosureItem[];
  className?: string;
}) {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <div className={cn('divide-y divide-line border-y border-line', className)}>
      {items.map((item, index) => {
        const isOpen = open === index;
        const panelId = `${base}-panel-${index}`;
        const buttonId = `${base}-button-${index}`;

        return (
          <div key={item.question}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : index)}
                className="group flex w-full items-center justify-between gap-6 py-6 text-left"
              >
                <span
                  className={cn(
                    'text-lg font-medium transition-colors duration-300',
                    isOpen ? 'text-fg' : 'text-fg-muted group-hover:text-fg',
                  )}
                >
                  {item.question}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-full border border-line transition-all duration-500 ease-[var(--ease-out-expo)]',
                    isOpen
                      ? 'rotate-45 border-brand-soft bg-brand text-on-brand'
                      : 'text-fg-muted group-hover:border-line-strong',
                  )}
                >
                  <Plus className="size-4" />
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="max-w-2xl pb-7 leading-relaxed text-fg-muted">{item.answer}</div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
