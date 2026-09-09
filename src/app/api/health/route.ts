import { db } from '@/platform/db/client';
import { hasDatabase } from '@/platform/env';

/**
 * Liveness and readiness.
 *
 * `status: 'ok'` means the process is serving. The `checks` block reports each
 * dependency separately, because "the database is down" and "the app is down"
 * warrant different responses from whatever is watching: this site renders its
 * catalogue without a database, so a failed database check is degraded, not
 * dead, and returns 200 with the detail rather than 503.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const database = await checkDatabase();

  return Response.json(
    {
      status: 'ok',
      time: new Date().toISOString(),
      checks: { database },
    },
    { status: 200, headers: { 'cache-control': 'no-store' } },
  );
}

async function checkDatabase(): Promise<{ status: string; detail?: string }> {
  if (!hasDatabase()) return { status: 'not-configured' };

  const handle = db();
  if (!handle) return { status: 'not-configured' };

  try {
    await handle.execute('select 1');
    return { status: 'ok' };
  } catch (error) {
    return {
      status: 'unavailable',
      detail: error instanceof Error ? error.message : 'unknown error',
    };
  }
}
