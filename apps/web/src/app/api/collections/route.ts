import { NextResponse } from 'next/server';
import { collectionSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireVerifiedUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Creates a collection. Private unless its owner publishes it. */
export const POST = apiRoute(async (request) => {
  const user = await requireVerifiedUser();
  checkRateLimit(`collection:${user.id}`, 20);

  const input = collectionSchema.parse(await request.json());
  const collection = await repos().collections.create({
    ownerUserId: user.id,
    name: input.name,
    description: input.description ?? null,
    isPublic: input.isPublic,
  });

  return NextResponse.json({ ok: true, slug: collection.slug, id: collection.id });
});
