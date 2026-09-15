'use client';

import { createContext, useCallback, useContext, useMemo, useReducer } from 'react';
import type { ReactNode } from 'react';
import {
  ACTING_ADMIN, ADMIN_TEAM, ADMIN_USERS, APPROVALS, FEATURE_FLAGS, INCIDENTS,
  LISTINGS, PAYOUTS, SEED_AUDIT, TICKETS,
} from './data';
import type {
  AdminMember, AdminUser, Approval, AuditEntry, FeatureFlag, Incident,
  Listing, Payout, SupportMessage, Ticket,
} from './types';

/**
 * The admin console's single source of truth.
 *
 * Two properties matter more than anything else here:
 *
 * 1. **Every mutation is one reducer action**, so approving a withdrawal on the
 *    approvals screen updates the queue counter on the rail, the throughput on
 *    the command centre, and the audit log — because they all read the same
 *    state, not their own copies.
 * 2. **Every mutation writes an audit entry.** The reducer appends it in the
 *    same transition that changes the record, so there is no path through the
 *    console that mutates something without leaving a trace. Making that
 *    structural rather than a convention is the whole point of a privileged UI.
 */

export interface AdminState {
  approvals: Approval[];
  users: AdminUser[];
  tickets: Ticket[];
  listings: Listing[];
  payouts: Payout[];
  incidents: Incident[];
  flags: FeatureFlag[];
  team: AdminMember[];
  audit: AuditEntry[];
}

export type AdminAction =
  | { type: 'approval/sign'; id: string; actor: string; note?: string }
  | { type: 'approval/reject'; id: string; actor: string; reason: string }
  | { type: 'approval/escalate'; id: string; actor: string }
  | { type: 'user/setState'; id: string; actor: string; state: AdminUser['state']; reason: string }
  | { type: 'user/note'; id: string; actor: string; body: string }
  | { type: 'ticket/assign'; id: string; actor: string }
  | { type: 'ticket/reply'; id: string; actor: string; body: string }
  | { type: 'ticket/resolve'; id: string; actor: string }
  | { type: 'listing/setStatus'; id: string; actor: string; status: Listing['status'] }
  | { type: 'listing/setFees'; id: string; actor: string; makerBps: number; takerBps: number }
  | { type: 'payout/decide'; id: string; actor: string; approve: boolean }
  | { type: 'incident/update'; id: string; actor: string; body: string; state: Incident['state'] }
  | { type: 'flag/toggle'; id: string; actor: string }
  | { type: 'flag/rollout'; id: string; actor: string; rollout: number }
  | { type: 'member/setStatus'; id: string; actor: string; status: AdminMember['status'] };

let auditSeq = 0;

function audit(
  state: AdminState,
  entry: Omit<AuditEntry, 'id' | 'at'>,
): AuditEntry[] {
  auditSeq += 1;
  return [
    { ...entry, id: `aud_live_${auditSeq}`, at: new Date().toISOString() },
    ...state.audit,
  ];
}

const patch = <T extends { id: string }>(list: T[], id: string, update: (item: T) => T): T[] =>
  list.map((item) => (item.id === id ? update(item) : item));

function reducer(state: AdminState, action: AdminAction): AdminState {
  switch (action.type) {
    /**
     * Dual control, enforced in the reducer rather than the button.
     * The first signature is recorded and the record stays pending; only a
     * *different* approver can complete it. Signing twice as one person is not
     * a disabled button — it is a state transition that does not exist.
     */
    case 'approval/sign': {
      const target = state.approvals.find((a) => a.id === action.id);
      if (!target || target.state === 'approved' || target.state === 'rejected') return state;

      const needsSecond = target.requiresDualControl;
      const alreadySigned = target.firstApprover;

      if (needsSecond && !alreadySigned) {
        return {
          ...state,
          approvals: patch(state.approvals, action.id, (a) => ({ ...a, firstApprover: action.actor })),
          audit: audit(state, {
            actor: action.actor,
            action: 'approval.first_signature',
            target: `${target.kind} ${target.id}`,
            detail: `First of two signatures on ${target.asset} ${target.value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}. Awaiting a second approver.`,
            severity: 'notice',
          }),
        };
      }

      if (needsSecond && alreadySigned === action.actor) return state;

      return {
        ...state,
        approvals: patch(state.approvals, action.id, (a) => ({
          ...a,
          state: 'approved',
          secondApprover: needsSecond ? action.actor : undefined,
          firstApprover: a.firstApprover ?? action.actor,
          decidedAt: new Date().toISOString(),
          note: action.note,
        })),
        audit: audit(state, {
          actor: action.actor,
          action: `${target.kind}.approved`,
          target: target.id,
          detail: needsSecond
            ? `Countersigned with ${alreadySigned}. Released ${target.asset} on ${target.network}.`
            : `Released ${target.asset} on ${target.network}.`,
          severity: target.value >= 100_000 ? 'critical' : 'notice',
        }),
      };
    }

    case 'approval/reject':
      return {
        ...state,
        approvals: patch(state.approvals, action.id, (a) => ({
          ...a, state: 'rejected', decidedAt: new Date().toISOString(), note: action.reason,
        })),
        audit: audit(state, {
          actor: action.actor, action: 'approval.rejected', target: action.id,
          detail: action.reason, severity: 'critical',
        }),
      };

    case 'approval/escalate':
      return {
        ...state,
        approvals: patch(state.approvals, action.id, (a) => ({ ...a, state: 'escalated' })),
        audit: audit(state, {
          actor: action.actor, action: 'approval.escalated', target: action.id,
          detail: 'Referred to the compliance queue for manual adjudication.', severity: 'notice',
        }),
      };


    case 'user/setState': {
      const target = state.users.find((u) => u.id === action.id);
      return {
        ...state,
        users: patch(state.users, action.id, (u) => ({ ...u, state: action.state })),
        audit: audit(state, {
          actor: action.actor, action: `user.${action.state}`, target: target?.handle ?? action.id,
          detail: action.reason,
          severity: action.state === 'active' ? 'notice' : 'critical',
        }),
      };
    }

    case 'user/note':
      return {
        ...state,
        users: patch(state.users, action.id, (u) => ({
          ...u,
          notes: [{ id: `n${Date.now()}`, author: action.actor, body: action.body, at: new Date().toISOString() }, ...u.notes],
        })),
        audit: audit(state, {
          actor: action.actor, action: 'user.note_added', target: action.id,
          detail: action.body.slice(0, 120), severity: 'info',
        }),
      };

    case 'ticket/assign':
      return {
        ...state,
        tickets: patch(state.tickets, action.id, (t) => ({ ...t, assignee: action.actor, state: 'open' })),
        audit: audit(state, {
          actor: action.actor, action: 'ticket.assigned', target: action.id,
          detail: 'Conversation claimed.', severity: 'info',
        }),
      };

    case 'ticket/reply': {
      const message: SupportMessage = {
        id: `m_${Date.now()}`,
        from: 'agent',
        author: action.actor,
        body: action.body,
        at: new Date().toISOString(),
      };
      return {
        ...state,
        tickets: patch(state.tickets, action.id, (t) => ({
          ...t,
          messages: [...t.messages, message],
          state: 'pending',
          assignee: t.assignee ?? action.actor,
        })),
        audit: audit(state, {
          actor: action.actor, action: 'ticket.replied', target: action.id,
          detail: action.body.slice(0, 120), severity: 'info',
        }),
      };
    }

    case 'ticket/resolve':
      return {
        ...state,
        tickets: patch(state.tickets, action.id, (t) => ({ ...t, state: 'resolved' })),
        audit: audit(state, {
          actor: action.actor, action: 'ticket.resolved', target: action.id,
          detail: 'Marked resolved.', severity: 'info',
        }),
      };

    case 'listing/setStatus': {
      const target = state.listings.find((l) => l.id === action.id);
      return {
        ...state,
        listings: patch(state.listings, action.id, (l) => ({ ...l, status: action.status })),
        audit: audit(state, {
          actor: action.actor, action: `market.${action.status}`, target: target?.symbol ?? action.id,
          detail: `Market status set to ${action.status}.`,
          severity: action.status === 'live' ? 'notice' : 'critical',
        }),
      };
    }

    case 'listing/setFees': {
      const target = state.listings.find((l) => l.id === action.id);
      return {
        ...state,
        listings: patch(state.listings, action.id, (l) => ({ ...l, makerBps: action.makerBps, takerBps: action.takerBps })),
        audit: audit(state, {
          actor: action.actor, action: 'market.fees_changed', target: target?.symbol ?? action.id,
          detail: `Maker ${action.makerBps} bps, taker ${action.takerBps} bps.`, severity: 'notice',
        }),
      };
    }

    case 'payout/decide':
      return {
        ...state,
        payouts: patch(state.payouts, action.id, (p) => ({ ...p, state: action.approve ? 'approved' : 'held' })),
        audit: audit(state, {
          actor: action.actor, action: action.approve ? 'payout.approved' : 'payout.held',
          target: action.id, detail: action.approve ? 'Released for the next payment run.' : 'Held pending fraud review.',
          severity: action.approve ? 'notice' : 'critical',
        }),
      };

    case 'incident/update':
      return {
        ...state,
        incidents: patch(state.incidents, action.id, (i) => ({
          ...i,
          state: action.state,
          updates: [
            { at: new Date().toISOString().slice(11, 16) + ' UTC', body: action.body, author: action.actor },
            ...i.updates,
          ],
        })),
        audit: audit(state, {
          actor: action.actor, action: `incident.${action.state}`, target: action.id,
          detail: action.body.slice(0, 120), severity: 'notice',
        }),
      };

    case 'flag/toggle': {
      const target = state.flags.find((f) => f.id === action.id);
      return {
        ...state,
        flags: patch(state.flags, action.id, (f) => ({ ...f, enabled: !f.enabled })),
        audit: audit(state, {
          actor: action.actor, action: 'flag.toggled', target: target?.key ?? action.id,
          detail: `Flag ${target?.enabled ? 'disabled' : 'enabled'}.`, severity: 'notice',
        }),
      };
    }

    case 'flag/rollout': {
      const target = state.flags.find((f) => f.id === action.id);
      return {
        ...state,
        flags: patch(state.flags, action.id, (f) => ({ ...f, rollout: action.rollout })),
        audit: audit(state, {
          actor: action.actor, action: 'flag.rollout_changed', target: target?.key ?? action.id,
          detail: `Rollout set to ${action.rollout}%.`, severity: 'info',
        }),
      };
    }

    case 'member/setStatus': {
      const target = state.team.find((m) => m.id === action.id);
      return {
        ...state,
        team: patch(state.team, action.id, (m) => ({ ...m, status: action.status })),
        audit: audit(state, {
          actor: action.actor, action: `admin.${action.status}`, target: target?.email ?? action.id,
          detail: `Administrator ${action.status === 'active' ? 'reinstated' : 'suspended'}.`, severity: 'critical',
        }),
      };
    }

    default:
      return state;
  }
}

/** Deep-enough clones so the seed constants are never mutated by the reducer. */
function initialState(): AdminState {
  return {
    approvals: APPROVALS.map((a) => ({ ...a })),
    users: ADMIN_USERS.map((u) => ({ ...u, notes: [...u.notes] })),
    tickets: TICKETS.map((t) => ({ ...t, messages: [...t.messages] })),
    listings: LISTINGS.map((l) => ({ ...l })),
    payouts: PAYOUTS.map((p) => ({ ...p })),
    incidents: INCIDENTS.map((i) => ({ ...i, updates: [...i.updates] })),
    flags: FEATURE_FLAGS.map((f) => ({ ...f })),
    team: ADMIN_TEAM.map((m) => ({ ...m })),
    audit: [...SEED_AUDIT],
  };
}

/**
 * `Omit` over a union collapses to the keys every member shares, which would
 * erase `note`, `reason` and friends. Distributing over the union first keeps
 * each variant's own payload intact while making `actor` optional.
 */
type WithOptionalActor<T> = T extends { actor: string }
  ? Omit<T, 'actor'> & { actor?: string }
  : T;

export type AdminCommand = WithOptionalActor<AdminAction>;

interface AdminContextValue {
  state: AdminState;
  /** Dispatch with the acting administrator already attached. */
  run: (command: AdminCommand) => void;
  actor: string;
  /** Counts read from the database, overriding the fixture for those queues. */
  counted: QueueCounts;
}

/**
 * Real queue sizes, supplied by the server layout.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────────
 * The rest of this store is a reducer over fixtures, and most screens it feeds are
 * still fixtures. Approvals is not: that queue is backed by the ledger, and the
 * command centre and the approvals page both read it for real. A badge still
 * counting the fixture would have said twenty-two on the rail while the page next
 * to it said two — and the guarantee in `navigation.ts`, that a badge cannot drift
 * from the data, would have been exactly backwards.
 *
 * So a queue moves into this type when the module behind it becomes real, and its
 * fixture stops being consulted. The ones absent from it are still fixtures on
 * both sides, which is at least self-consistent.
 */
export type QueueCounts = Partial<
  Record<'approvals' | 'tickets' | 'kyc' | 'surveillance', number>
>;

const AdminContext = createContext<AdminContextValue | null>(null);

export function AdminProvider({
  children,
  counted = {},
}: {
  children: ReactNode;
  counted?: QueueCounts;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const actor = ACTING_ADMIN.name;

  const run = useCallback<AdminContextValue['run']>(
    (command) => dispatch({ actor, ...command } as AdminAction),
    [actor],
  );

  // Depended on by value, not by identity: `counted` arrives as a fresh object
  // literal from the server on every render, so memoising against the object
  // itself would rebuild the context each time and defeat the memo entirely.
  const countedApprovals = counted.approvals;
  const countedTickets = counted.tickets;
  const countedKyc = counted.kyc;
  const countedSurveillance = counted.surveillance;
  const value = useMemo(
    () => ({
      state,
      run,
      actor,
      counted: {
        approvals: countedApprovals,
        tickets: countedTickets,
        kyc: countedKyc,
        surveillance: countedSurveillance,
      },
    }),
    [state, run, actor, countedApprovals, countedTickets, countedKyc, countedSurveillance],
  );
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminContextValue {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used inside <AdminProvider>');
  return ctx;
}

/** Queue sizes the rail badges and the command centre both read. */
export function useQueues() {
  const { state, counted } = useAdmin();
  return useMemo(
    () => ({
      // The real count whenever the server supplied one. Zero is a legitimate
      // answer and must win over the fixture, so this tests for `undefined`
      // rather than falling back with `??` on a falsy number.
      approvals:
        counted.approvals !== undefined
          ? counted.approvals
          : state.approvals.filter((a) => a.state === 'pending' || a.state === 'escalated').length,
      awaitingSecond: state.approvals.filter((a) => a.state === 'pending' && a.firstApprover).length,
      // Real now, both of them. Zero is a legitimate answer and must beat the
      // fixture, so this tests for `undefined` rather than falling back with
      // `??` on a falsy number.
      kyc: counted.kyc !== undefined ? counted.kyc : 0,
      tickets:
        counted.tickets !== undefined
          ? counted.tickets
          : state.tickets.filter((t) => t.state !== 'resolved').length,
      surveillance: counted.surveillance !== undefined ? counted.surveillance : 0,
      payouts: state.payouts.filter((p) => p.state !== 'approved').length,
      listings: state.listings.filter((l) => l.status === 'review').length,
      incidents: state.incidents.filter((i) => i.state !== 'resolved').length,
    }),
    [state, counted],
  );
}
