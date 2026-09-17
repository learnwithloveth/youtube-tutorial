import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The startup hook, which Next runs before the server answers anything.
 *
 * The case that matters is the second one. This hook threw on a deployment whose
 * Node was older than 22.12 and therefore could not `require` firebase-admin's
 * ESM-only `jose` — and Next answered *every* request with a 500, the marketing
 * pages included. What the hook starts is a background price refresher, so the
 * server has to come up without it.
 */

const loop = vi.hoisted(() => ({ fails: false, start: vi.fn() }));

// The export throws on access rather than the factory throwing, because a factory
// runs once and is cached: this way each test chooses. It fails where a real load
// failure does — inside the hook's `try`, as the binding is read.
vi.mock('../server/market-refresh-loop', () => ({
  get startMarketRefreshLoop() {
    if (loop.fails) throw new Error('require() of an ES module is not supported');
    return loop.start;
  },
}));

const RUNTIME = process.env.NEXT_RUNTIME;

beforeEach(() => {
  vi.resetModules();
  loop.fails = false;
  loop.start.mockClear();
  process.env.NEXT_RUNTIME = 'nodejs';
});

afterEach(() => {
  if (RUNTIME === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = RUNTIME;
  vi.restoreAllMocks();
});

describe('the startup hook', () => {
  it('starts the refresh loop on the Node runtime', async () => {
    const { register } = await import('../instrumentation');

    await register();

    expect(loop.start).toHaveBeenCalledTimes(1);
  });

  it('still comes up when the loop cannot be loaded, and says why', async () => {
    loop.fails = true;
    const reported = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { register } = await import('../instrumentation');

    await expect(register()).resolves.toBeUndefined();
    expect(loop.start).not.toHaveBeenCalled();
    expect(reported).toHaveBeenCalledTimes(1);
    expect(String(reported.mock.calls[0]?.[0])).toContain('market refresh loop');
  });

  it('starts nothing off the Node runtime', async () => {
    process.env.NEXT_RUNTIME = 'edge';

    const { register } = await import('../instrumentation');
    await register();

    expect(loop.start).not.toHaveBeenCalled();
  });
});
