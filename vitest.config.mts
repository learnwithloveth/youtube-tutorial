import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Two projects, because the two kinds of test have different costs and
 * different reasons to fail.
 *
 * `unit` covers the domain and application layers. Those layers have no I/O by
 * construction, so the suite is fast enough to run on every save and a failure
 * always means a rule was broken.
 *
 * `integration` covers adapters against real infrastructure. It is slower, needs
 * a database, and is excluded from the default `pnpm test` so that a missing
 * DATABASE_URL never looks like a broken domain.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        resolve: {
          alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['src/**/*.integration.test.ts'],
        },
      },
      {
        resolve: {
          alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.integration.test.ts'],
        },
      },
    ],
  },
});
