import 'server-only';
import { createLogger } from '@couchlist/shared';
import { repos } from '@/lib/db';

const log = createLogger({ service: 'blocklists' });

/**
 * Fill the blocklists the first time the server starts without them.
 *
 * The lists are the one tier of the safety tool that needs no key, and an
 * empty table makes the tool honestly report that it checked nothing. Asking
 * somebody to remember a one-off command after every fresh deploy is a way to
 * end up with a tool that quietly checks less than it claims.
 *
 * Three things keep this safe to run at boot:
 *
 *   - it only runs when the table is *empty*, so a normal restart does
 *     nothing and the weekly job stays in charge of keeping it fresh;
 *   - it is not awaited, so a slow download cannot delay the server coming
 *     up or trip a healthcheck;
 *   - a failure is logged and swallowed. The site works without it.
 *
 * Two instances starting together both sync, which is harmless: the writes
 * are upserts keyed by (domain, list).
 */
export function bootstrapBlocklists(): void {
  void (async () => {
    try {
      const existing = await repos().tools.blockedDomainCount();
      if (existing > 0) {
        log.info('blocklists_present', { domains: existing });
        return;
      }

      log.info('blocklists_empty_downloading');
      const { runBlocklistSync } = await import('@couchlist/db');
      const total = await runBlocklistSync();
      log.info('blocklists_downloaded', { domains: total });
    } catch (error) {
      log.warn('blocklist_bootstrap_failed', { message: (error as Error)?.message });
    }
  })();
}
