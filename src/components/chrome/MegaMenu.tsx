import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { NavColumn } from '@/data/navigation';
import { Badge } from '@/design-system/primitives/Badge';
import { cn } from '@/lib/cn';

export function MegaMenuPanel({ column, onNavigate }: { column: NavColumn; onNavigate: () => void }) {
  const hasFeature = Boolean(column.feature);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -8, filter: 'blur(8px)' }}
      transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        // Near-opaque on purpose: at glass opacity the hero display type read
        // straight through the panel and fought its own labels.
        'hairline overflow-hidden rounded-xl border border-line bg-bg-elev/98 p-2',
        'shadow-float backdrop-blur-2xl backdrop-saturate-150',
        hasFeature ? 'w-[46rem]' : 'w-[30rem]',
      )}
    >
      <div className={cn('grid gap-1', hasFeature && 'grid-cols-[1fr_16rem]')}>
        <div className="grid gap-5 p-4">
          {column.groups?.map((group) => (
            <div key={group.heading}>
              <p className="eyebrow mb-3 px-2">{group.heading}</p>
              <ul className="grid gap-0.5 sm:grid-cols-2">
                {group.items.map((item) => (
                  <li key={item.href + item.label}>
                    <Link
                      to={item.href}
                      onClick={onNavigate}
                      className="group flex items-start gap-3 rounded-md p-2.5 transition-colors duration-200 hover:bg-surface-hover"
                    >
                      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-sm border border-line bg-surface text-brand-soft transition-colors duration-300 group-hover:border-brand-soft/50 group-hover:text-accent">
                        <item.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium text-fg">
                          {item.label}
                          {item.badge ? (
                            <Badge tone="accent" className="px-1.5 py-0">
                              {item.badge}
                            </Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-fg-subtle">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {column.feature ? (
          <Link
            to={column.feature.href}
            onClick={onNavigate}
            className="group relative flex flex-col justify-end overflow-hidden rounded-lg border border-line bg-bg-sunken/90 p-5"
          >
            <span
              aria-hidden
              className="absolute -right-16 -top-16 size-48 rounded-full opacity-70 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
              style={{ background: 'radial-gradient(circle, var(--halo-a), transparent 70%)' }}
            />
            <span className="relative">
              <span className="block font-display text-lg font-semibold text-fg">
                {column.feature.title}
              </span>
              <span className="mt-2 block text-xs leading-relaxed text-fg-muted">
                {column.feature.body}
              </span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-soft">
                {column.feature.cta}
                <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </span>
          </Link>
        ) : null}
      </div>
    </motion.div>
  );
}
