import { NextResponse } from 'next/server';
import { AppError } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * What a deletion would take with it.
 *
 * Read-only, administrators only. It exists so the confirmation box can show
 * the consequences rather than describe them in the abstract: "delete this
 * listing" and "delete this listing and forty-one votes" are different
 * decisions, and only the second one is the truth.
 */
export const GET = apiRoute<NextResponse, { id: string }>(async (_request, { params }) => {
  await requireAdmin();

  const source = await repos().sources.findRowById(params.id);
  if (!source) throw AppError.notFound('source');

  return NextResponse.json(await repos().sources.referenceCounts(params.id));
});
