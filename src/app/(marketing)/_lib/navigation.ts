import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight, BadgeCheck, BookOpen, Building2, Coins, CreditCard, FileText,
  Gauge, Gift, Landmark, LifeBuoy, Newspaper, Percent, Server, ShieldCheck,
  Smartphone, Sparkles, TerminalSquare, TrendingUp, Users, Wallet,
} from 'lucide-react';

/**
 * Site navigation.
 *
 * Information architecture, not business content, so it lives with the
 * marketing route group rather than in a module: it describes this section's
 * URL structure and changes when the section does. It also references icon
 * components directly, which a content module has no business importing.
 *
 * Structure and copy are verbatim from the approved design; only `to` became
 * `href`, matching next/link.
 */

export interface NavLeaf {
  label: string;
  href: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}

export interface NavGroup {
  heading: string;
  items: NavLeaf[];
}

export interface NavColumn {
  label: string;
  href?: string;
  groups?: NavGroup[];
  /** Optional promotional rail rendered on the right of the mega-menu. */
  feature?: { title: string; body: string; href: string; cta: string };
}

export const PRIMARY_NAV: NavColumn[] = [
  {
    label: 'Trade',
    groups: [
      {
        heading: 'Ways to trade',
        items: [
          { label: 'Buy & Sell', href: '/trade', description: 'One-tap conversion at the best routed price.', icon: ArrowLeftRight },
          { label: 'Markets', href: '/markets', description: '340+ spot pairs with live depth.', icon: TrendingUp },
          { label: 'Recurring buys', href: '/trade#recurring', description: 'Automate DCA on any schedule.', icon: Gauge },
          { label: 'Card & bank rails', href: '/trade#funding', description: 'Fund in 46 currencies, instantly.', icon: CreditCard },
        ],
      },
      {
        heading: 'Grow',
        items: [
          { label: 'Earn & Staking', href: '/earn', description: 'Up to 12.4% APY on 38 assets.', icon: Coins, badge: 'New' },
          { label: 'Fees', href: '/fees', description: 'Maker rebates from -0.005%.', icon: Percent },
        ],
      },
    ],
    feature: {
      title: 'Zero-fee first 30 days',
      body: 'New accounts trade the top 20 pairs commission-free for a full month.',
      href: '/signup',
      cta: 'Claim offer',
    },
  },
  {
    label: 'Products',
    groups: [
      {
        heading: 'Platform',
        items: [
          { label: 'Novex Wallet', href: '/wallet', description: 'Self-custody with MPC key shards.', icon: Wallet },
          { label: 'Mobile app', href: '/mobile', description: 'iOS & Android, 4.9★ rated.', icon: Smartphone },
          { label: 'Security', href: '/security', description: 'Proof-of-reserves, HSM cold storage.', icon: ShieldCheck },
          { label: 'Features', href: '/features', description: 'Everything the engine can do.', icon: Sparkles },
        ],
      },
      {
        heading: 'For businesses',
        items: [
          { label: 'Institutional & OTC', href: '/institutional', description: 'Block liquidity, prime custody.', icon: Landmark },
          { label: 'Developers & API', href: '/developers', description: 'REST, WebSocket and FIX 4.4.', icon: TerminalSquare },
          { label: 'Affiliates', href: '/affiliates', description: 'Earn 45% of referred trading fees.', icon: Gift },
        ],
      },
    ],
  },
  {
    label: 'Learn',
    groups: [
      {
        heading: 'Resources',
        items: [
          { label: 'Academy', href: '/learn', description: 'From first wallet to derivatives.', icon: BookOpen },
          { label: 'Blog', href: '/blog', description: 'Research, releases and market notes.', icon: Newspaper },
          { label: 'Help centre', href: '/contact', description: '24/7 humans, 90-second median reply.', icon: LifeBuoy },
          { label: 'System status', href: '/status', description: '99.997% uptime, live incident feed.', icon: Server },
        ],
      },
    ],
  },
  {
    label: 'Company',
    groups: [
      {
        heading: 'About Novex',
        items: [
          { label: 'Our story', href: '/about', description: 'Why we rebuilt the matching engine.', icon: Building2 },
          { label: 'Careers', href: '/careers', description: '31 open roles across 9 timezones.', icon: Users, badge: 'Hiring' },
          { label: 'Press kit', href: '/press', description: 'Logos, facts and media contacts.', icon: FileText },
          { label: 'Licences', href: '/security#licences', description: 'Regulated in 14 jurisdictions.', icon: BadgeCheck },
        ],
      },
    ],
  },
];

export const FOOTER_NAV: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Trade',
    links: [
      { label: 'Buy & Sell', href: '/trade' },
      { label: 'Markets', href: '/markets' },
      { label: 'Earn', href: '/earn' },
      { label: 'Fees', href: '/fees' },
      { label: 'Buy Bitcoin', href: '/markets/btc' },
      { label: 'Buy Ethereum', href: '/markets/eth' },
    ],
  },
  {
    heading: 'Products',
    links: [
      { label: 'Features', href: '/features' },
      { label: 'Novex Wallet', href: '/wallet' },
      { label: 'Mobile app', href: '/mobile' },
      { label: 'Security', href: '/security' },
      { label: 'Institutional', href: '/institutional' },
      { label: 'Developers', href: '/developers' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Careers', href: '/careers' },
      { label: 'Blog', href: '/blog' },
      { label: 'Press', href: '/press' },
      { label: 'Affiliates', href: '/affiliates' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Academy', href: '/learn' },
      { label: 'System status', href: '/status' },
      { label: 'Proof of reserves', href: '/security#reserves' },
      { label: 'Terms of service', href: '/legal/terms' },
      { label: 'Privacy policy', href: '/legal/privacy' },
      { label: 'Cookie policy', href: '/legal/cookies' },
    ],
  },
];
