import { NextResponse } from 'next/server';
import { AppError, canonicalizeExternalUrl, parseExternalUrl } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The addresses a listing answers on.
 *
 * Adding one, promoting one to be the address readers see, accepting one the
 * link checker proposed, or removing one. The listing's votes, saves and
 * credit stay where they are through all of it, which is the entire point:
 * a site that moved is the same site.
 */
export const POST = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const { sources, mirrors, audit } = repos();

  const source = await sources.findRowById(params.id);
  if (!source) throw AppError.notFound('source');

  const body = (await request.json()) as {
    action?: unknown;
    url?: unknown;
    mirrorId?: unknown;
    note?: unknown;
  };

  if (body.action === 'add') {
    const url = canonicalizeExternalUrl(String(body.url ?? ''));
    const parsed = url ? parseExternalUrl(url) : null;
    if (!url || !parsed) {
      throw AppError.validation('That is not an ordinary web address.');
    }

    const added = await mirrors.add({
      sourceId: params.id,
      domain: parsed.domain,
      homepageUrl: url,
      isConfirmed: true,
      note: typeof body.note === 'string' ? body.note.trim() || null : null,
      addedByUserId: admin.id,
    });

    if (!added) {
      throw AppError.validation(
        'Another listing already uses that address. Merge them instead of listing it twice.',
      );
    }

    await audit.record({
      actorId: admin.id,
      action: 'source.mirror.add',
      metadata: { sourceId: params.id, domain: parsed.domain },
    });
    return NextResponse.json({ ok: true, mirror: added });
  }

  const mirrorId = String(body.mirrorId ?? '');
  if (!mirrorId) throw AppError.validation('Which address?');

  if (body.action === 'promote') {
    const moved = await mirrors.makePrimary(params.id, mirrorId);
    if (!moved) throw AppError.notFound('mirror');

    await audit.record({
      actorId: admin.id,
      action: 'source.mirror.promote',
      metadata: { sourceId: params.id, mirrorId },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'confirm') {
    const confirmed = await mirrors.confirm(params.id, mirrorId);
    if (!confirmed) throw AppError.notFound('mirror');
    return NextResponse.json({ ok: true });
  }

  if (body.action === 'remove') {
    const removed = await mirrors.remove(params.id, mirrorId);
    if (!removed) {
      throw AppError.validation(
        'That address is the one the listing uses. Promote another first.',
      );
    }
    return NextResponse.json({ ok: true });
  }

  throw AppError.validation('Unknown action.');
});
