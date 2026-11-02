import { NextResponse } from 'next/server';
import { AppError, adminResolveReportsSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Resolves or dismisses every open report for one source.
 *
 * Grouped on purpose: twenty reports about one broken link are one decision,
 * not twenty. The moderation note is kept so the history means something
 * later, without turning this into an audit dashboard.
 */
export const POST = apiRoute(async (request) => {
  const admin = await requireAdmin();
  const { contributions, sources, audit } = repos();

  const input = adminResolveReportsSchema.parse(await request.json());
  if (!(await sources.findRowById(input.sourceId))) throw AppError.notFound('source');

  const note =
    input.resolutionNote ?? (input.action === 'DISMISS' ? 'Dismissed after review.' : undefined);
  const resolved = await contributions.resolveReportsForSource(input.sourceId, admin.id, note);

  await audit.record({
    actorId: admin.id,
    action: input.action === 'DISMISS' ? 'admin.reports.dismiss' : 'admin.reports.resolve',
    metadata: { sourceId: input.sourceId, resolved },
  });

  return NextResponse.json({ ok: true, resolved });
});
