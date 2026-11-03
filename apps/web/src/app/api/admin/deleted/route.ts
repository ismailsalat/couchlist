import { NextResponse } from 'next/server';
import { AppError } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Putting a deleted listing back.
 *
 * It returns hidden rather than straight to the directory: whatever made
 * somebody delete it may still be true, and the point of restoring is to get
 * the votes and credit back, not to re-publish without looking.
 */
export const POST = apiRoute(async (request) => {
  const admin = await requireAdmin();
  const body = (await request.json()) as { id?: unknown };

  const id = String(body.id ?? '');
  if (!id) throw AppError.validation('Which listing?');

  const restored = await repos().sources.restore(id);
  if (!restored) throw AppError.notFound('deleted source');

  await repos().audit.record({
    actorId: admin.id,
    action: 'source_restored',
    metadata: { sourceId: id },
  });

  return NextResponse.json({ ok: true });
});
