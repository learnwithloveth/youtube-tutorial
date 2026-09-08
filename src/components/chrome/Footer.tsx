import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Github, Linkedin, Twitter, Youtube } from 'lucide-react';
import { BRAND } from '@/data/brand';
import { FOOTER_NAV } from '@/data/navigation';
import { Wordmark } from '@/components/visuals/Logo';
import { Button } from '@/design-system/primitives/Button';
import { Glow } from '@/components/visuals/Aurora';
import { AppStoreBadges } from '@/components/visuals/AppStoreBadges';

const SOCIALS = [
  { label: 'X', href: BRAND.social.x, Icon: Twitter },
  { label: 'GitHub', href: BRAND.social.github, Icon: Github },
  { label: 'LinkedIn', href: BRAND.social.linkedin, Icon: Linkedin },
  { label: 'YouTube', href: BRAND.social.youtube, Icon: Youtube },
];

const COMPLIANCE = [
  'MiCA · Licence CH-4419',
  'MAS Major Payment Institution',
  'FinCEN MSB 31000217412',
  'SOC 2 Type II',
];

function Newsletter() {
  const [state, setState] = useState<'idle' | 'done'>('idle');
  return (
    <form
      className="mt-6 max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        setState('done');
      }}
    >
      <label htmlFor="footer-email" className="text-sm text-fg-muted">
        Market intelligence, every Thursday.
      </label>
      <div className="mt-3 flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 backdrop-blur-md transition-colors focus-within:border-brand-soft">
        <input
          id="footer-email"
          type="email"
          required
          placeholder="you@company.com"
          className="min-w-0 flex-1 bg-transparent px-3 text-sm text-fg outline-none placeholder:text-fg-subtle"
        />
        <Button type="submit" size="sm" aria-label="Subscribe" className="px-4">
          {state === 'done' ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
        </Button>
      </div>
      <p className="mt-2 text-xs text-fg-subtle" aria-live="polite">
        {state === 'done' ? 'Subscribed — check your inbox.' : 'No spam. Unsubscribe anytime.'}
      </p>
    </form>
  );
}

export function Footer() {
  return (
    <footer className="relative isolate overflow-hidden border-t border-line bg-bg-sunken/50">
      <Glow className="-top-40 left-1/2 -translate-x-1/2" size={760} opacity={0.22} />

      <div className="shell py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_2fr]">
          <div>
            <Wordmark />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-fg-muted">{BRAND.tagline}</p>
            <Newsletter />
            <div className="mt-8 flex items-center gap-2">
              {SOCIALS.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={label}
                  className="grid size-10 place-items-center rounded-full border border-line text-fg-muted transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-soft hover:text-fg"
                >
                  <Icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_NAV.map((column) => (
              <nav key={column.heading} aria-label={column.heading}>
                <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-fg-subtle">
                  {column.heading}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        to={link.href}
                        className="text-sm text-fg-muted transition-colors duration-200 hover:text-fg"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-6 border-t border-line pt-8 lg:flex-row lg:items-center lg:justify-between">
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {COMPLIANCE.map((item) => (
              <li key={item} className="font-mono text-2xs uppercase tracking-wider text-fg-subtle">
                {item}
              </li>
            ))}
          </ul>
          <AppStoreBadges compact />
        </div>

        <div className="mt-8 space-y-4 border-t border-line pt-8">
          <p className="max-w-4xl text-xs leading-relaxed text-fg-subtle">
            Digital assets are volatile and their value can fall as well as rise. Novex is a
            fictional exchange created for design and demonstration purposes; nothing on this site
            is investment advice, an offer, or a solicitation. Staking rewards are variable and not
            guaranteed. Availability of products varies by jurisdiction.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-fg-subtle">
              © {new Date().getFullYear()} {BRAND.name} Technologies AG · {BRAND.hq}
            </p>
            <div className="flex items-center gap-5">
              {['Terms', 'Privacy', 'Cookies'].map((label) => (
                <Link
                  key={label}
                  to={`/legal/${label.toLowerCase()}`}
                  className="text-xs text-fg-subtle transition-colors hover:text-fg"
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
