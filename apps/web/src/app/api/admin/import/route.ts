import { NextResponse } from 'next/server';
import { AppError } from '@couchlist/shared';
import { applySourceImport, previewSourceImport } from '@couchlist/db';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Bigger than a form post, small enough that a hostile paste is bounded. */
const MAX_IMPORT_CHARS = 2_000_000;

/**
 * Bulk import, in two steps.
 *
 * A preview writes nothing: it parses, compares against what is listed, and
 * reports what would happen. Applying is a second, explicit request. Fifty
 * links from a forum thread are rarely all good, and finding that out after
 * they are published is the wrong order.
 *
 * Everything new lands hidden, which is the repository's default for an
 * imported row. Publishing stays a decision somebody makes while looking at
 * the list.
 */
export const POST = apiRoute(async (request) => {
  await requireAdmin();

  const body = (await request.json()) as { text?: unknown; apply?: unknown };
  if (typeof body.text !== 'string' || body.text.trim() === '') {
    throw AppError.validation('There is nothing to import.');
  }
  if (body.text.length > MAX_IMPORT_CHARS) {
    throw AppError.validation(
      `That file is ${Math.round(body.text.length / 1024)} KB. The limit is ${Math.round(MAX_IMPORT_CHARS / 1024)} KB — split it and import in parts.`,
    );
  }

  const repository = repos().watchSources;

  if (body.apply === true) {
    const outcome = await applySourceImport(repository, body.text);
    return NextResponse.json({ ok: true, ...outcome });
  }

  const preview = await previewSourceImport(repository, body.text);
  return NextResponse.json({ ok: true, applied: false, ...preview });
});
