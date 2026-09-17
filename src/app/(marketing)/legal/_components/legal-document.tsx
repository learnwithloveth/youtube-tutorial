import type { ReactNode } from 'react';
import { BRAND } from '@/modules/content';
import { Reveal } from '@/shared/ui/motion/reveal';
import { Badge } from '@/shared/ui/primitives/badge';

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode;
}

/**
 * Renders a legal document with a generated in-page table of contents.
 * Headings are anchor targets so support can deep-link to a clause.
 */
export function LegalDocument({
  title,
  updated,
  summary,
  sections,
}: {
  title: string;
  updated: string;
  summary: string;
  sections: LegalSection[];
}) {
  return (
    <>
      <Reveal>
        <Badge tone="neutral">Last updated {updated}</Badge>
        <h1 className="mt-5 text-4xl font-semibold">{title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-fg-muted">{summary}</p>
      </Reveal>

      <Reveal delay={0.08}>
        <nav
          aria-label="On this page"
          className="mt-10 rounded-lg border border-line bg-surface p-6 backdrop-blur-md"
        >
          <p className="eyebrow mb-4">On this page</p>
          <ol className="grid gap-2 sm:grid-cols-2">
            {sections.map((section, i) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="flex gap-2.5 text-sm text-fg-muted transition-colors hover:text-fg"
                >
                  <span className="font-mono text-fg-subtle">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </Reveal>

      {sections.map((section, i) => (
        <Reveal key={section.id} delay={0.02 * i}>
          <section>
            <h2 id={section.id}>
              <span className="mr-3 font-mono text-lg text-fg-subtle">
                {String(i + 1).padStart(2, '0')}
              </span>
              {section.heading}
            </h2>
            {section.body}
          </section>
        </Reveal>
      ))}

      <Reveal>
        <div className="mt-16 rounded-lg border border-line bg-bg-sunken/60 p-6 text-sm leading-relaxed text-fg-subtle">
          {BRAND.name} is a fictional exchange created as a design demonstration. This document is
          illustrative sample copy and is not legal advice or an enforceable agreement.
        </div>
      </Reveal>
    </>
  );
}
