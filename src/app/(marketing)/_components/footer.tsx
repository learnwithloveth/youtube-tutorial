import Link from 'next/link';

import { BRAND } from '@/modules/content';
import { AppStoreBadges } from '@/shared/ui/visuals/app-store-badges';
import { Glow } from '@/shared/ui/visuals/aurora';
import { Wordmark } from '@/shared/ui/visuals/logo';
import {
  GithubIcon,
  LinkedinIcon,
  XIcon,
  YoutubeIcon,
} from '@/shared/ui/visuals/social-icons';

import { FOOTER_NAV } from '../_lib/navigation';
import { NewsletterForm } from './newsletter-form';

const SOCIALS = [
  { label: 'X', href: BRAND.social.x, Icon: XIcon },
  { label: 'GitHub', href: BRAND.social.github, Icon: GithubIcon },
  { label: 'LinkedIn', href: BRAND.social.linkedin, Icon: LinkedinIcon },
  { label: 'YouTube', href: BRAND.social.youtube, Icon: YoutubeIcon },
];

const COMPLIANCE = [
  'MiCA · Licence CH-4419',
  'MAS Major Payment Institution',
  'FinCEN MSB 31000217412',
  'SOC 2 Type II',
];

/** A Server Component: only the newsletter field inside it hydrates. */
export function Footer() {
  return (
    <footer className="relative isolate overflow-hidden border-t border-line bg-bg-sunken/50">
      <Glow className="-top-40 left-1/2 -translate-x-1/2" size={760} opacity={0.22} />

      <div className="shell py-16 md:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_2fr]">
          <div>
            <Wordmark />
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-fg-muted">{BRAND.tagline}</p>
            <NewsletterForm />
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
                        href={link.href}
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
            Digital assets are volatile and their value can fall as well as rise. {BRAND.name} is a
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
                  href={`/legal/${label.toLowerCase()}`}
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
