import { buildSavedExport, exportResponseHeaders, parseExportFormat } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Exports this account's saved sources.
 *
 * Four formats, chosen with `?format=`: CSV for a spreadsheet, plain text to
 * paste anywhere, Markdown for notes, JSON for anything that will read it
 * back. Only the caller's own rows, private notes included, because they are
 * the caller's to take.
 *
 * An unrecognised format falls back to CSV rather than erroring: this is a
 * download link, and a typo in a query string should still give you your data.
 */
export const GET = apiRoute(async (request) => {
  const user = await requireUser();

  const format = parseExportFormat(new URL(request.url).searchParams.get('format'));
  const saved = await repos().sources.savedWithNotes(user.id);

  const file = buildSavedExport(
    format,
    saved.map((entry) => ({
      name: entry.source.name,
      homepageUrl: entry.source.homepageUrl,
      domain: entry.source.domain,
      categories: entry.source.categories,
      savedAt: entry.savedAt,
      note: entry.note,
    })),
  );

  return new Response(file.body, { headers: exportResponseHeaders(file) });
});
