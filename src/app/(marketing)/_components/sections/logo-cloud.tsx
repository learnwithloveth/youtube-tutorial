import { Marquee } from '@/shared/ui/primitives/marquee';
import { Reveal } from '@/shared/ui/motion/reveal';

const PARTNERS = [
  'Fireblocks', 'Chainalysis', 'Circle', 'Copper', 'Fidelity Digital', 'Jump Crypto',
  'Wintermute', 'BitGo', 'Anchorage', 'Elliptic', 'Talos', 'Galaxy',
];

/** Partner rail. Wordmarks are typographic so the strip stays crisp at any DPI. */
export function LogoCloud({ label = 'Custody, liquidity and compliance partners' }: { label?: string }) {
  return (
    <section className="border-y border-line bg-bg-sunken/40 py-12">
      <Reveal className="shell">
        <p className="mb-8 text-center text-xs uppercase tracking-[0.18em] text-fg-subtle">{label}</p>
      </Reveal>
      <Marquee durationSec={46}>
        <div className="flex items-center gap-14 pr-14">
          {PARTNERS.map((name) => (
            <span
              key={name}
              className="whitespace-nowrap font-display text-xl font-semibold tracking-tight text-fg-subtle transition-colors duration-300 hover:text-fg"
            >
              {name}
            </span>
          ))}
        </div>
      </Marquee>
    </section>
  );
}
