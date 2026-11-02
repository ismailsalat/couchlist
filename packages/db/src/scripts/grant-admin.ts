import { loadProjectEnv } from '../load-env.js';
import { getDatabase } from '../client.js';
import { AccountRepository } from '../repositories/accounts.js';

/**
 * Grants or revokes the administrator role.
 *
 * Usage:
 *   npm run admin:grant -- someone@example.com
 *   npm run admin:grant -- someone@example.com --revoke
 *
 * The role is a column on the account and every authorization check reads it
 * server-side. This script and ADMIN_EMAILS are two ways to set that column;
 * neither is consulted when a request is authorized.
 */
async function main(): Promise<void> {
  loadProjectEnv();

  const args = process.argv.slice(2);
  const email = args.find((arg) => !arg.startsWith('--'));
  const revoke = args.includes('--revoke');

  if (!email) {
    process.stderr.write('\nUsage: npm run admin:grant -- <email> [--revoke]\n\n');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('\nDATABASE_URL is not set.\n\n');
    process.exit(1);
  }

  const accounts = new AccountRepository(getDatabase(url));
  const user = await accounts.findByEmail(email);

  if (!user) {
    process.stderr.write(
      `\nNo account found for ${email}. They must sign up first.\n\n`,
    );
    process.exit(1);
  }

  await accounts.setAdmin(user.id, !revoke);
  const total = await accounts.adminCount();
  process.stdout.write(
    `${revoke ? 'Revoked' : 'Granted'} the administrator role for ${email}.\n` +
      `Administrators now: ${total}.\n`,
  );
  process.exit(0);
}

void main();
