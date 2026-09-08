import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export function AnnouncementBar() {
  const [visible, setVisible] = useState(true);

  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          exit={{ height: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden border-b border-line bg-gradient-to-r from-brand-deep/40 via-brand/25 to-accent/25"
        >
          <div className="shell flex items-center justify-center gap-2.5 py-2 pr-8 text-center text-xs sm:gap-3 sm:pr-0">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-[pulse-ring_2.6s_var(--ease-out-expo)_infinite] rounded-full bg-accent" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
            <span className="truncate text-fg-muted">
              <span className="font-semibold text-fg">Novex Earn is live.</span>
              <span className="hidden sm:inline"> Stake 38 assets at up to 12.4% APY —</span>
              <span className="sm:hidden"> Up to 12.4% APY</span>
            </span>
            <Link
              to="/earn"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand-soft underline-offset-4 hover:underline"
            >
              see rates
              <ArrowRight className="size-3" />
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Dismiss announcement"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-fg-subtle transition-colors hover:text-fg"
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
