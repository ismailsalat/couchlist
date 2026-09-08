import { privacySettingsSchema } from '@couchlist/shared';
import { apiRoute } from '@/lib/api/handler';
import { requireUser } from '@/lib/api/guards';
import { destroySession } from '@/lib/auth/session';
import { repos } from '@/lib/db';
import { buildProfile } from '@/lib/services/profile';

export const dynamic = 'force-dynamic';

const exportRoute = apiRoute(async () => {
  const user = await requireUser();
  const data = await repos().users.exportData(user.id);
  return { exportedAt: new Date().toISOString(), ...data };
});

export const GET = apiRoute(async () => {
  const user = await requireUser();
  const profile = await buildProfile(user, true);
  return {
    ...profile,
    privacy: {
      profileVisibility: user.profileVisibility,
      showRatings: user.showRatings,
      showProgress: user.showProgress,
    },
  };
});

/** Update privacy settings. Only ever affects the caller's own row. */
export const PATCH = apiRoute(async (request) => {
  const user = await requireUser();
  const settings = privacySettingsSchema.partial().parse(await request.json());

  const updated = await repos().users.updatePrivacy(user.id, settings);
  return {
    privacy: {
      profileVisibility: updated?.profileVisibility,
      showRatings: updated?.showRatings,
      showProgress: updated?.showProgress,
    },
  };
});

/**
 * Account deletion or disconnect.
 *
 * `?mode=disconnect` keeps the lists but ends every session and forgets server
 * membership. The default removes the account outright. Either way active
 * sessions are revoked first, so an existing cookie stops working immediately.
 */
export const DELETE = apiRoute(async (request) => {
  const user = await requireUser();
  const mode = new URL(request.url).searchParams.get('mode');
  const { users, audit } = repos();

  if (mode === 'disconnect') {
    await users.disconnect(user.id);
    await audit.record({ actorId: user.id, action: 'account.disconnected' });
    await destroySession();
    return { ok: true, mode: 'disconnect' };
  }

  // Recorded without an actor id, since the actor is about to stop existing.
  await audit.record({ actorId: null, action: 'account.deleted' });
  await users.revokeSessions(user.id);
  await users.deleteAccount(user.id);
  await destroySession();

  return { ok: true, mode: 'delete' };
});

/** Data export: everything Couchlist holds about the caller. */
export const POST = exportRoute;
