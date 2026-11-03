import { NextResponse } from 'next/server';
import { AppError, checkIconUpload, fetchSiteIcon } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * A moderator's icon for a listing.
 *
 * Contributors could already attach one to a suggestion and a moderator could
 * not touch it afterwards, which meant a wrong or ugly icon was permanent
 * short of deleting the listing. This replaces it, removes it, or fetches the
 * site's own.
 *
 * Whichever route the bytes arrive by, they pass through the same check an
 * uploaded icon does: real type read from the leading bytes, 256 KB cap, PNG,
 * JPEG or WebP only. There is one gate, so there is one place to get it right.
 */
export const PUT = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const { id } = params;

  const source = await repos().sources.findRowById(id);
  if (!source) throw AppError.notFound('source');

  const body = (await request.json()) as { icon?: unknown; fetchFromSite?: unknown };
  const { icons } = repos();

  if (body.fetchFromSite === true) {
    const found = await fetchSiteIcon(source.homepageUrl, (url, init) => fetch(url, init));
    if (!found.ok) throw AppError.validation(found.message);

    await icons.setSourceIcon(
      id,
      { mime: found.mime, bytes: found.bytes, byteSize: found.byteSize },
      admin.id,
    );
    return NextResponse.json({ ok: true, from: found.from, mime: found.mime });
  }

  const check = checkIconUpload(body.icon);
  if (!check.ok) throw AppError.validation(check.message);

  await icons.setSourceIcon(
    id,
    { mime: check.mime, bytes: check.bytes, byteSize: check.byteSize },
    admin.id,
  );
  return NextResponse.json({ ok: true, mime: check.mime });
});

/** Removes the icon, leaving the listing with none rather than a broken one. */
export const DELETE = apiRoute<NextResponse, { id: string }>(async (_request, { params }) => {
  await requireAdmin();
  const { id } = params;

  const source = await repos().sources.findRowById(id);
  if (!source) throw AppError.notFound('source');

  await repos().icons.removeSourceIcon(id);
  return NextResponse.json({ ok: true });
});
