import { NextResponse } from 'next/server';
import { AppError, collectionSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Updates or deletes a collection.
 *
 * The repository scopes every write to the caller's own rows, so another
 * person's collection id changes nothing and comes back as not found.
 */
export const PATCH = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const user = await requireUser();
  checkRateLimit(`collection:${user.id}`, 30);
  const input = collectionSchema.parse(await request.json());

  const updated = await repos().collections.update(params.id, user.id, {
    name: input.name,
    description: input.description ?? null,
    isPublic: input.isPublic,
  });
  if (!updated) throw AppError.notFound('collection');

  return NextResponse.json({ ok: true, isPublic: updated.isPublic });
});

export const DELETE = apiRoute<NextResponse, { id: string }>(async (_request, { params }) => {
  const user = await requireUser();
  checkRateLimit(`collection:${user.id}`, 30);
  const removed = await repos().collections.remove(params.id, user.id);
  if (!removed) throw AppError.notFound('collection');
  return NextResponse.json({ ok: true });
});
