import type { LucideIcon } from 'lucide-react';
import {
  Activity, BadgeCheck, Building2, CandlestickChart, Coins, FileClock, Gauge, Gift,
  Headset, Megaphone, Percent, ScrollText, ShieldAlert, Users, Wallet,
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
      { label: 'Approvals', href: '/admin/approvals', icon: BadgeCheck, queue: 'approvals' },
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
  {
    heading: 'Markets',
    items: [
      { label: 'Listings', href: '/admin/listings', icon: CandlestickChart, queue: 'listings' },
      { label: 'Fees & tiers', href: '/admin/fees', icon: Percent },
      { label: 'Staking', href: '/admin/staking', icon: Coins },
    ],
  },
  {
    heading: 'Platform',
    items: [
      { label: 'Treasury', href: '/admin/treasury', icon: Wallet },
      { label: 'Referral payouts', href: '/admin/payouts', icon: Gift, queue: 'payouts' },
      { label: 'Announcements', href: '/admin/announcements', icon: Megaphone },
    ],
  },
  {
    heading: 'System',
    items: [
      { label: 'Health & flags', href: '/admin/system', icon: Activity, queue: 'incidents' },
      { label: 'Audit log', href: '/admin/audit', icon: ScrollText },
      { label: 'Admin team', href: '/admin/team', icon: Building2 },
    ],
  },
];
