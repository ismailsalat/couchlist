import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiRoute } from '@/lib/api/handler';
import { clientKey } from '@/lib/api/client-key';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { optionalUser } from '@/lib/api/guards';
import { checkFileHash } from '@/lib/tools/file-reputation';

export const dynamic = 'force-dynamic';

/**
 * Look a file up by fingerprint.
 *
 * Takes a SHA-256 and nothing else. The schema enforces that: there is no
 * field a file could arrive in, so this endpoint cannot become a place that
 * receives strangers' binaries even by accident.
 */
const schema = z.object({ sha256: z.string().regex(/^[a-f0-9]{64}$/u) });

export const POST = apiRoute(async (request) => {
  const user = await optionalUser();
  const key = user ? `tools:file:user:${user.id}` : `tools:file:${clientKey(request)}`;
  checkRateLimit(key, user ? 30 : 10);

  const { sha256 } = schema.parse(await request.json());
  return NextResponse.json(await checkFileHash(sha256));
});
