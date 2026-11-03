import { createLogger } from '@couchlist/shared';
import { closeDatabase } from '../client.js';
import { loadProjectEnv } from '../load-env.js';
import { runLinkCheck } from './check-links.js';
import { runPreviewCapture } from './capture-previews.js';
import { runBlocklistSync } from './sync-blocklists.js';

/**
 * Everything Couchlist does on a schedule, in one run.
 *
 *   node packages/db/dist/scripts/maintenance.js
 *
 * One job rather than three, because every separate schedule is another thing
 * to set up on a host, another thing to notice has stopped, and another thing
 * to explain. These three have no reason to run at different times:
 *
 *   1. Check the links, and flag what has stopped answering.
 *   2. Empty the deleted bin of anything past its thirty days.
 *   3. Photograph listings that have no picture yet, for review.
 *   4. Refresh the public blocklists the safety tool answers from.
 *
 * They run one after another, so the browser's memory is only held during the
 * part that needs it. Any step that fails is logged and the rest still run: a
 * site that cannot be photographed is no reason to skip the link check.
 */
async function main(): Promise<void> {
  loadProjectEnv();
  const logger = createLogger({ service: 'maintenance' });

  logger.info('starting');

  try {
    await runLinkCheck({ limit: undefined, all: false });
  } catch (error) {
    logger.error('link_check_failed', { message: (error as Error)?.message });
  }

  try {
    await runPreviewCapture({ limit: 10 });
  } catch (error) {
    logger.error('capture_failed', { message: (error as Error)?.message });
  }

  try {
    const total = await runBlocklistSync();
    logger.info('blocklists_synced', { domains: total });
  } catch (error) {
    logger.error('blocklist_sync_failed', { message: (error as Error)?.message });
  }

  logger.info('finished');
}

main()
  .then(async () => {
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    process.stderr.write(`\nMaintenance failed: ${(error as Error).message}\n\n`);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
