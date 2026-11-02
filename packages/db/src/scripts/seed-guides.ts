import { loadProjectEnv } from '../load-env.js';
import { getDatabase } from '../client.js';
import { guides } from '../schema.js';
import { GUIDE_SEED } from '../guide-seed.js';
import { sql } from 'drizzle-orm';

/**
 * Seeds the starter guide set.
 *
 * Idempotent: a guide is matched on its slug and updated, so running this twice
 * does not create duplicates and an operator's later edits to published state
 * are preserved.
 *
 * Every seeded guide has `lastReviewedAt` null. These entries came from the
 * design reference and their compatibility, pricing and links have *not* been
 * verified, so the UI says "not yet reviewed" rather than inventing a date. A
 * moderator marks a guide reviewed from the admin area once they have actually
 * checked it.
 */
async function main(): Promise<void> {
  loadProjectEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('\nDATABASE_URL is not set. Cannot seed guides.\n\n');
    process.exit(1);
  }

  const db = getDatabase(url);
  let inserted = 0;
  let updated = 0;

  for (const guide of GUIDE_SEED) {
    const existing = await db
      .select({ id: guides.id })
      .from(guides)
      .where(sql`${guides.slug} = ${guide.slug}`)
      .limit(1);

    if (existing[0]) {
      await db
        .update(guides)
        .set({ ...guide, updatedAt: new Date() })
        .where(sql`${guides.id} = ${existing[0].id}`);
      updated += 1;
    } else {
      await db.insert(guides).values(guide);
      inserted += 1;
    }
  }

  process.stdout.write(
    `Guides seeded: ${inserted} new, ${updated} updated, ${GUIDE_SEED.length} total.\n` +
      'All seeded guides are marked "not yet reviewed". Verify links and platform\n' +
      'support in /admin/guides before presenting them as checked.\n',
  );
  process.exit(0);
}

void main();
