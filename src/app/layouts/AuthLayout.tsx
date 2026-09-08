import { Link, Outlet } from 'react-router-dom';
import { ShieldCheck, Star, Zap } from 'lucide-react';
import { Wordmark } from '@/components/visuals/Logo';
import { Aurora } from '@/components/visuals/Aurora';
import { TRUST_STATS } from '@/data/brand';
import { CountUp } from '@/design-system/primitives/CountUp';

const PROOF = [
  { Icon: ShieldCheck, text: '1:1 proof-of-reserves, published every 24 hours' },
  { Icon: Zap, text: '0.9 ms median matching latency across 11 regions' },
  { Icon: Star, text: '4.9 average rating from 218,000 App Store reviews' },
];

/** Split-screen auth shell: form on the left, brand proof on the right. */
export function AuthLayout() {
  return (
    <div className="relative min-h-dvh lg:grid lg:grid-cols-[1fr_1fr]">
      <Aurora className="lg:hidden" />

      <div className="relative flex flex-col px-5 py-8 md:px-10">
        <Link to="/" className="inline-flex w-fit" aria-label="Novex home">
          <Wordmark />
        </Link>
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-md">
            <Outlet />
          </div>
        </div>
        <p className="text-center text-xs text-fg-subtle">
          Protected by hardware-backed 2FA and device attestation.
        </p>
      </div>

      <aside className="relative hidden overflow-hidden border-l border-line bg-bg-sunken/60 lg:flex lg:flex-col lg:justify-center">
        <Aurora grid />
        <div className="relative px-14 py-16">
          <p className="eyebrow mb-6">Why 41 million people chose Novex</p>
          <h2 className="max-w-md text-4xl font-semibold leading-[1.08]">
            The exchange that moves at the speed of{' '}
            <span className="text-aurora">conviction.</span>
          </h2>

          <ul className="mt-10 space-y-5">
            {PROOF.map(({ Icon, text }) => (
              <li key={text} className="flex items-start gap-3.5">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-brand-soft">
                  <Icon className="size-4" />
                </span>
                <span className="max-w-sm text-sm leading-relaxed text-fg-muted">{text}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-12 grid grid-cols-2 gap-6 border-t border-line pt-8">
            {TRUST_STATS.slice(0, 2).map((stat) => (
              <div key={stat.label}>
                <dt className="text-xs uppercase tracking-wider text-fg-subtle">{stat.label}</dt>
                <dd className="mt-1.5 font-display text-3xl font-semibold text-fg">
                  <CountUp
                    value={stat.value}
                    prefix={'prefix' in stat ? stat.prefix : ''}
                    compact={'compact' in stat ? stat.compact : false}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}
