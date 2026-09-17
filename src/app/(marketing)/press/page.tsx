import type { Metadata } from 'next';
import { ArrowUpRight, Download, Mail, Palette, Type as TypeIcon } from 'lucide-react';
import { PageHero } from '../_components/sections/page-hero';
import { CtaBand } from '../_components/sections/cta-band';
import { Section, SectionHeading } from '@/shared/ui/primitives/section';
import { Card } from '@/shared/ui/primitives/card';
import { ButtonLink } from '@/shared/ui/primitives/button-link';
import { Reveal, StaggerGroup, StaggerItem } from '@/shared/ui/motion/reveal';
import { LogoMark, Wordmark } from '@/shared/ui/visuals/logo';
import { listPressItems } from '@/modules/content';
import { BRAND, TRUST_STATS } from '@/modules/content';
import { CountUp } from '@/shared/ui/primitives/count-up';
import { formatDate } from '@/shared/lib/format';

const PALETTE = [
  { name: 'Void', hex: '#04120D' },
  { name: 'Phosphor jade', hex: '#10BD85' },
  { name: 'Signal lime', hex: '#C8F450' },
  { name: 'Aqua', hex: '#4FE4D8' },
  { name: 'Spring', hex: '#5FF09B' },
  { name: 'Ink', hex: '#E6F2EA' },
];

const FACTS = [
  { k: 'Founded', v: '2019, Zurich' },
  { k: 'Employees', v: '840 across 9 timezones' },
  { k: 'Offices', v: 'Zurich · Singapore · Lagos' },
  { k: 'Licences', v: '14 jurisdictions' },
  { k: 'Listed assets', v: '340+' },
  { k: 'Legal entity', v: `${BRAND.name} Technologies AG` },
];

export const metadata: Metadata = {
  title: 'Press',
  description:
    `Logos, brand assets, company facts and media contacts for the ${BRAND.name} press office.`,
};

export default function PressPage() {

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
            <ButtonLink href="/contact" size="lg" sheen>
              <Mail className="size-4" />
              {BRAND.press}
            </ButtonLink>
            <ButtonLink href="#assets" variant="outline" size="lg">
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

          {/* `grid-cols-1` is `minmax(0, 1fr)`: without it the single phone column
              sizes to its widest content, and a long site name in a lockup that
              will not wrap made the page scroll sideways. */}
          <div className="mt-14 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Reveal>
              <Card className="flex h-56 flex-col items-center justify-center gap-6 p-8">
                <Wordmark markClassName="size-12" />
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
                <span className="inline-flex min-w-0 max-w-full items-center gap-2.5">
                  <LogoMark decorative className="size-9" />
                  <span className="min-w-0 truncate font-display text-lg font-bold tracking-[-0.04em] text-[#06140e]">
                    {BRAND.wordmark}
                  </span>
                </span>
                <p className="text-xs uppercase tracking-wider text-[#4b5f55]">On light surfaces</p>
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
                    <p className="font-display text-3xl font-semibold text-fg">Gabarito Semibold</p>
                    <p className="mt-1 text-xs text-fg-subtle">Display · headings and the wordmark</p>
                  </div>
                  <div>
                    <p className="text-xl text-fg">Figtree Regular</p>
                    <p className="mt-1 text-xs text-fg-subtle">Body · all running text and UI</p>
                  </div>
                  <div>
                    <p data-numeric className="text-xl text-fg">
                      IBM Plex Mono 0123456789
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
              {listPressItems().map((item) => (
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
        primary={{ label: 'Contact press', href: '/contact' }}
        secondary={{ label: 'Read the blog', href: '/blog' }}
      />
    </>
  );
}
