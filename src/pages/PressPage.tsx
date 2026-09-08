import { ArrowUpRight, Download, Mail, Palette, Type as TypeIcon } from 'lucide-react';
import { PageHero } from '@/components/sections/PageHero';
import { CtaBand } from '@/components/sections/CtaBand';
import { Section, SectionHeading } from '@/design-system/primitives/Section';
import { Card } from '@/design-system/primitives/Card';
import { ButtonLink } from '@/design-system/primitives/Button';
import { Reveal, StaggerGroup, StaggerItem } from '@/design-system/motion/Reveal';
import { LogoMark, Wordmark } from '@/components/visuals/Logo';
import { PRESS_ITEMS } from '@/data/content';
import { BRAND, TRUST_STATS } from '@/data/brand';
import { CountUp } from '@/design-system/primitives/CountUp';
import { formatDate } from '@/lib/format';
import { useSeo } from '@/lib/seo';

const PALETTE = [
  { name: 'Void', hex: '#05060B' },
  { name: 'Brand violet', hex: '#8B5CF6' },
  { name: 'Aurora cyan', hex: '#22D3EE' },
  { name: 'Signal magenta', hex: '#E879F9' },
  { name: 'Mint', hex: '#34D399' },
  { name: 'Ink', hex: '#EDEFF7' },
];

const FACTS = [
  { k: 'Founded', v: '2019, Zurich' },
  { k: 'Employees', v: '840 across 9 timezones' },
  { k: 'Offices', v: 'Zurich · Singapore · Lagos' },
  { k: 'Licences', v: '14 jurisdictions' },
  { k: 'Listed assets', v: '340+' },
  { k: 'Legal entity', v: 'Novex Technologies AG' },
];

export default function PressPage() {
  useSeo({
    title: 'Press kit',
    description:
      'Logos, brand colours, company facts and media contacts for journalists covering Novex.',
  });

  return (
    <>
      <PageHero
        eyebrow="Press"
        title={
          <>
            Everything a newsroom
            <br />
            <span className="text-aurora">needs, in one place.</span>
          </>
        }
        body="Logos, colours, facts and a named contact who answers. If something you need is missing, email us and we will add it."
        actions={
          <>
            <ButtonLink to="/contact" size="lg" sheen>
              <Mail className="size-4" />
              {BRAND.press}
            </ButtonLink>
            <ButtonLink to="#assets" variant="outline" size="lg">
              <Download className="size-4" />
              Brand assets
            </ButtonLink>
          </>
        }
      />

      <Section className="pt-0">
        <div className="shell">
          <StaggerGroup className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {TRUST_STATS.map((stat) => (
              <StaggerItem key={stat.label}>
                <Card className="p-7 text-center">
                  <p className="font-display text-3xl font-semibold text-fg">
                    <CountUp
                      value={stat.value}
                      prefix={'prefix' in stat ? stat.prefix : ''}
                      suffix={'suffix' in stat ? stat.suffix : ''}
                      decimals={'decimals' in stat ? stat.decimals : 0}
                      compact={'compact' in stat ? stat.compact : false}
                    />
                  </p>
                  <p className="mt-2 text-2xs uppercase tracking-wider text-fg-subtle">
                    {stat.label}
                  </p>
                </Card>
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      </Section>

      <Section id="assets" tone="sunken">
        <div className="shell">
          <SectionHeading
            eyebrow="Brand assets"
            title="Use the mark properly"
            body="Clear space on all sides equal to the height of the mark. Do not recolour it, rotate it, or place it on a busy photograph."
          />

          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            <Reveal>
              <Card className="flex h-56 flex-col items-center justify-center gap-6 p-8">
                <Wordmark markClassName="size-12" className="scale-125" />
                <p className="text-xs uppercase tracking-wider text-fg-subtle">
                  Primary lockup · SVG, PNG
                </p>
              </Card>
            </Reveal>
            <Reveal delay={0.07}>
              <Card className="flex h-56 flex-col items-center justify-center gap-6 p-8">
                <LogoMark className="size-20" />
                <p className="text-xs uppercase tracking-wider text-fg-subtle">
                  Mark only · SVG, PNG
                </p>
              </Card>
            </Reveal>
            <Reveal delay={0.14}>
              <Card className="flex h-56 flex-col items-center justify-center gap-4 bg-white p-8" edge={false}>
                <span className="inline-flex items-center gap-2.5">
                  <LogoMark className="size-9" />
                  <span className="font-display text-lg font-bold tracking-[-0.04em] text-[#0b0d16]">
                    NOVEX
                  </span>
                </span>
                <p className="text-xs uppercase tracking-wider text-[#565e7a]">On light surfaces</p>
              </Card>
            </Reveal>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Reveal>
              <Card className="p-7">
                <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold text-fg">
                  <Palette className="size-5 text-brand-soft" />
                  Palette
                </h3>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  {PALETTE.map((swatch) => (
                    <div key={swatch.hex}>
                      <span
                        className="block h-16 rounded-md border border-line"
                        style={{ background: swatch.hex }}
                      />
                      <p className="mt-2 text-xs font-medium text-fg">{swatch.name}</p>
                      <p data-numeric className="text-2xs text-fg-subtle">
                        {swatch.hex}
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            </Reveal>
            <Reveal delay={0.07}>
              <Card className="p-7">
                <h3 className="flex items-center gap-2.5 font-display text-lg font-semibold text-fg">
                  <TypeIcon className="size-5 text-brand-soft" />
                  Typography
                </h3>
                <div className="mt-6 space-y-5">
                  <div>
                    <p className="font-display text-3xl font-semibold text-fg">Sora Semibold</p>
                    <p className="mt-1 text-xs text-fg-subtle">Display · headings and the wordmark</p>
                  </div>
                  <div>
                    <p className="text-xl text-fg">Inter Regular</p>
                    <p className="mt-1 text-xs text-fg-subtle">Body · all running text and UI</p>
                  </div>
                  <div>
                    <p data-numeric className="text-xl text-fg">
                      JetBrains Mono 0123456789
                    </p>
                    <p className="mt-1 text-xs text-fg-subtle">Numeric · prices, quantities, code</p>
                  </div>
                </div>
              </Card>
            </Reveal>
          </div>
        </div>
      </Section>

      <Section>
        <div className="shell grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:gap-20">
          <div>
            <SectionHeading align="left" eyebrow="Fast facts" title="Company at a glance" />
            <dl className="mt-10 divide-y divide-line border-y border-line">
              {FACTS.map((fact) => (
                <div key={fact.k} className="flex justify-between gap-6 py-4">
                  <dt className="text-sm text-fg-subtle">{fact.k}</dt>
                  <dd className="text-right text-sm font-medium text-fg">{fact.v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <SectionHeading align="left" eyebrow="Coverage" title="Recent mentions" />
            <StaggerGroup className="mt-10 divide-y divide-line border-y border-line">
              {PRESS_ITEMS.map((item) => (
                <StaggerItem key={item.headline}>
                  <a
                    href={item.href}
                    className="group flex items-start gap-5 py-5 transition-colors hover:bg-surface-hover"
                  >
                    <span className="w-24 shrink-0 font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                      {formatDate(item.date)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-brand-soft">
                        {item.outlet}
                      </span>
                      <span className="mt-1 block text-sm leading-relaxed text-fg">
                        {item.headline}
                      </span>
                    </span>
                    <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-fg-subtle transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-fg" />
                  </a>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        </div>
      </Section>

      <CtaBand
        title="Working on a story?"
        body="Our press team replies within four hours on weekdays, and we can usually get you a named source on the record."
        primary={{ label: 'Contact press', to: '/contact' }}
        secondary={{ label: 'Read the blog', to: '/blog' }}
      />
    </>
  );
}
