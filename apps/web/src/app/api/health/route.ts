import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@couchlist/db';
import { config } from '@/lib/config';
import { repos } from '@/lib/db';
import { mailTransport } from '@/lib/mail/transport';

export const dynamic = 'force-dynamic';

/**
 * Health endpoint.
 *
 * Status only. No connection strings, versions, hostnames or other
 * infrastructure detail that would help someone probing the deployment.
 *
 * The external media providers are gone from this check along with the title
 * catalog they served. Mail is reported because a deploy that cannot send a
 * verification code cannot register anyone, which is a real outage even though
 * every page still renders.
 */
export async function GET(): Promise<NextResponse> {
  const database = await checkDatabaseHealth(repos().db).catch(() => ({ ok: false, latencyMs: 0 }));
  const transport = mailTransport();

  const healthy = database.ok;

  return NextResponse.json(
    {
      web: 'healthy',
      database: database.ok ? 'healthy' : 'unhealthy',
      mail:
        transport === 'resend'
          ? 'configured'
          : transport === 'log'
            ? 'development-log'
            : 'not-configured',
      testMode: config().TEST_MODE,
    },
    { status: healthy ? 200 : 503 },
  );
}
