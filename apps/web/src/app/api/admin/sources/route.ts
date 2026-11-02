import { NextResponse } from 'next/server';
import {
  AppError,
  adminBulkDeleteSchema,
  adminCreateSourceSchema,
  canonicalizeExternalUrl,
  flagsFromCategories,
  normalizeDomain,
} from '@couchlist/shared';
import { watchSources } from '@couchlist/db';
import { inArray } from 'drizzle-orm';
import { apiRoute } from '@/lib/api/handler';
import { requireAdmin } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Adds a listing directly, without the suggestion queue.
 *
 * A moderator who already knows a site should not have to suggest it to
 * themselves and then approve it. The queue exists to review strangers' work,
 * not to make the person doing the reviewing fill in a form twice.
 *
 * Published immediately and enabled, which is what "add" means. Credit is
 * deliberately not recorded: nobody found this one, an administrator entered
 * it, and inventing a contribution row would put a name on the public page
 * that did not earn it.
 */
export const POST = apiRoute(async (request) => {
  const admin = await requireAdmin();
  const input = adminCreateSourceSchema.parse(await request.json());

  const homepageUrl = canonicalizeExternalUrl(input.url);
  const domain = normalizeDomain(input.url);
  if (!homepageUrl || !domain) {
    throw AppError.validation('That web address could not be read.');
  }

  const existing = await repos().sources.findByDomain(domain);
  if (existing) {
    throw AppError.validation(`${domain} is already listed.`);
  }

  const rows = await repos()
    .db.insert(watchSources)
    .values({
      name: input.name,
      domain,
      homepageUrl,
      description: input.description ?? null,
      sourceType: 'COMMUNITY',
      hasLotsOfAds: input.hasLotsOfAds,
      qualityLabel: input.qualityLabel ?? null,
      trustedRank: input.trustedRank ?? null,
      trustedNote: input.trustedRank != null ? (input.trustedNote ?? null) : null,
      trustedAt: input.trustedRank != null ? new Date() : null,
      isEnabled: true,
      ...flagsFromCategories(input.categories),
    })
    .returning();

  const created = rows[0]!;
  await repos().audit.record({
    actorId: admin.id,
    action: 'source_created_by_admin',
    metadata: { sourceId: created.id, name: created.name, domain: created.domain },
  });

  return NextResponse.json({ ok: true, id: created.id, domain: created.domain });
});

/**
 * Deletes several sources in one action.
 *
 * The count is the confirmation. Typing a domain back is right for a single
 * deletion and wrong for twenty — a moderator clearing duplicates would spend
 * the time copying strings, and friction that people learn to route around
 * protects nothing. A count cannot come from a stray click either, and it
 * fails safe: if the selection changed under them, the number will not match
 * and nothing is deleted.
 */
export const DELETE = apiRoute(async (request) => {
  const admin = await requireAdmin();
  const input = adminBulkDeleteSchema.parse(await request.json());

  const ids = [...new Set(input.ids)];
  if (ids.length !== input.confirmCount) {
    throw AppError.validation(
      `That selection holds ${ids.length} sources, not ${input.confirmCount}. Nothing was deleted.`,
    );
  }

  const found = await repos().sources.rowsByIds(ids);
  if (found.length === 0) throw AppError.notFound('sources');

  // Recorded before the delete, so the removal survives even if it fails.
  await repos().audit.record({
    actorId: admin.id,
    action: 'sources_bulk_deleted',
    metadata: {
      count: found.length,
      sources: found.map((row) => ({ id: row.id, name: row.name, domain: row.domain })),
      reason: input.reason ?? null,
    },
  });

  await repos()
    .db.delete(watchSources)
    .where(
      inArray(
        watchSources.id,
        found.map((row) => row.id),
      ),
    );

  return NextResponse.json({ ok: true, deleted: found.length });
});
