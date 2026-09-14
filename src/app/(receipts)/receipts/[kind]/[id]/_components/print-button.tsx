'use client';

import { Printer } from 'lucide-react';

/**
 * Opens the browser's print dialog.
 *
 * The one interactive element on the page, and the only reason any JavaScript
 * reaches it. `window.print()` cannot be triggered from a Server Component, and
 * making the whole document a Client Component to get one button would ship the
 * receipt's markup twice — once as HTML and once as a component tree.
 *
 * It hides itself when printing, along with everything else in `print:hidden`:
 * a "Print" button rendered onto the paper is the classic tell of a page that was
 * never actually printed during development.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg print:hidden"
    >
      <Printer className="size-3.5" />
      Print
    </button>
  );
}
