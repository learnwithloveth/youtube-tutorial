import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';

import type { AlertDependencies } from './application/ports';
import {
  createCreateAlert,
  createMoveAlert,
  type CreateAlert,
  type MoveAlert,
} from './application/use-cases/manage-alerts';
import {
  createEvaluateAlerts,
  type EvaluateAlerts,
} from './application/use-cases/evaluate-alerts';
import {
  DrizzleNotificationReadRepository,
  DrizzlePriceAlertRepository,
} from './infrastructure/persistence/repository';

export interface AlertsModule {
  readonly createAlert: CreateAlert;
  readonly moveAlert: MoveAlert;
  /** Called by whoever has just written new prices. Takes them as input. */
  readonly evaluate: EvaluateAlerts;
  readonly dependencies: AlertDependencies;
}

export interface RegisterAlertsOptions {
  db: Database;
  clock?: Clock;
}

export function registerAlerts(options: RegisterAlertsOptions): AlertsModule {
  const dependencies: AlertDependencies = {
    alerts: new DrizzlePriceAlertRepository(options.db),
    reads: new DrizzleNotificationReadRepository(options.db),
    clock: options.clock ?? systemClock,
  };

  return {
    createAlert: createCreateAlert(dependencies),
    moveAlert: createMoveAlert(dependencies),
    evaluate: createEvaluateAlerts(dependencies),
    dependencies,
  };
}
