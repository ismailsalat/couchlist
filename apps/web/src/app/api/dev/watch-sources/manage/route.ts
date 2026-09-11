import { z } from 'zod';
import {
  AppError,
  canonicalizeExternalUrl,
  normalizeDomain,
  watchAccessTypeSchema,
  watchSourceTypeSchema,
} from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireTrustedOperator } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('quick-add'),
    homepageUrl: z.string().min(1).max(2048),
    name: z.string().max(120).optional(),
    sourceType: watchSourceTypeSchema.default('UNVERIFIED'),
    accessType: watchAccessTypeSchema.default('UNKNOWN'),
    supportsAnime: z.boolean().default(false),
    supportsMovies: z.boolean().default(false),
    supportsTv: z.boolean().default(false),
    isEnabled: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('edit'),
    sourceId: z.string().min(1).max(80),
    name: z.string().min(1).max(120),
    sourceType: watchSourceTypeSchema,
    accessType: watchAccessTypeSchema,
    supportsAnime: z.boolean(),
    supportsMovies: z.boolean(),
    supportsTv: z.boolean(),
    isEnabled: z.boolean(),
    adminRankPenalty: z.number().int().min(0).max(100).optional(),
    adminHealthOverride: z.enum(['WORKING', 'DEGRADED', 'DOWN']).nullable().optional(),
  }),
  z.object({
    action: z.literal('admin-control'),
    sourceId: z.string().min(1).max(80),
    adminRankPenalty: z.number().int().min(0).max(100),
    adminHealthOverride: z.enum(['WORKING', 'DEGRADED', 'DOWN']).nullable(),
  }),
  z.object({
    action: z.literal('approve'),
    candidateId: z.string().min(1).max(80),
    sourceType: watchSourceTypeSchema.default('UNVERIFIED'),
    supportsAnime: z.boolean(),
    supportsMovies: z.boolean(),
    supportsTv: z.boolean(),
  }),
  z.object({ action: z.literal('reject'), candidateId: z.string().min(1).max(80) }),
  z.object({ action: z.literal('resolve-report'), reportId: z.string().min(1).max(80) }),
  z.object({ action: z.literal('hide-post'), postId: z.string().min(1).max(80) }),
]);

export const POST = apiRoute(async (request) => {
  const operator = await requireTrustedOperator();
  checkRateLimit(`watch-manage:${operator.id}`, 60);
  const body = schema.parse(await request.json());
  const { watchSources, audit } = repos();

  if (body.action === 'quick-add') {
    const homepageUrl = canonicalizeExternalUrl(body.homepageUrl);
    const fallbackName = homepageUrl ? normalizeDomain(homepageUrl) : null;
    if (!homepageUrl || !fallbackName) {
      throw AppError.validation('Enter a valid public http(s) website URL.');
    }
    const source = await watchSources.upsertImportedSource({
      domain: fallbackName,
      homepageUrl,
      name: body.name?.trim() || fallbackName,
      sourceType: body.sourceType,
      accessType: body.accessType,
      origin: 'MANUAL',
      supportsAnime: body.supportsAnime,
      supportsMovies: body.supportsMovies,
      supportsTv: body.supportsTv,
      isEnabled: body.isEnabled,
    });
    await audit.record({ actorId: operator.id, action: 'watch.source.quick_added', metadata: { sourceId: source.id } });
    return { ok: true, source };
  }

  if (body.action === 'edit') {
    const source = await watchSources.updateSource(body);
    if (!source) throw AppError.notFound('watch source');
    await audit.record({ actorId: operator.id, action: 'watch.source.edited', metadata: { sourceId: source.id } });
    return { ok: true, source };
  }

  if (body.action === 'admin-control') {
    const source = await watchSources.updateSource({
      sourceId: body.sourceId,
      adminRankPenalty: body.adminRankPenalty,
      adminHealthOverride: body.adminHealthOverride,
    });
    if (!source) throw AppError.notFound('watch source');
    await audit.record({
      actorId: operator.id,
      action: 'watch.source.admin_controlled',
      metadata: {
        sourceId: source.id,
        adminRankPenalty: body.adminRankPenalty,
        adminHealthOverride: body.adminHealthOverride,
      },
    });
    return { ok: true, source };
  }

  if (body.action === 'approve') {
    const source = await watchSources.approveCandidate({
      candidateId: body.candidateId,
      reviewerUserId: operator.id,
      sourceType: body.sourceType,
      supportsAnime: body.supportsAnime,
      supportsMovies: body.supportsMovies,
      supportsTv: body.supportsTv,
    });
    if (!source) throw AppError.notFound('watch source suggestion');
    return { ok: true, source };
  }

  if (body.action === 'reject') {
    await watchSources.rejectCandidate(body.candidateId, operator.id);
    return { ok: true };
  }

  if (body.action === 'resolve-report') {
    await watchSources.resolveReport(body.reportId, operator.id);
    return { ok: true };
  }

  await watchSources.hideServerPost(body.postId);
  return { ok: true };
});
