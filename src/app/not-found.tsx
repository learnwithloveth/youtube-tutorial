import { ArrowRight, Home, LifeBuoy, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Aurora } from '@/shared/ui/visuals/aurora';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { InteractiveCard } from '@/shared/ui/primitives/interactive-card';
import { Reveal } from '@/shared/ui/motion/reveal';

const SUGGESTIONS = [
  { icon: TrendingUp, label: 'Live markets', description: 'Prices for 340+ assets', href: '/markets' },
  { icon: Home, label: 'Home', description: 'Start from the beginning', href: '/' },
  { icon: LifeBuoy, label: 'Help', description: 'Talk to a human', href: '/contact' },
];

export default function NotFound() {
  return (
    <section className="relative isolate -mt-18 flex min-h-dvh items-center overflow-hidden py-32">
      <Aurora grid />
      <div className="shell text-center">
        <Reveal>
          <p
            aria-hidden
            className="font-display text-[clamp(6rem,22vw,15rem)] font-bold leading-none text-aurora"
          >
            404
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <h1 className="mt-2 text-4xl font-semibold">This page never settled</h1>
          <p className="mx-auto mt-5 max-w-lg text-lg text-fg-muted">
            The link is broken, the page moved, or it never existed. All three happen. None of them
            affect your balance.
          </p>
        </Reveal>

        <Reveal delay={0.18}>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/" size="lg" sheen>
              Back to home
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </ButtonLink>
            <ButtonLink href="/markets" variant="outline" size="lg">
              View markets
            </ButtonLink>
          </div>
        </Reveal>

        <Reveal delay={0.24}>
          <div className="mx-auto mt-16 grid max-w-2xl gap-4 sm:grid-cols-3">
            {SUGGESTIONS.map((item) => (
              <Link key={item.href} href={item.href} className="group">
                <InteractiveCard className="h-full p-5 text-left">
                  <item.icon className="size-5 text-brand-soft" />
                  <p className="mt-4 text-sm font-medium text-fg">{item.label}</p>
                  <p className="mt-1 text-xs text-fg-subtle">{item.description}</p>
                </InteractiveCard>
              </Link>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
