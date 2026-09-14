import { logger } from '@/platform/observability/logger';

import {
  REFUSAL_THRESHOLD,
  RETRY_WINDOW_HOURS,
  RISK_RULES,
  SEVERITY_ORDER,
  VELOCITY_THRESHOLD,
  VELOCITY_WINDOW_HOURS,
  type RiskRule,
  type RiskSeverity,
} from '../../domain/risk-signal';
import type { LedgerDependencies, RiskDisposition } from '../ports';

/**
 * The surveillance console's read.
 *
 * Findings are **derived on every read**, never stored. A stored alert table drifts
 * from the rows it was derived from — a withdrawal gets rejected, the alert stays
 * open, and an operator works a queue describing a world that has moved on. Deriving
 * means the list is always a statement about the ledger as it is now.
 *
 * What *is* stored is the disposition: whether somebody looked and what they
 * decided. See `RiskDispositionStore` for why that is keyed on the evidence rather
 * than on the rule.
 */

export interface RiskSignalDto {
  readonly key: string;
  readonly rule: RiskRule;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly severity: RiskSeverity;
  readonly subjects: readonly string[];
  readonly evidence: readonly { readonly label: string; readonly value: string }[];
  readonly observedAt: string;
  /** Null while nobody has decided. */
  readonly disposition: RiskDisposition | null;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly note: string | null;
}

export interface RiskBoardDto {
  readonly open: readonly RiskSignalDto[];
  readonly handled: readonly RiskSignalDto[];
  readonly escalated: number;
  /** True when the scan could not run — an empty board is not the same as a clean one. */
  readonly degraded: boolean;
  /** True when no scanner is configured at all, which is a different message. */
  readonly unavailable: boolean;
}

const NOTHING: RiskBoardDto = {
  open: [],
  handled: [],
  escalated: 0,
  degraded: false,
  unavailable: true,
};

export async function getRiskBoard(
  deps: LedgerDependencies,
  options: { limitPerRule?: number } = {},
): Promise<RiskBoardDto> {
  const scanner = deps.risk;
  if (scanner === undefined) return NOTHING;

  try {
    const findings = await scanner.scan({
      now: deps.clock.now(),
      velocityThreshold: VELOCITY_THRESHOLD,
      velocityWindowHours: VELOCITY_WINDOW_HOURS,
      retryWindowHours: RETRY_WINDOW_HOURS,
      refusalThreshold: REFUSAL_THRESHOLD,
      limitPerRule: options.limitPerRule ?? 50,
    });

    const decisions =
      deps.dispositions === undefined
        ? new Map()
        : await deps.dispositions.findMany(findings.map((finding) => finding.key));

    const signals: RiskSignalDto[] = findings.map((finding) => {
      const definition = RISK_RULES[finding.rule];
      const decided = decisions.get(finding.key) ?? null;

      return {
        key: finding.key,
        rule: finding.rule,
        title: definition.title,
        description: definition.description,
        rationale: definition.rationale,
        severity: definition.severity,
        subjects: finding.subjects,
        evidence: finding.evidence,
        observedAt: finding.observedAt.toISOString(),
        disposition: decided?.disposition ?? null,
        decidedBy: decided?.decidedBy ?? null,
        decidedAt: decided?.decidedAt.toISOString() ?? null,
        note: decided?.note ?? null,
      };
    });

    signals.sort(byUrgency);

    return {
      open: signals.filter((signal) => signal.disposition === null),
      handled: signals.filter((signal) => signal.disposition !== null),
      escalated: signals.filter((signal) => signal.disposition === 'escalated').length,
      degraded: false,
      unavailable: false,
    };
  } catch (error) {
    logger.error({ event: 'risk_scan_failed', module: 'ledger' }, error);
    return { open: [], handled: [], escalated: 0, degraded: true, unavailable: false };
  }
}

/** Worst first, then newest within a severity — the order a queue is worked in. */
function byUrgency(a: RiskSignalDto, b: RiskSignalDto): number {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if (bySeverity !== 0) return bySeverity;
  return b.observedAt.localeCompare(a.observedAt);
}
