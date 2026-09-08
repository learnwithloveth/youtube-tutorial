import { TRUST_STATS } from '@/data/brand';
import { CountUp } from '@/design-system/primitives/CountUp';
import { StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';

export function StatsBand() {
  return (
    <section className="relative border-y border-line">
      <StaggerGroup className="shell grid grid-cols-2 divide-line lg:grid-cols-4 lg:divide-x">
        {TRUST_STATS.map((stat) => (
          <StaggerItem key={stat.label} className="px-2 py-10 text-center lg:px-8">
            <dl>
              <dd className="font-display text-4xl font-semibold tracking-tight text-fg">
                <CountUp
                  value={stat.value}
                  prefix={'prefix' in stat ? stat.prefix : ''}
                  suffix={'suffix' in stat ? stat.suffix : ''}
                  decimals={'decimals' in stat ? stat.decimals : 0}
                  compact={'compact' in stat ? stat.compact : false}
                />
              </dd>
              <dt className="mt-2 text-xs uppercase tracking-[0.14em] text-fg-subtle">
                {stat.label}
              </dt>
            </dl>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </section>
  );
}
