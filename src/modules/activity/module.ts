import 'server-only';

import type { Database } from '@/platform/db/client';
import { systemClock, type Clock } from '@/shared/kernel/clock';

import type { ActivityDependencies } from './application/ports';
import {
  createRecordActivity,
  type RecordActivity,
} from './application/use-cases/record-activity';
import {
  createSweepActivity,
  type SweepActivity,
} from './application/use-cases/sweep-activity';
import { DrizzleActivityRepository } from './infrastructure/persistence/repositories';

/**
 * Activity module registration.
 *
 * The smallest composition root in the codebase, and that is the point: this
 * context has one table, one write and a handful of reads. Its whole job is to
 * remember, so the interesting decisions are in the retention windows and the
 * absence of an update path, not in the wiring.
 */

export interface ActivityModule {
  readonly recordActivity: RecordActivity;
  readonly sweepActivity: SweepActivity;
  /** Passed to the module's queries, which are free functions over these ports. */
  readonly dependencies: ActivityDependencies;
}

export interface RegisterActivityOptions {
  db: Database;
  clock?: Clock;
}

export function registerActivity(options: RegisterActivityOptions): ActivityModule {
  const dependencies: ActivityDependencies = {
    events: new DrizzleActivityRepository(options.db),
    clock: options.clock ?? systemClock,
  };

  return {
    recordActivity: createRecordActivity(dependencies),
    sweepActivity: createSweepActivity(dependencies),
    dependencies,
  };
}
