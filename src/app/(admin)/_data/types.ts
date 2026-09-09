export type Risk = 'low' | 'medium' | 'high' | 'critical';
export type ApprovalKind = 'deposit' | 'withdrawal';
export type ApprovalState = 'pending' | 'escalated' | 'approved' | 'rejected';

export interface RiskSignal {
  readonly label: string;
  readonly detail: string;
  readonly severity: Risk;
}

export interface Approval {
  readonly id: string;
  readonly kind: ApprovalKind;
  readonly userId: string;
  readonly asset: string;
  readonly quantity: number;
  readonly value: number;
  readonly network: string;
  readonly destination: string;
  readonly submittedAt: string;
  readonly risk: Risk;
  readonly riskScore: number;
  readonly signals: readonly RiskSignal[];
  /** Above this notional a second approver is required by policy. */
  readonly requiresDualControl: boolean;
  state: ApprovalState;
  firstApprover?: string;
  secondApprover?: string;
  decidedAt?: string;
  note?: string;
}

export type UserState = 'active' | 'restricted' | 'frozen' | 'closed';
export type KycState = 'verified' | 'pending' | 'review' | 'rejected' | 'unverified';

export interface AdminUser {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly email: string;
  readonly country: string;
  readonly tier: string;
  readonly joined: string;
  readonly balance: number;
  readonly volume30d: number;
  readonly openOrders: number;
  readonly riskScore: number;
  readonly initials: string;
  readonly hue: string;
  state: UserState;
  kyc: KycState;
  notes: { id: string; author: string; body: string; at: string }[];
}

export type CaseState = 'unassigned' | 'in_review' | 'approved' | 'rejected';

export interface KycCase {
  readonly id: string;
  readonly userId: string;
  readonly document: 'Passport' | 'National ID' | "Driver's licence";
  readonly submittedAt: string;
  readonly country: string;
  readonly checks: { label: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
  readonly sanctionsHits: number;
  readonly pepMatch: boolean;
  state: CaseState;
  assignee?: string;
  decidedAt?: string;
}

export type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TicketState = 'open' | 'pending' | 'resolved';

export interface SupportMessage {
  readonly id: string;
  readonly from: 'customer' | 'agent' | 'system';
  readonly author: string;
  readonly body: string;
  readonly at: string;
}

export interface Ticket {
  readonly id: string;
  readonly userId: string;
  readonly subject: string;
  readonly channel: 'chat' | 'email';
  readonly priority: TicketPriority;
  readonly openedAt: string;
  readonly tags: readonly string[];
  state: TicketState;
  assignee?: string;
  messages: SupportMessage[];
  /** Live chats show a typing indicator until the customer stops. */
  readonly online: boolean;
}

export interface Listing {
  readonly id: string;
  readonly symbol: string;
  readonly name: string;
  readonly hue: string;
  readonly glyph: string;
  readonly category: string;
  readonly volume24h: number;
  readonly listedOn: string;
  readonly makerBps: number;
  readonly takerBps: number;
  status: 'live' | 'paused' | 'delisted' | 'review';
}

export interface SurveillanceAlert {
  readonly id: string;
  readonly pattern: 'Wash trading' | 'Spoofing' | 'Layering' | 'Ramping' | 'Cross-account';
  readonly market: string;
  readonly userId: string;
  readonly detectedAt: string;
  readonly confidence: number;
  readonly notional: number;
  readonly severity: Risk;
  state: 'open' | 'cleared' | 'escalated';
}

export interface TreasuryWallet {
  readonly id: string;
  readonly label: string;
  readonly asset: string;
  readonly hue: string;
  readonly glyph: string;
  readonly custody: 'cold' | 'hot' | 'warm';
  readonly balance: number;
  readonly value: number;
  readonly threshold: number;
  readonly region: string;
}

export interface Validator {
  readonly id: string;
  readonly asset: string;
  readonly name: string;
  readonly uptime: number;
  readonly commission: number;
  readonly delegated: number;
  readonly missedBlocks: number;
  status: 'healthy' | 'degraded' | 'jailed';
}

export interface Payout {
  readonly id: string;
  readonly handle: string;
  readonly period: string;
  readonly amount: number;
  readonly referrals: number;
  readonly flagged: boolean;
  readonly flagReason?: string;
  state: 'pending' | 'approved' | 'held';
}

export interface Incident {
  readonly id: string;
  readonly title: string;
  readonly service: string;
  readonly severity: 'sev1' | 'sev2' | 'sev3' | 'maintenance';
  readonly openedAt: string;
  readonly updates: { at: string; body: string; author: string }[];
  state: 'investigating' | 'monitoring' | 'resolved';
}

export interface FeatureFlag {
  readonly id: string;
  readonly key: string;
  readonly description: string;
  readonly owner: string;
  rollout: number;
  enabled: boolean;
}

export interface Announcement {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly surface: 'Banner' | 'Status page' | 'Email' | 'In-app';
  readonly updatedAt: string;
  readonly author: string;
  state: 'draft' | 'scheduled' | 'published';
}

export type AdminRole = 'Owner' | 'Compliance' | 'Support' | 'Treasury' | 'Engineer' | 'Read-only';

export interface AdminMember {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly initials: string;
  readonly hue: string;
  readonly role: AdminRole;
  readonly lastActive: string;
  readonly mfa: 'Hardware key' | 'Passkey' | 'TOTP';
  status: 'active' | 'suspended';
}

export interface AuditEntry {
  readonly id: string;
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly detail: string;
  readonly severity: 'info' | 'notice' | 'critical';
}
