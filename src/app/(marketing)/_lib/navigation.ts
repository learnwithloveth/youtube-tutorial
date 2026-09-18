/**
 * Site navigation.
 *
 * ── One page, and the menu says so ────────────────────────────────────────────
 * The menus point at parts of the landing page, not at a tree of separate pages.
 * What this deployment has is one marketing page; a menu listing products,
 * newsrooms and careers behind it is a menu that lies, and every one of those
 * entries was a promise the site could not keep.
 *
 * ── Why the links are absolute ────────────────────────────────────────────────
 * `/#markets` rather than `#markets`, because the footer is on the legal pages
 * too. A bare fragment there scrolls to nothing; the absolute form navigates home
 * and then scrolls.
 *
 * ── The ids live on the sections ──────────────────────────────────────────────
 * Each `href` below matches an `id` in `_components/sections/*`, and the sections
 * carry `scroll-mt` so the sticky header does not cover the heading. An entry
 * added here without an id scrolls nowhere, so the two change together.
 */

export interface NavLink {
  label: string;
  href: string;
}

/** The landing page, in the order a visitor scrolls through it. */
export const SECTION_NAV: NavLink[] = [
  { label: 'Markets', href: '/#markets' },
  { label: 'Platform', href: '/#platform' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Earn', href: '/#earn' },
  { label: 'Security', href: '/#security' },
  { label: 'FAQ', href: '/#faq' },
];

/**
 * The footer's columns: the same sections, plus the two things a visitor who has
 * read them might want. The legal links are not here — they sit in the bar at the
 * very bottom, where a reader looks for them.
 */
export const FOOTER_NAV: { heading: string; links: NavLink[] }[] = [
  { heading: 'Explore', links: SECTION_NAV },
  {
    heading: 'Account',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'Create account', href: '/signup' },
    ],
  },
];
