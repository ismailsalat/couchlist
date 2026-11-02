import { NextResponse } from 'next/server';
import { suggestGuideSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireVerifiedUser } from '@/lib/api/guards';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Suggests a new guide or tool.
 *
 * Goes to review like any other contribution, with the same credit choice.
 * Nothing is published until a moderator approves it.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireVerifiedUser();
  checkRateLimit(`guide-suggest:${user.id}`, 10);

  const input = suggestGuideSchema.parse(await request.json());
  const suggestion = await repos().guides.createSuggestion({
    kind: 'NEW_GUIDE',
    submittedByUserId: user.id,
    creditMode: input.creditMode,
    title: input.title,
    topic: input.topic,
    body: input.body,
    links: input.links,
  });

  return NextResponse.json({ ok: true, suggestionId: suggestion.id });
});
