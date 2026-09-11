import { NextResponse } from 'next/server';
import { z } from 'zod';
import { watchReportReasonSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

const reportSchema = z.object({
  mediaWatchSourceId: z.string().min(1).max(80).optional(),
  watchSourceId: z.string().min(1).max(80).optional(),
  reason: watchReportReasonSchema,
  details: z.string().max(500).optional(),
}).refine((value) => Number(Boolean(value.mediaWatchSourceId)) + Number(Boolean(value.watchSourceId)) === 1, {
  message: 'Choose exactly one source to report.',
});

/** Simple source/listing report. Reports never auto-delete a source. */
export const POST = apiRoute(async (request) => {
  const user = await requireUser();
  checkRateLimit(`watch-report:${user.id}`, 10);

  const body = reportSchema.parse(await request.json());
  const { watchSources, audit } = repos();

  const report = await watchSources.createReport({
    mediaWatchSourceId: body.mediaWatchSourceId ?? null,
    watchSourceId: body.watchSourceId ?? null,
    reportedByUserId: user.id,
    reason: body.reason,
    details: body.details ?? null,
  });

  await audit.record({
    actorId: user.id,
    action: 'watch.source.reported',
    metadata: {
      mediaWatchSourceId: body.mediaWatchSourceId ?? null,
      watchSourceId: body.watchSourceId ?? null,
      reason: body.reason,
    },
  });

  return NextResponse.json({ recorded: report !== null });
});
