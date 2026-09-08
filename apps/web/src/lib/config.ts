import { parseEnvironment, type CouchlistConfig } from '@couchlist/shared';

/**
 * Server-only configuration.
 *
 * Importing this from a client component is a build error, which is the point:
 * secrets cannot end up in a browser bundle by accident.
 */
import 'server-only';

let cached: CouchlistConfig | undefined;

export function config(): CouchlistConfig {
  if (!cached) cached = parseEnvironment();
  return cached;
}

/** Values that are safe to send to the browser. */
export function publicConfig(): { testMode: boolean; appName: string } {
  return { testMode: config().TEST_MODE, appName: 'Couchlist' };
}
