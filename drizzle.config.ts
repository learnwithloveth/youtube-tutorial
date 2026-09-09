import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Next.js reads .env.local automatically; drizzle-kit runs outside it, so the
// same file has to be loaded explicitly or the CLI targets the wrong database.
config({ path: '.env.local' });

/**
 * Migration tooling.
 *
 * Two schema sources, deliberately.
 *
 * `platform/db` holds tables shared across contexts. Each module holds its own
 * under `infrastructure/persistence/schema.ts`, and those travel with the module
 * if it is ever extracted into a service.
 *
 * Re-exporting the module schemas from `platform` would be simpler for this tool
 * and wrong for the architecture: it would make the shared foundation depend on a
 * module, which `pnpm lint:boundaries` rejects. Pointing drizzle-kit at both paths
 * costs one line and keeps the dependency arrow pointing the right way.
 *
 * Migrations are generated and committed rather than pushed from a developer's
 * machine, so the schema history is reviewable and the same statements run
 * everywhere.
 */
export default defineConfig({
  schema: [
    './src/platform/db/schema.ts',
    './src/modules/*/infrastructure/persistence/schema.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
