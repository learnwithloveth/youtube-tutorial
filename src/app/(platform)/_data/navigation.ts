import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight, Bell, CandlestickChart, LayoutDashboard,
  Inbox, Receipt, Settings, Wallet,
  // Needed again by the entries commented out below. Parked here rather than
  // deleted so re-enabling one is uncommenting two lines, not hunting for the icon
  // it wanted. Same arrangement in the admin nav.
  // Coins, Gift, Repeat,
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
  { label: 'Trade', href: '/app/trade', icon: CandlestickChart },
  { label: 'Wallet', href: '/app/wallet', icon: Wallet },
];
