import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@couchlist/db';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';
import { providerHealth } from '@/lib/services/media';

export const dynamic = 'force-dynamic';

/**
 * Health endpoint.
 *
 * Returns status only. No connection strings, versions, hostnames or other
 * infrastructure detail that would help someone probing the deployment.
 */
export async function GET(): Promise<NextResponse> {
  const database = await checkDatabaseHealth(repos().db).catch(() => ({ ok: false, latencyMs: 0 }));
  const providers = await providerHealth().catch(() => ({
    jikan: 'degraded' as const,
    tmdb: 'degraded' as const,
  }));

  const healthy = database.ok;

  return NextResponse.json(
    {
      web: 'healthy',
      database: database.ok ? 'healthy' : 'unhealthy',
      jikan: providers.jikan,
      tmdb: providers.tmdb,
      testMode: config().TEST_MODE,
    },
    { status: healthy ? 200 : 503 },
  );
}
