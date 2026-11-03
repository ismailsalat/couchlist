import { NextResponse } from 'next/server';
import {
  AppError,
  PREVIEW_MAX_BYTES,
  checkIconUpload,
  fetchSitePreview,
  iconResponseHeaders,
} from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { captureNow } from '@/lib/capture';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The preview picture on a listing.
 *
 * Two ways to get one, and deliberately not a third. A moderator can upload a
 * picture, or Couchlist can fetch the share image the site publishes in its
 * own HTML for other people's pages to display. What it does not do is take
 * an automated screenshot of somebody's page: that is a copy of their content
 * rather than artwork they published for this, and a directory whose whole
 * position is "it lists, it does not host" should not quietly start hosting
 * pictures of other people's pages.
 */
export const PUT = apiRoute<NextResponse, { id: string }>(async (request, { params }) => {
  const admin = await requireAdmin();
  const source = await repos().sources.findRowById(params.id);
  if (!source) throw AppError.notFound('source');

  const body = (await request.json()) as {
    image?: unknown;
    fetchFromSite?: unknown;
    screenshot?: unknown;
  };
  const { icons } = repos();

  /*
   * A real screenshot, taken now.
   *
   * The share image a site publishes is often its logo, which is why this
   * exists: when the site does not publish a usable picture, photograph the
   * page instead of asking somebody to go and do it by hand.
   */
  if (body.screenshot === true) {
    const result = await captureNow(params.id);
    if (!result.ok) throw AppError.validation(result.message);
    return NextResponse.json({ ok: true, screenshot: true });
  }

  if (body.fetchFromSite === true) {
    const found = await fetchSitePreview(source.homepageUrl, (url, init) => fetch(url, init));
    if (!found.ok) throw AppError.validation(found.message);

    await icons.setSourcePreview(
      params.id,
      { mime: found.mime, bytes: found.bytes, byteSize: found.byteSize },
      admin.id,
      `Published by ${source.domain}`,
    );
    return NextResponse.json({ ok: true, from: found.from });
  }

  const check = checkIconUpload(body.image, PREVIEW_MAX_BYTES);
  if (!check.ok) throw AppError.validation(check.message);

  await icons.setSourcePreview(
    params.id,
    { mime: check.mime, bytes: check.bytes, byteSize: check.byteSize },
    admin.id,
    'Added by a moderator',
  );
  return NextResponse.json({ ok: true });
});

export const DELETE = apiRoute<NextResponse, { id: string }>(async (_request, { params }) => {
  await requireAdmin();
  const source = await repos().sources.findRowById(params.id);
  if (!source) throw AppError.notFound('source');

  await repos().icons.removeSourcePreview(params.id);
  return NextResponse.json({ ok: true });
});

/**
 * The preview bytes, approved or not.
 *
 * The public route refuses anything a moderator has not accepted, which is
 * exactly right for readers and useless for the person who has to decide. The
 * admin route serves it either way.
 */
export const GET = apiRoute<Response, { id: string }>(async (_request, { params }) => {
  await requireAdmin();

  const preview = await repos().icons.previewForReview(params.id);
  if (!preview) throw AppError.notFound('preview');

  return new Response(new Uint8Array(preview.bytes), {
    headers: iconResponseHeaders(preview.mime, false),
  });
});
