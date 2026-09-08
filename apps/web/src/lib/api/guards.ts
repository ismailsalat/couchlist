import 'server-only';
import { AppError, ERROR_CODES, isGuildAllowed } from '@couchlist/shared';
import type { User } from '@couchlist/db';
import { config } from '../config';
import { repos } from '../db';
import { currentUser } from '../auth/session';

/**
 * Authorization guards.
 *
 * Every protected route calls one of these. The frontend hiding a button is
 * never the control - a hand-written request has to fail here.
 */

/** The signed-in user, or a 401. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw AppError.unauthorized();
  return user;
}

export interface GuildAccess {
  user: User;
  guildId: string;
  discordGuildId: string;
}

/**
 * Confirms the user is an active member of the guild.
 *
 * Accepts either the internal guild id or the Discord snowflake, because URLs
 * use the Discord id. Test mode is enforced here too, so a tester cannot reach
 * a server outside the allowlist by editing a URL.
 */
export async function requireGuildMember(guildIdOrDiscordId: string): Promise<GuildAccess> {
  const user = await requireUser();
  const { guilds } = repos();

  // URLs use the Discord snowflake; internal code sometimes has our own id.
  const guild = /^\d{5,25}$/.test(guildIdOrDiscordId)
    ? await guilds.findByDiscordId(guildIdOrDiscordId)
    : await guilds.findById(guildIdOrDiscordId);

  if (!guild || !guild.botConnected) throw AppError.forbiddenGuild(guildIdOrDiscordId);

  if (!isGuildAllowed(config(), guild.discordId)) {
    throw new AppError(ERROR_CODES.CL_NOT_IN_TEST_ALLOWLIST, {
      context: { guildId: guild.discordId },
    });
  }

  if (!(await guilds.isMember(user.id, guild.id))) {
    throw AppError.forbiddenGuild(guild.discordId);
  }

  return { user, guildId: guild.id, discordGuildId: guild.discordId };
}

/**
 * Confirms the viewer may see the target user's lists.
 *
 * Allows an explicit Couchlist friend or a member from a shared connected
 * server, while respecting the target's privacy setting. A PRIVATE profile is
 * visible only to its owner.
 */
export async function requireProfileAccess(targetUserId: string): Promise<{
  viewer: User;
  target: User;
  isSelf: boolean;
}> {
  const viewer = await requireUser();
  const { users, guilds, friends } = repos();

  const target = await users.findById(targetUserId);
  if (!target) throw AppError.notFound('user');

  if (target.id === viewer.id) return { viewer, target, isSelf: true };

  if (target.profileVisibility === 'PRIVATE') {
    throw AppError.forbidden({ reason: 'private_profile' });
  }

  const [directFriend, shared] = await Promise.all([
    friends.areFriends(viewer.id, target.id),
    guilds.sharedGuildIds(viewer.id, target.id),
  ]);
  if (!directFriend && shared.length === 0) {
    throw AppError.forbidden({ reason: 'not_friend_or_shared_server' });
  }

  return { viewer, target, isSelf: false };
}

/**
 * User ids the viewer is allowed to see data for, inside one guild.
 * Members with a PRIVATE profile are excluded from everyone else's view.
 */
export async function visibleMemberIds(
  viewerId: string,
  guildId: string,
): Promise<string[]> {
  const members = await repos().guilds.membersOf(guildId);
  return members
    .filter((member) => member.id === viewerId || member.profileVisibility !== 'PRIVATE')
    .map((member) => member.id);
}
