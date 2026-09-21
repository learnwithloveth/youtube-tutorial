import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight, Bell, LayoutDashboard,
  Inbox, Receipt, Settings, Wallet,
  // Needed again by the entries commented out below. Parked here rather than
  // deleted so re-enabling one is uncommenting two lines, not hunting for the icon
  // it wanted. Same arrangement in the admin nav.
  // CandlestickChart, Coins, Gift, Repeat,
} from 'lucide-react';

export interface DashNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Rendered as a pill on the rail — a count, or a short state word. */
  badge?: string;
  /** Badged with the live unread count, supplied by the shell. */
  unreadKey?: boolean;
  end?: boolean;
}

export interface DashNavGroup {
  heading: string;
  items: DashNavItem[];
}

export const DASH_NAV: DashNavGroup[] = [
  {
    heading: 'Trading',
    items: [
      { label: 'Overview', href: '/app', icon: LayoutDashboard, end: true },
      { label: 'Portfolio', href: '/app/portfolio', icon: ArrowLeftRight },
      // { label: 'Trade', href: '/app/trade', icon: CandlestickChart },
    ],
  },
  // {
  //   heading: 'Grow',
  //   items: [
  //     { label: 'Earn', href: '/app/earn', icon: Coins, badge: '12.4%' },
  //     { label: 'Recurring buys', href: '/app/recurring', icon: Repeat, badge: '3' },
  //     { label: 'Referrals', href: '/app/referrals', icon: Gift },
  //   ],
  // },
  {
    heading: 'Money',
    items: [
      { label: 'Wallet', href: '/app/wallet', icon: Wallet },
      { label: 'Transactions', href: '/app/transactions', icon: Receipt },
      /* Wallet integration is not here. It is a Settings tab, off by default for
         every account — so a permanent rail item would advertise a feature most
         people have never switched on, next to the two that move their money. */
    ],
  },
  {
    heading: 'Manage',
    items: [
      /* No literal badge here any more. It read "4" for every account on the
         platform, including one with no alerts at all. The unread count is real
         and is passed down from the layout — see `unreadKey`. */
      { label: 'Notifications', href: '/app/notifications', icon: Inbox, unreadKey: true },
      { label: 'Alerts', href: '/app/alerts', icon: Bell },
      { label: 'Settings', href: '/app/settings', icon: Settings },
    ],
  },
];

/** The five destinations that fit a thumb-reachable bar. */
export const MOBILE_TABS: DashNavItem[] = [
  { label: 'Overview', href: '/app', icon: LayoutDashboard, end: true },
  { label: 'Portfolio', href: '/app/portfolio', icon: ArrowLeftRight },
  // Was Trade. The trade screen has no order ticket — see `/app/trade` — so a
  // thumb-reachable tab for it pointed at the one screen that cannot do what its
  // name says, while the statement of what actually moved sat behind "More".
  { label: 'Transactions', href: '/app/transactions', icon: Receipt },
  { label: 'Wallet', href: '/app/wallet', icon: Wallet },
];
