import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// Next.js reads .env.local automatically; drizzle-kit runs outside it, so the
// same file has to be loaded explicitly or the CLI targets the wrong database.
config({ path: '.env.local' });

/**
 * Migration tooling.
 *
 * One source, and it is a glob: every module owns its tables under
 * `infrastructure/persistence/schema.ts`, and each declares its own Postgres
 * schema — `identity`, `presence`, `activity`, `market_data`. The namespace is the
 * module boundary made operational: `pg_dump --schema=identity` is the whole
 * context, and a grant on it is enforced by the database rather than by review.
 *
 * `platform/db` holds no tables. It once held `tickers`, under the heading "shared
 * across contexts", which was never true — see that module's schema file for why
 * the foundation owning a context's storage inverted the dependency the boundary
 * rules exist to protect.
 *
 * Migrations are generated and committed rather than pushed from a developer's
 * machine, so the schema history is reviewable and the same statements run
 * everywhere. The one hand-written migration is the move to named schemas: a
 * generated diff would have dropped and recreated every table, and the whole point
 * of that change was to keep the rows.
 */

console.log('Drizzle config: connecting to', process.env.DATABASE_URL);
export default defineConfig({
  schema: ['./src/modules/*/infrastructure/persistence/schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
