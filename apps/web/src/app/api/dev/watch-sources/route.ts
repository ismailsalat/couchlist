import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, watchSourceTypeSchema } from '@couchlist/shared';
import {
  applyAvailabilityImport,
  applySourceImport,
  previewAvailabilityImport,
  previewSourceImport,
} from '@couchlist/db';
import { apiRoute } from '@/lib/api/handler';
import { requireTrustedOperator } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const importSchema = z.object({
  input: z.string().min(1).max(1_000_000),
  apply: z.boolean().default(false),
  kind: z.enum(['sources', 'availability']).default('sources'),
});

const listSchema = z.object({
  search: z.string().max(120).optional(),
  sourceType: watchSourceTypeSchema.optional(),
  enabled: z.enum(['true', 'false']).optional(),
});

const toggleSchema = z.object({
  sourceId: z.string().min(1).max(80),
  isEnabled: z.boolean(),
});

/** Source registry listing for the dev tools. */
export const GET = apiRoute(async (request) => {
  await requireTrustedOperator();

  const url = new URL(request.url);
  const query = listSchema.parse({
    search: url.searchParams.get('search') ?? undefined,
    sourceType: url.searchParams.get('sourceType') ?? undefined,
    enabled: url.searchParams.get('enabled') ?? undefined,
  });

  const { watchSources } = repos();
  const sources = await watchSources.listSources({
    search: query.search,
    sourceType: query.sourceType,
    isEnabled: query.enabled === undefined ? undefined : query.enabled === 'true',
  });
  const [stats, candidates, reports] = await Promise.all([
    watchSources.sourceStats(sources.map((source) => source.id), null),
    watchSources.pendingCandidates(100),
    watchSources.openReports(100),
  ]);

  return NextResponse.json({
    sources: sources.map((source) => ({ ...source, stats: stats.get(source.id) ?? null })),
    candidates,
    reports,
  });
});

/**
 * Preview or apply a bulk source/availability import.
 * Both paths reuse the same database services used by the CLI tools.
 */
export const POST = apiRoute(async (request) => {
  const operator = await requireTrustedOperator();
  checkRateLimit(`watch-import:${operator.id}`, 12);

  const body = importSchema.parse(await request.json());
  const { watchSources, audit } = repos();

  if (body.kind === 'availability') {
    if (!body.apply) {
      return NextResponse.json(await previewAvailabilityImport(watchSources, body.input));
    }

    const outcome = await applyAvailabilityImport(watchSources, body.input);
    await audit.record({
      actorId: operator.id,
      action: 'watch.availability.imported',
      metadata: {
        created: outcome.created,
        updated: outcome.updated,
        failed: outcome.failed.length,
        rows: outcome.rows,
      },
    });
    return NextResponse.json(outcome);
  }

  if (!body.apply) {
    return NextResponse.json(await previewSourceImport(watchSources, body.input));
  }

  const outcome = await applySourceImport(watchSources, body.input);
  await audit.record({
    actorId: operator.id,
    action: 'watch.sources.imported',
    metadata: {
      created: outcome.created,
      updated: outcome.updated,
      failed: outcome.failed.length,
      rows: outcome.rows,
    },
  });

  return NextResponse.json(outcome);
});

/** Enable/disable an existing registry source without deleting its history. */
export const PATCH = apiRoute(async (request) => {
  const operator = await requireTrustedOperator();
  checkRateLimit(`watch-toggle:${operator.id}`, 30);

  const body = toggleSchema.parse(await request.json());
  const { watchSources, audit } = repos();
  const source = await watchSources.setSourceEnabled(body.sourceId, body.isEnabled);
  if (!source) throw AppError.notFound('watch source');

  await audit.record({
    actorId: operator.id,
    action: body.isEnabled ? 'watch.source.enabled' : 'watch.source.disabled',
    metadata: { sourceId: source.id, domain: source.domain },
  });

  return NextResponse.json({ source });
});
