import { describe, expect, it } from 'vitest';

import type { ActivityRepository } from '../ports';
import { getPlatformActivity } from '../queries/platform-activity';

/**
 * The console's activity series.
 *
 * The property under test is the filling. A database returns only the days that
 * have rows, and a chart drawn from that spaces a quiet Sunday exactly like a busy
 * Monday — so a fortnight of nothing followed by one busy day reads as steady
 * growth. Nothing about that looks broken on screen, which is why it is tested
 * rather than eyeballed.
 */

const NOW = new Date('2026-09-14T09:30:00.000Z');

function repository(
  rows: { day: string; total: number }[],
  options: { fail?: boolean } = {},
): ActivityRepository {
  return {
    async tallyByDay() {
      if (options.fail) throw new Error('connection refused');
      return rows;
    },
  } as unknown as ActivityRepository;
}

describe('platform activity', () => {
  it('returns one point per day, filling the gaps with the zeros that were observed', async () => {
    const result = await getPlatformActivity(
      repository([
        { day: '2026-09-12', total: 40 },
        { day: '2026-09-14', total: 7 },
      ]),
      NOW,
      { days: 5 },
    );

    expect(result.days).toEqual([
      { day: '2026-09-10', total: 0 },
      { day: '2026-09-11', total: 0 },
      { day: '2026-09-12', total: 40 },
      { day: '2026-09-13', total: 0 },
      { day: '2026-09-14', total: 7 },
    ]);
    expect(result.total).toBe(47);
    expect(result.degraded).toBe(false);
  });

  it('includes today even when nothing has happened yet', async () => {
    const result = await getPlatformActivity(repository([]), NOW, { days: 3 });

    expect(result.days.map((day) => day.day)).toEqual([
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ]);
    expect(result.total).toBe(0);
  });

  it('returns no series at all when the read fails', async () => {
    // Not a flat line of zeros. Zeros assert that nothing happened, which a failed
    // read cannot claim — and the caller renders an explanation instead of a chart.
    const result = await getPlatformActivity(repository([], { fail: true }), NOW, { days: 5 });

    expect(result.days).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.degraded).toBe(true);
  });

  it('asks the database for whole UTC days, not a rolling window from now', async () => {
    let asked: Date | null = null;
    const spy = {
      async tallyByDay(query: { since: Date }) {
        asked = query.since;
        return [];
      },
    } as unknown as ActivityRepository;

    await getPlatformActivity(spy, NOW, { days: 7 });

    // Midnight, seven days back inclusive — not 09:30, which would make the oldest
    // bucket a two-thirds day and read as a slow start that never happened.
    expect(asked).not.toBeNull();
    expect((asked as unknown as Date).toISOString()).toBe('2026-09-08T00:00:00.000Z');
  });
});
