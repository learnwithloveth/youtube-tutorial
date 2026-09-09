/**
 * Grants or revokes the operator role.
 *
 *   pnpm admin:grant  you@example.com
 *   pnpm admin:revoke you@example.com
 *
 * Deliberately a script and not a UI. Promotion is an administrative act with
 * real consequences — the console can freeze accounts and approve withdrawals —
 * so it happens through a deliberate command against the database, not through
 * anything reachable from a browser. Registration can never grant it.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

async function main(): Promise<void> {
  const email = process.argv[2]?.trim().toLowerCase();
  const revoke = process.argv.includes('--revoke');

  if (!email) {
    console.error('Usage: pnpm admin:grant <email> [--revoke]');
    process.exit(1);
  }

  const { requireDb } = await import('../src/platform/db/client.js');
  const { users } = await import('../src/modules/identity/infrastructure/persistence/schema.js');
  const { eq } = await import('drizzle-orm');

  const role = revoke ? 'customer' : 'admin';
  const updated = await requireDb()
    .update(users)
    .set({ role })
    .where(eq(users.email, email))
    .returning({ email: users.email, role: users.role });

  const row = updated[0];
  if (!row) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }

  console.log(`${row.email} is now: ${row.role}`);
  console.log('Existing sessions keep their old role until the next request re-reads the user.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
