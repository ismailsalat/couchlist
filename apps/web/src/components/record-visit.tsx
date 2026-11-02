'use client';

import { useEffect } from 'react';
import { recordRecentSource } from '@/lib/recent-sources';

/**
 * Records a visit in this device's local history.
 *
 * Deliberately client-side and local: recently-viewed is a convenience for one
 * browser, not a public browsing log, so nothing is sent to the server and
 * there is no account-level record to leak. The reader can erase it from the
 * Saved page.
 */
export function RecordVisit({ sourceId, name }: { sourceId: string; name: string }) {
  useEffect(() => {
    recordRecentSource({ id: sourceId, name });
  }, [sourceId, name]);

  return null;
}
