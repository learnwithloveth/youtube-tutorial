import 'server-only';

import { cache } from 'react';

import type { RiskBoardDto } from '@/modules/ledger';
import { getRiskBoard } from '@/modules/ledger/server';
import { logger } from '@/platform/observability/logger';
import { toUserId, type UserId } from '@/shared/kernel/ids';

import { identity } from './auth';
import { ledger } from './ledger';

/**
 * The surveillance console's read.
 *
 * ── The join happens here, as it does everywhere else ─────────────────────────
 * The ledger's rules return account ids and nothing about the people behind them —
 * a module's tables are its own, and no query in `ledger` reads `identity.users`.
 * The composition root is the one place allowed to know both modules exist, so it
 * is where an id becomes an email.
 */

export interface RiskConsoleDto extends RiskBoardDto {
  /** Email per account id, for whichever ids resolved. */
  readonly accounts: Readonly<Record<string, string>>;
}

const UNAVAILABLE: RiskConsoleDto = {
  open: [],
  handled: [],
  escalated: 0,
  degraded: false,
  unavailable: true,
  accounts: {},
};

export const getRiskConsole = cache(async (): Promise<RiskConsoleDto> => {
  const context = ledger();
  if (context === null) return UNAVAILABLE;

  const board = await getRiskBoard(context.dependencies);

  const ids = [
    ...new Set([...board.open, ...board.handled].flatMap((signal) => signal.subjects)),
  ];

  return { ...board, accounts: await describeAccounts(ids) };
});

async function describeAccounts(ids: readonly string[]): Promise<Record<string, string>> {
  const parsed = ids.flatMap((id) => {
    try {
      return [toUserId(id)];
    } catch {
      return [];
    }
  }) as UserId[];

  if (parsed.length === 0) return {};

  try {
    const found = await identity().describeUsers(parsed);
    return Object.fromEntries([...found.values()].map((user) => [user.id, user.email]));
  } catch (error) {
    // An id renders as itself. An operator can act on an id; they cannot act on an
    // error boundary, and a compliance board that refuses to load because one
    // address was missing is worse than one showing a uuid.
    logger.warn({ event: 'risk_accounts_read_failed', module: 'identity' }, error);
    return {};
  }
}
