import { err, ok, type Result } from '@/shared/kernel';
import type { UserId } from '@/shared/kernel/ids';

import {
  MAX_ALERTS_PER_USER,
  parseTarget,
  PriceAlert,
  type AlertDirection,
} from '../../domain/price-alert';
import { AlertErrors, type AlertError } from '../errors';
import type { AlertDependencies } from '../ports';

/**
 * Creating, muting, re-arming and deleting a customer's price alerts.
 */

export interface CreateAlertCommand {
  readonly userId: UserId;
  readonly symbol: string;
  readonly direction: AlertDirection;
  /** As typed. Parsed here so a malformed number is a refusal, not a crash. */
  readonly target: string;
  /** Symbols this platform actually quotes. An alert on anything else can never fire. */
  readonly knownSymbols: readonly string[];
}

export type CreateAlert = (
  command: CreateAlertCommand,
) => Promise<Result<{ id: string }, AlertError>>;

export function createCreateAlert(deps: AlertDependencies): CreateAlert {
  return async function createAlert(command) {
    const symbol = command.symbol.trim().toUpperCase();

    // Checked against the live instrument list rather than a stored enum: an alert
    // on a symbol nobody quotes sits armed forever, and the customer reads that as
    // the alert system being broken.
    if (!command.knownSymbols.map((s) => s.toUpperCase()).includes(symbol)) {
      return err(AlertErrors.symbolUnknown(symbol));
    }

    let target;
    try {
      target = parseTarget(command.target);
    } catch {
      return err(AlertErrors.targetInvalid());
    }
    if (target.isZero || target.isNegative) return err(AlertErrors.targetInvalid());

    const existing = await deps.alerts.listForUser(command.userId);
    if (existing.length >= MAX_ALERTS_PER_USER) {
      return err(AlertErrors.tooMany(MAX_ALERTS_PER_USER));
    }

    // Two identical alerts fire twice on one crossing, which reads as a bug in the
    // alerting rather than as the duplicate it is.
    const duplicate = existing.some(
      (alert) =>
        alert.symbol === symbol &&
        alert.direction === command.direction &&
        alert.target.equals(target),
    );
    if (duplicate) return err(AlertErrors.duplicate());

    let alert: PriceAlert;
    try {
      alert = PriceAlert.create({
        id: deps.alerts.nextId(),
        userId: command.userId,
        symbol,
        direction: command.direction,
        target,
        now: deps.clock.now(),
      });
    } catch {
      return err(AlertErrors.targetInvalid());
    }

    await deps.alerts.save(alert);
    return ok({ id: alert.id });
  };
}

export type AlertAction = 'mute' | 'rearm' | 'delete';

export interface MoveAlertCommand {
  readonly id: string;
  readonly userId: UserId;
  readonly action: AlertAction;
}

export type MoveAlert = (
  command: MoveAlertCommand,
) => Promise<Result<{ id: string }, AlertError>>;

export function createMoveAlert(deps: AlertDependencies): MoveAlert {
  return async function moveAlert(command) {
    if (command.action === 'delete') {
      const removed = await deps.alerts.remove(command.id, command.userId);
      return removed ? ok({ id: command.id }) : err(AlertErrors.notFound());
    }

    const alert = await deps.alerts.find(command.id);
    // Ownership checked here, on the row, not on a form field. Not-found rather
    // than forbidden for somebody else's alert: confirming an id is real is the
    // first thing worth knowing if you are guessing them.
    if (alert === null || alert.userId !== command.userId) {
      return err(AlertErrors.notFound());
    }

    if (command.action === 'mute') alert.mute();
    else alert.rearm();

    await deps.alerts.save(alert);
    return ok({ id: alert.id });
  };
}
