import { NextResponse } from 'next/server';
import { AppError } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Deciding about a screenshot a bot took.
 *
 * Two outcomes and no third: it goes on the listing, or it goes away. There
 * is deliberately no "leave it for later" — the queue is only useful while it
 * is short enough to read.
 */
export const POST = apiRoute(async (request) => {
  const admin = await requireAdmin();
  const body = (await request.json()) as { id?: unknown; action?: unknown };

  const id = String(body.id ?? '');
  if (!id) throw AppError.validation('Which listing?');

  const { icons, audit } = repos();

  if (body.action === 'approve') {
    const approved = await icons.approvePreview(id);
    if (!approved) throw AppError.notFound('pending preview');

    await audit.record({
      actorId: admin.id,
      action: 'preview_approved',
      metadata: { sourceId: id },
    });
    return NextResponse.json({ ok: true, approved: true });
  }

  if (body.action === 'discard') {
    await icons.removeSourcePreview(id);
    return NextResponse.json({ ok: true, approved: false });
  }

  throw AppError.validation('Unknown action.');
});
