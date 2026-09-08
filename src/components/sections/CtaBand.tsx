import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/design-system/primitives/Button';
import { Reveal } from '@/design-system/motion/Reveal';
import { Glow } from '@/components/visuals/Aurora';

export function CtaBand({
  title = 'Your first trade is 90 seconds away.',
  body = 'Open an account, verify once, and move between 340+ assets with fees that start at zero.',
  primary = { label: 'Create free account', to: '/signup' },
  secondary = { label: 'Talk to sales', to: '/institutional' },
}: {
  title?: string;
  body?: string;
  primary?: { label: string; to: string };
  secondary?: { label: string; to: string };
}) {
  return (
    <section className="relative isolate overflow-hidden py-20 md:py-28">
      <div className="shell">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-bg-sunken/70 px-6 py-16 text-center backdrop-blur-xl md:px-16 md:py-24 grain hairline">
            <Glow className="-top-32 left-1/2 -translate-x-1/2" size={720} opacity={0.45} />
            <Glow
              className="-bottom-40 right-0"
              size={520}
              opacity={0.32}
              color="var(--accent)"
            />
            <h2 className="mx-auto max-w-2xl text-4xl font-semibold">{title}</h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-fg-muted">{body}</p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink to={primary.to} size="lg" sheen>
                {primary.label}
                <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
              </ButtonLink>
              <ButtonLink to={secondary.to} variant="outline" size="lg">
                {secondary.label}
              </ButtonLink>
            </div>
            <p className="mt-6 text-xs text-fg-subtle">
              No minimum deposit · Cancel anytime · Available in 46 currencies
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
