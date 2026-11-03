import { NextResponse } from 'next/server';
import { AppError } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireVerifiedUser } from '@/lib/api/guards';
import { repos } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Answering or dismissing the survey.
 *
 * Both close it permanently. The answer is a number from one to five and an
 * optional yes or no about ad blockers, and nothing else is recorded with it
 * — no page, no referrer, no timestamp beyond when it was answered.
 */
export const POST = apiRoute(async (request) => {
  const user = await requireVerifiedUser();
  const body = (await request.json()) as {
    ease?: unknown;
    usesAdBlocker?: unknown;
    dismiss?: unknown;
  };

  const { survey } = repos();

  if (body.dismiss === true) {
    await survey.close(user.id);
    return NextResponse.json({ ok: true, closed: true });
  }

  const ease = Number(body.ease);
  if (!Number.isInteger(ease) || ease < 1 || ease > 5) {
    throw AppError.validation('Pick a number from one to five.');
  }

  const usesAdBlocker =
    body.usesAdBlocker === true ? true : body.usesAdBlocker === false ? false : null;

  await survey.answer(user.id, { ease, usesAdBlocker });
  return NextResponse.json({ ok: true, closed: true });
});
