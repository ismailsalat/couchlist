import { NextResponse } from 'next/server';
import { AppError, collectionItemSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Adds or removes a source in one of the caller's own collections. */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const user = await requireUser();
  checkRateLimit(`collection:${user.id}`, 60);
  const input = collectionItemSchema.parse(await request.json());

  const { collections, sources } = repos();
  if (!(await sources.findRowById(input.sourceId))) throw AppError.notFound('source');

  const added = await collections.addItem(params.id, user.id, input.sourceId, input.note);
  if (!added) throw AppError.notFound('collection');

  return NextResponse.json({ ok: true });
});

export const DELETE = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const user = await requireUser();
  checkRateLimit(`collection:${user.id}`, 60);
  const { sourceId } = (await request.json()) as { sourceId?: string };
  if (!sourceId) throw AppError.validation('Which source should be removed?');

  const removed = await repos().collections.removeItem(params.id, user.id, sourceId);
  if (!removed) throw AppError.notFound('collection item');

  return NextResponse.json({ ok: true });
});
