import { requireDb } from '@/platform/db/client';

/* Throwaway diagnostic: what does the database actually contain right now? */
async function main() {
  const db = requireDb();

  const schemas = await db.execute(
    `select nspname from pg_namespace
     where nspname not like 'pg_%' and nspname <> 'information_schema'
     order by nspname`,
  );
  console.log('\n--- schemas ---');
  console.log(schemas.rows.map((r) => r.nspname).join(', '));

  const tables = await db.execute(
    `select table_schema, table_name from information_schema.tables
     where table_schema not in ('pg_catalog','information_schema')
     order by table_schema, table_name`,
  );
  console.log('\n--- tables ---');
  for (const row of tables.rows) {
    console.log(`${String(row.table_schema).padEnd(12)} ${row.table_name}`);
  }

  const applied = await db.execute(
    `select hash, created_at from drizzle.__drizzle_migrations order by created_at`,
  ).catch(() => null);
  console.log('\n--- applied migrations ---');
  console.log(applied === null ? 'no drizzle.__drizzle_migrations table' : applied.rows.length);
}

void main();
