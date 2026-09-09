import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Next.js reads .env.local automatically; drizzle-kit runs outside it, so the
// same file has to be loaded explicitly or the CLI targets the wrong database.
config({ path: '.env.local' });

/**
 * Migration tooling.
 *
 * Points at the physical schema in `platform/db`, which is the single place
 * tables are declared. Migrations are generated and committed rather than
 * pushed from a developer's machine, so the schema history is reviewable and
 * the same statements run in every environment.
 */
export default defineConfig({
  schema: './src/platform/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
