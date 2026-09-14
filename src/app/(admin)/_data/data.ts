import { ASSETS } from '../../_console/data/assets';
import { cycle, hashSeed, pick, seededRandom } from '../../_console/data/simulation';
import { NOW } from '../../_console/data/series';
import type {
  AdminMember, AdminUser, Announcement, Approval, AuditEntry, FeatureFlag, Incident,
  Listing, Payout, Risk, SupportMessage, Ticket, TreasuryWallet, Validator,
} from './types';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** The operator this console is acting as. Every mutation is attributed to them. */
export const ACTING_ADMIN = {
  name: 'Marcus Vogel',
  email: 'marcus.vogel@novex.io',
  initials: 'MV',
  hue: '#22D3EE',
  role: 'Owner' as const,
  /** Policy: a second, different approver above this notional. */
  dualControlThreshold: 100_000,
};

const HANDLES = ['@amara', '@dreyes', '@sofia.l', '@tolu_a', '@priya.r', '@jkim', '@lena.w',
  '@omar.s', '@nkechi', '@bfrost', '@mtanaka', '@ivo.k', '@rsantos', '@hchen', '@aoife.d'];
const NAMES = ['Amara Okonkwo', 'Daniel Reyes', 'Sofia Lindqvist', 'Tolu Adeyemi', 'Priya Raman',
  'Jae Kim', 'Lena Weber', 'Omar Said', 'Nkechi Eze', 'Ben Frost', 'Mai Tanaka', 'Ivo Kovac',
  'Rui Santos', 'Hui Chen', 'Aoife Doyle'];
const COUNTRIES = ['NG', 'CH', 'SE', 'NG', 'IN', 'KR', 'DE', 'AE', 'NG', 'GB', 'JP', 'HR', 'PT', 'SG', 'IE'];
const HUES = ['#8B5CF6', '#22D3EE', '#E879F9', '#34D399', '#FBBF24', '#FB7185', '#60A5FA', '#2DD4BF'];

const initials = (name: string) =>
  name
    .split(' ')
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();

export const ADMIN_USERS: AdminUser[] = HANDLES.map((handle, i) => {
  const rand = seededRandom(hashSeed(`user-${handle}`));
  const balance = Math.round(rand() * 480_000);
  return {
    id: `usr_${(100_000 + i * 977).toString(36)}`,
    handle,
    name: cycle(NAMES, i),
    email: `${handle.replace('@', '')}@example.com`,
    country: cycle(COUNTRIES, i),
    tier: balance > 300_000 ? 'Platinum' : balance > 80_000 ? 'Gold' : balance > 20_000 ? 'Silver' : 'Base',
    joined: new Date(NOW - (200 + i * 63) * DAY).toISOString(),
    balance,
    volume30d: Math.round(rand() * 2_400_000),
    openOrders: Math.floor(rand() * 9),
    riskScore: Math.round(rand() * 100),
    initials: initials(cycle(NAMES, i)),
    hue: cycle(HUES, i),
    state: i === 6 ? 'restricted' : i === 11 ? 'frozen' : 'active',
    kyc: i === 3 ? 'review' : i === 9 ? 'pending' : i === 13 ? 'rejected' : 'verified',
    notes: i === 6
      ? [{ id: 'n1', author: 'Compliance', body: 'Restricted pending source-of-funds review on a €180k inbound transfer.', at: new Date(NOW - 2 * DAY).toISOString() }]
      : [],
  };
});

export const USER_BY_ID = new Map(ADMIN_USERS.map((u) => [u.id, u]));

const SIGNAL_POOL: { label: string; detail: string; severity: Risk }[] = [
  { label: 'New destination address', detail: 'First withdrawal to this address; added 4 hours ago.', severity: 'medium' },
  { label: 'Sanctions screening clear', detail: 'No match against OFAC, EU or UN consolidated lists.', severity: 'low' },
  { label: 'Chain analytics: mixer exposure', detail: 'Destination has 2 hops to a sanctioned mixer.', severity: 'critical' },
  { label: 'Velocity anomaly', detail: 'Fourth withdrawal in 90 minutes, 8× the 30-day mean.', severity: 'high' },
  { label: 'Device recognised', detail: 'Same device and IP as the last 40 sessions.', severity: 'low' },
  { label: 'Login from new country', detail: 'Session opened from a country not seen before.', severity: 'high' },
  { label: 'Withdrawal allow-list', detail: 'Address has been on the allow-list for 62 days.', severity: 'low' },
  { label: 'Account age', detail: 'Account opened 11 days ago.', severity: 'medium' },
];

const RISK_ORDER: Risk[] = ['low', 'medium', 'high', 'critical'];

export const APPROVALS: Approval[] = (() => {
  const rand = seededRandom(hashSeed('approvals'));
  const networks = ['Bitcoin', 'Ethereum', 'Solana', 'Base', 'Arbitrum', 'SEPA Instant', 'NIP', 'SWIFT'];
  return Array.from({ length: 22 }, (_, i) => {
    const kind = rand() > 0.42 ? 'withdrawal' : 'deposit';
    const asset = pick(ASSETS.slice(0, 10), rand);
    const value = Math.round((900 + rand() ** 2 * 480_000) * 100) / 100;
    const score = Math.round(rand() * 100);
    const risk = cycle(RISK_ORDER, score > 88 ? 3 : score > 66 ? 2 : score > 34 ? 1 : 0);
    const signalCount = 2 + Math.floor(rand() * 3);
    const signals = Array.from({ length: signalCount }, (_, s) => cycle(SIGNAL_POOL, i * 3 + s));
    return {
      id: `apr_${(500_000 + i * 613).toString(36)}`,
      kind,
      userId: cycle(ADMIN_USERS, i).id,
      asset: asset.symbol,
      quantity: value / asset.price,
      value,
      network: pick(networks, rand),
      destination: kind === 'withdrawal'
        ? `0x${Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0')}…${Math.floor(rand() * 0xffff).toString(16).padStart(4, '0')}`
        : 'Novex custody',
      submittedAt: new Date(NOW - i * 47 * 60_000 - rand() * HOUR).toISOString(),
      risk,
      riskScore: score,
      signals,
      requiresDualControl: value >= ACTING_ADMIN.dualControlThreshold,
      state: score > 88 ? 'escalated' : 'pending',
    } satisfies Approval;
  });
})();

const CUSTOMER_OPENERS = [
  'My SEPA deposit has not landed after two hours — reference NVX-8841. Can you check?',
  'I cannot enable a passkey on my new phone. The QR step just spins.',
  'Why was my withdrawal to a new address held for 24 hours? I need it today.',
  'The fee on my last fill looks like taker, but I submitted a post-only order.',
  'I staked SOL yesterday and the rewards line still shows zero.',
  'Can you confirm which tax export format I should use for Germany?',
  'My API key is returning 401 after the key rotation email. Did the prefix change?',
];
const SUBJECTS = [
  'SEPA deposit not credited', 'Passkey enrolment fails', 'Withdrawal hold on new address',
  'Post-only order charged taker fee', 'Staking rewards not accruing',
  'Tax export format for Germany', 'API key 401 after rotation',
];
const TAGS = [['deposits', 'sepa'], ['auth', 'passkey'], ['withdrawals', 'security'],
  ['trading', 'fees'], ['earn'], ['reporting', 'tax'], ['api', 'auth']];

export const TICKETS: Ticket[] = SUBJECTS.map((subject, i) => {
  const rand = seededRandom(hashSeed(`ticket-${i}`));
  const user = cycle(ADMIN_USERS, i);
  const openedAt = NOW - i * 38 * 60_000 - rand() * HOUR;
  const messages: SupportMessage[] = [
    {
      id: `m${i}-1`,
      from: 'customer',
      author: user.name,
      body: cycle(CUSTOMER_OPENERS, i),
      at: new Date(openedAt).toISOString(),
    },
  ];
  if (i > 1) {
    messages.push({
      id: `m${i}-2`,
      from: 'agent',
      author: 'Support · Lena',
      body: 'Thanks for flagging — I can see the account. Give me two minutes to pull the ledger entry.',
      at: new Date(openedAt + 4 * 60_000).toISOString(),
    });
  }
  if (i > 3) {
    messages.push({
      id: `m${i}-3`,
      from: 'customer',
      author: user.name,
      body: 'Appreciated. Standing by.',
      at: new Date(openedAt + 6 * 60_000).toISOString(),
    });
  }
  return {
    id: `tkt_${(900_000 + i * 331).toString(36)}`,
    userId: user.id,
    subject,
    channel: i % 3 === 0 ? 'email' : 'chat',
    priority: i === 0 ? 'urgent' : i < 3 ? 'high' : i < 5 ? 'normal' : 'low',
    openedAt: new Date(openedAt).toISOString(),
    tags: cycle(TAGS, i),
    state: i < 4 ? 'open' : i === 4 ? 'pending' : 'resolved',
    assignee: i < 2 ? 'Lena Weber' : undefined,
    messages,
    online: i < 3,
  } satisfies Ticket;
});

export const CANNED_REPLIES = [
  { id: 'c1', label: 'Deposit tracing', body: 'I have opened a trace with our banking partner. SEPA Instant credits normally settle in under two minutes; when they do not, the reference is usually held upstream. I will update you the moment it moves, and no fee applies to the retry.' },
  { id: 'c2', label: 'Withdrawal hold', body: 'New withdrawal addresses are held for 24 hours before their first outbound transfer. It is the single control that has prevented the most account-takeover losses on the platform, and we cannot lift it on request — including for you, which is exactly what makes it work.' },
  { id: 'c3', label: 'Post-only clarification', body: 'A post-only order is rejected rather than filled if it would cross the spread, so it can never be charged the taker rate. Let me pull the fill and check whether the order was converted before it rested.' },
  { id: 'c4', label: 'Escalate to engineering', body: 'This looks like a defect rather than a configuration issue. I am escalating it to the engineering on-call with your session details attached, and I will stay on this thread with you.' },
];

export const LISTINGS: Listing[] = ASSETS.slice(0, 16).map((asset, i) => ({
  id: `lst_${asset.id}`,
  symbol: asset.symbol,
  name: asset.name,
  hue: asset.hue,
  glyph: asset.glyph,
  category: asset.category,
  volume24h: asset.volume24h,
  listedOn: new Date(NOW - (120 + i * 41) * DAY).toISOString(),
  makerBps: 2,
  takerBps: 10,
  status: i === 11 ? 'paused' : i === 14 ? 'review' : 'live',
}));

export const TREASURY: TreasuryWallet[] = ASSETS.slice(0, 8).flatMap((asset, i) => {
  const rand = seededRandom(hashSeed(`treasury-${asset.id}`));
  const coldBalance = (rand() + 0.4) * (asset.supply * 0.0009);
  const hotBalance = coldBalance * 0.021;
  return [
    {
      id: `tw_${asset.id}_cold`,
      label: `${asset.symbol} cold vault`,
      asset: asset.symbol,
      hue: asset.hue,
      glyph: asset.glyph,
      custody: 'cold' as const,
      balance: coldBalance,
      value: coldBalance * asset.price,
      threshold: 0.98,
      region: cycle(['Zurich', 'Singapore', 'Toronto'], i),
    },
    {
      id: `tw_${asset.id}_hot`,
      label: `${asset.symbol} hot float`,
      asset: asset.symbol,
      hue: asset.hue,
      glyph: asset.glyph,
      custody: 'hot' as const,
      balance: hotBalance,
      value: hotBalance * asset.price,
      threshold: 0.02,
      region: 'Multi-region',
    },
  ];
});

export const VALIDATORS: Validator[] = [
  { id: 'v1', asset: 'ETH', name: 'novex-eth-01', uptime: 99.98, commission: 8, delegated: 184_200, missedBlocks: 3, status: 'healthy' },
  { id: 'v2', asset: 'SOL', name: 'novex-sol-01', uptime: 99.91, commission: 8, delegated: 2_410_000, missedBlocks: 41, status: 'healthy' },
  { id: 'v3', asset: 'SOL', name: 'novex-sol-02', uptime: 97.42, commission: 8, delegated: 1_180_000, missedBlocks: 612, status: 'degraded' },
  { id: 'v4', asset: 'ATOM', name: 'novex-atom-01', uptime: 99.99, commission: 8, delegated: 940_000, missedBlocks: 1, status: 'healthy' },
  { id: 'v5', asset: 'DOT', name: 'novex-dot-01', uptime: 99.87, commission: 8, delegated: 610_000, missedBlocks: 12, status: 'healthy' },
  { id: 'v6', asset: 'TAO', name: 'novex-tao-01', uptime: 88.10, commission: 8, delegated: 24_800, missedBlocks: 1_842, status: 'jailed' },
];

export const PAYOUTS: Payout[] = (() => {
  const rand = seededRandom(hashSeed('payouts'));
  return HANDLES.slice(0, 10).map((handle, i) => {
    const flagged = i === 2 || i === 7;
    return {
      id: `pay_${(400_000 + i * 173).toString(36)}`,
      handle,
      period: 'August 2026',
      amount: Math.round(rand() * 42_000 * 100) / 100,
      referrals: 1 + Math.floor(rand() * 180),
      flagged,
      flagReason: flagged
        ? i === 2
          ? 'Self-referral suspected — 14 accounts share a device fingerprint.'
          : 'Brand-term paid search detected on three ad platforms.'
        : undefined,
      state: flagged ? 'held' : 'pending',
    } satisfies Payout;
  });
})();

export const INCIDENTS: Incident[] = [
  {
    id: 'inc_1', title: 'Elevated latency on SEPA Instant deposits', service: 'Fiat rails', severity: 'sev3',
    openedAt: new Date(NOW - 5 * HOUR).toISOString(), state: 'monitoring',
    updates: [
      { at: '14:20 UTC', body: 'Banking partner confirms the upstream fix is deployed. Monitoring settlement times.', author: 'Marcus Vogel' },
      { at: '12:05 UTC', body: 'Deposits completing in 8–20 minutes rather than the usual 2. No funds at risk.', author: 'Ops on-call' },
    ],
  },
  {
    id: 'inc_2', title: 'Validator novex-tao-01 jailed', service: 'Staking', severity: 'sev2',
    openedAt: new Date(NOW - 26 * HOUR).toISOString(), state: 'investigating',
    updates: [
      { at: '09:40 UTC', body: 'Delegations rerouted to novex-tao-02. Slashing shield covers the affected epoch.', author: 'Treasury' },
      { at: '08:15 UTC', body: 'Validator jailed after 1,842 missed blocks. Root cause under investigation.', author: 'Ops on-call' },
    ],
  },
];

export const FEATURE_FLAGS: FeatureFlag[] = [
  { id: 'f1', key: 'terminal.depth_v2', description: 'New market-depth renderer on the trading terminal.', owner: 'Trading', rollout: 25, enabled: true },
  { id: 'f2', key: 'earn.auto_compound', description: 'Automatically restake rewards on eligible assets.', owner: 'Earn', rollout: 100, enabled: true },
  { id: 'f3', key: 'kyc.instant_reverify', description: 'Skip re-verification when a document is under 90 days old.', owner: 'Compliance', rollout: 10, enabled: true },
  { id: 'f4', key: 'wallet.mpc_recovery_v3', description: 'Third recovery shard assigned to a trusted contact.', owner: 'Wallet', rollout: 0, enabled: false },
  { id: 'f5', key: 'support.ai_draft', description: 'Suggest a first-response draft to the agent.', owner: 'Support', rollout: 50, enabled: true },
];

export const ANNOUNCEMENTS: Announcement[] = [
  { id: 'ann_1', title: 'Novex Earn is live', body: 'Stake 38 assets at up to 12.4% APY, with rewards paid daily.', surface: 'Banner', updatedAt: new Date(NOW - 3 * DAY).toISOString(), author: 'Marketing', state: 'published' },
  { id: 'ann_2', title: 'Scheduled maintenance — staking distribution', body: 'Validator set rotation for three networks on 11 September, 02:00 UTC.', surface: 'Status page', updatedAt: new Date(NOW - DAY).toISOString(), author: 'Ops', state: 'scheduled' },
  { id: 'ann_3', title: 'Fee schedule update', body: 'Prime tier maker rebate improves to −0.006% from 1 October.', surface: 'Email', updatedAt: new Date(NOW - 6 * HOUR).toISOString(), author: 'Marcus Vogel', state: 'draft' },
  { id: 'ann_4', title: 'New market: ONDO-USD', body: 'Ondo lists on 4 September with a published risk review.', surface: 'In-app', updatedAt: new Date(NOW - 2 * DAY).toISOString(), author: 'Listings', state: 'published' },
];

export const ADMIN_TEAM: AdminMember[] = [
  { id: 'a1', name: 'Marcus Vogel', email: 'marcus.vogel@novex.io', initials: 'MV', hue: '#22D3EE', role: 'Owner', lastActive: 'Now', mfa: 'Hardware key', status: 'active' },
  { id: 'a2', name: 'Priya Raman', email: 'priya.raman@novex.io', initials: 'PR', hue: '#8B5CF6', role: 'Compliance', lastActive: '12 minutes ago', mfa: 'Hardware key', status: 'active' },
  { id: 'a3', name: 'Lena Weber', email: 'lena.weber@novex.io', initials: 'LW', hue: '#E879F9', role: 'Support', lastActive: '2 minutes ago', mfa: 'Passkey', status: 'active' },
  { id: 'a4', name: 'Rui Santos', email: 'rui.santos@novex.io', initials: 'RS', hue: '#34D399', role: 'Treasury', lastActive: '1 hour ago', mfa: 'Hardware key', status: 'active' },
  { id: 'a5', name: 'Hui Chen', email: 'hui.chen@novex.io', initials: 'HC', hue: '#FBBF24', role: 'Engineer', lastActive: '4 hours ago', mfa: 'Passkey', status: 'active' },
  { id: 'a6', name: 'Ben Frost', email: 'ben.frost@novex.io', initials: 'BF', hue: '#FB7185', role: 'Read-only', lastActive: '3 days ago', mfa: 'TOTP', status: 'suspended' },
];

/** Which role may take which action. The console reads this, it is not decorative. */
export const PERMISSION_MATRIX: { capability: string; roles: Record<string, boolean> }[] = [
  { capability: 'View dashboards', roles: { Owner: true, Compliance: true, Support: true, Treasury: true, Engineer: true, 'Read-only': true } },
  { capability: 'Approve deposits', roles: { Owner: true, Compliance: true, Support: false, Treasury: true, Engineer: false, 'Read-only': false } },
  { capability: 'Approve withdrawals', roles: { Owner: true, Compliance: true, Support: false, Treasury: true, Engineer: false, 'Read-only': false } },
  { capability: 'Adjudicate KYC', roles: { Owner: true, Compliance: true, Support: false, Treasury: false, Engineer: false, 'Read-only': false } },
  { capability: 'Freeze an account', roles: { Owner: true, Compliance: true, Support: false, Treasury: false, Engineer: false, 'Read-only': false } },
  { capability: 'Reply to customers', roles: { Owner: true, Compliance: true, Support: true, Treasury: false, Engineer: false, 'Read-only': false } },
  { capability: 'Pause a market', roles: { Owner: true, Compliance: true, Support: false, Treasury: false, Engineer: true, 'Read-only': false } },
  { capability: 'Move treasury funds', roles: { Owner: true, Compliance: false, Support: false, Treasury: true, Engineer: false, 'Read-only': false } },
  { capability: 'Edit fee schedule', roles: { Owner: true, Compliance: false, Support: false, Treasury: true, Engineer: false, 'Read-only': false } },
  { capability: 'Toggle feature flags', roles: { Owner: true, Compliance: false, Support: false, Treasury: false, Engineer: true, 'Read-only': false } },
  { capability: 'Publish announcements', roles: { Owner: true, Compliance: true, Support: false, Treasury: false, Engineer: false, 'Read-only': false } },
  { capability: 'Manage admin team', roles: { Owner: true, Compliance: false, Support: false, Treasury: false, Engineer: false, 'Read-only': false } },
];

export const SEED_AUDIT: AuditEntry[] = [
  { id: 'aud_1', at: new Date(NOW - 22 * 60_000).toISOString(), actor: 'Priya Raman', action: 'kyc.approved', target: 'kyc_f2l1', detail: 'Document verified, no sanctions match.', severity: 'info' },
  { id: 'aud_2', at: new Date(NOW - 51 * 60_000).toISOString(), actor: 'Rui Santos', action: 'treasury.rebalanced', target: 'BTC hot float', detail: 'Moved 14.2 BTC from hot to cold; float back under the 2% ceiling.', severity: 'notice' },
  { id: 'aud_3', at: new Date(NOW - 2 * HOUR).toISOString(), actor: 'Marcus Vogel', action: 'user.frozen', target: '@ivo.k', detail: 'Frozen pending law-enforcement request LE-2026-0841.', severity: 'critical' },
  { id: 'aud_4', at: new Date(NOW - 3 * HOUR).toISOString(), actor: 'Hui Chen', action: 'flag.rollout_changed', target: 'terminal.depth_v2', detail: 'Rollout raised from 10% to 25%.', severity: 'info' },
  { id: 'aud_5', at: new Date(NOW - 5 * HOUR).toISOString(), actor: 'Lena Weber', action: 'ticket.resolved', target: 'tkt_j2p4', detail: 'Tax export format confirmed for the customer.', severity: 'info' },
  { id: 'aud_6', at: new Date(NOW - 8 * HOUR).toISOString(), actor: 'System', action: 'reserves.published', target: 'Merkle root 0x9f2c…80cb', detail: 'Daily proof-of-reserves attestation published. Ratio 104.2%.', severity: 'notice' },
];

/* --- Platform-level series for the command centre ------------------------
 *
 * Deleted, not merely unused: `PLATFORM_VOLUME` (a $41.2B seeded random walk),
 * `PLATFORM_USERS` (41.2 million of them) and `APPROVAL_THROUGHPUT`. The command
 * centre counts all three from the database now, and a constant named
 * PLATFORM_VOLUME left sitting here is an invitation to wire it back into a screen
 * where a reader would take it for a measurement.
 *
 * `SERVICE_HEALTH` below survives because `/admin/system` still renders it, and
 * that page is still a fixture end to end.
 * ------------------------------------------------------------------------ */

export const SERVICE_HEALTH = [
  { name: 'Matching engine', uptime: 99.997, latencyMs: 0.9, status: 'operational' as const },
  { name: 'REST API', uptime: 99.994, latencyMs: 41, status: 'operational' as const },
  { name: 'WebSocket streams', uptime: 99.981, latencyMs: 12, status: 'operational' as const },
  { name: 'Fiat rails', uptime: 99.912, latencyMs: 640, status: 'degraded' as const },
  { name: 'On-chain withdrawals', uptime: 99.988, latencyMs: 3_200, status: 'operational' as const },
  { name: 'Staking distribution', uptime: 99.971, latencyMs: 180, status: 'maintenance' as const },
];
