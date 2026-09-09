
import { LegalNav } from './_components/legal-nav';

/**
 * Legal document chrome.
 *
 * Nested inside `(marketing)`, so these pages keep the site navbar and footer
 * and add a document sidebar — which is what the design does, and what a reader
 * arriving from a footer link expects.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell grid gap-12 py-16 lg:grid-cols-[16rem_1fr] lg:py-24">
      <LegalNav />
      <article className="prose-legal max-w-3xl">{children}</article>
    </div>
  );
}
