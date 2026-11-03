import { AppError } from '@couchlist/shared';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The whole directory, in exactly the shape the importer accepts.
 *
 * Round-tripping is the point: export, fix fifty descriptions in a
 * spreadsheet, import the same file back. It is also the simplest backup
 * there is — a file you can read, diff and keep somewhere that is not the
 * database.
 *
 * Hidden listings are included and marked, because a backup that silently
 * drops the things you have not published yet is not a backup.
 */
export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
  } catch (error) {
    const status = error instanceof AppError ? error.status : 500;
    return new Response(JSON.stringify({ error: 'Not allowed.' }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  const rows = await repos().sources.exportAll();
  const day = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(rows, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="couchlist-${day}.json"`,
      'cache-control': 'no-store',
    },
  });
}
