import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck, Building2, FileClock, Gauge,
  Headset, Megaphone, Radar, Receipt, ScrollText, ShieldAlert, Users,
  // Needed again by the entries commented out below — Markets, Treasury,
  // Referral payouts and Health & flags. Kept here rather than deleted so
  // re-enabling one of those is uncommenting two lines instead of hunting for the
  // icon it wanted.
  // Activity, CandlestickChart, Coins, Gift, Percent, Wallet,
} from 'lucide-react';

/** Queue keys map onto `useQueues()` so a badge can never drift from the data. */
export type QueueKey =
  | 'approvals' | 'kyc' | 'tickets' | 'surveillance' | 'payouts' | 'listings' | 'incidents';

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  queue?: QueueKey;
  end?: boolean;
}

export interface AdminNavGroup {
  heading: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    heading: 'Operations',
    items: [
      { label: 'Command centre', href: '/admin', icon: Gauge, end: true },
      /* No `queue` key: the others carry a count of things waiting for a decision,
         and "how many people are on the site" is not a queue. A badge here would
         read as work outstanding and never reach zero. */
      { label: 'Live activity', href: '/admin/live', icon: Radar },
      { label: 'Approvals', href: '/admin/approvals', icon: BadgeCheck, queue: 'approvals' },
      /* No `queue` key, for the reason 'Live activity' has none: this is a history,
         not a list of things outstanding, and a badge that counted every
         transaction ever would never reach zero. */
      { label: 'Transactions', href: '/admin/transactions', icon: Receipt },
      { label: 'Live support', href: '/admin/support', icon: Headset, queue: 'tickets' },
    ],
  },
  {
    heading: 'Compliance',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'KYC review', href: '/admin/kyc', icon: FileClock, queue: 'kyc' },
      { label: 'Surveillance', href: '/admin/surveillance', icon: ShieldAlert, queue: 'surveillance' },
    ],
  },
  // {
  //   heading: 'Markets',
  //   items: [
  //     { label: 'Listings', href: '/admin/listings', icon: CandlestickChart, queue: 'listings' },
  //     { label: 'Fees & tiers', href: '/admin/fees', icon: Percent },
  //     { label: 'Staking', href: '/admin/staking', icon: Coins },
  //   ],
  // },
  {
    heading: 'Platform',
    items: [
      // { label: 'Treasury', href: '/admin/treasury', icon: Wallet },
      // { label: 'Referral payouts', href: '/admin/payouts', icon: Gift, queue: 'payouts' },
      { label: 'Announcements', href: '/admin/announcements', icon: Megaphone },
    ],
  },
  {
    heading: 'System',
    items: [
      // { label: 'Health & flags', href: '/admin/system', icon: Activity, queue: 'incidents' },
      { label: 'Audit log', href: '/admin/audit', icon: ScrollText },
      { label: 'Admin team', href: '/admin/team', icon: Building2 },
    ],
  },
];
