import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Prefixed, non-sequential ids.
 *
 * The prefix makes a stray id readable in a log; the random body means one
 * user's id cannot be guessed by incrementing another's. Defined here rather
 * than imported so the database schema stays independent of application runtime modules.
 */
export function createId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString('hex')}`;
}

/**
 * Couchlist database schema.
 *
 * Two rules shape it:
 *  1. Media is identified by (provider, providerMediaId, mediaType). A provider
 *     id alone is not unique - TMDB reuses ids between movies and TV.
 *  2. Duplicate list entries are impossible because of a database constraint,
 *     not because application code remembers to check.
 */

export const mediaProviderEnum = pgEnum('media_provider', ['ANILIST', 'JIKAN', 'KITSU', 'TMDB']);
export const mediaTypeEnum = pgEnum('media_type', ['ANIME', 'MOVIE', 'TV']);
export const listStatusEnum = pgEnum('list_status', ['WATCHING', 'COMPLETED', 'PLAN_TO_WATCH']);
export const profileVisibilityEnum = pgEnum('profile_visibility', ['MUTUAL_SERVERS', 'PRIVATE']);
export const friendshipStatusEnum = pgEnum('friendship_status', ['PENDING', 'ACCEPTED']);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('usr')),
    discordId: text('discord_id').notNull(),
    username: text('username').notNull(),
    globalName: text('global_name'),
    avatarUrl: text('avatar_url'),

    // Privacy defaults to the more private of the two options.
    profileVisibility: profileVisibilityEnum('profile_visibility')
      .notNull()
      .default('MUTUAL_SERVERS'),
    showRatings: boolean('show_ratings').notNull().default(true),
    showProgress: boolean('show_progress').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    discordIdKey: uniqueIndex('users_discord_id_key').on(table.discordId),
    lastSeenIdx: index('users_last_seen_idx').on(table.lastSeenAt),
  }),
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('ses')),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Only a hash is stored: a leaked database row cannot be replayed as a session.
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashKey: uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
    userIdx: index('sessions_user_idx').on(table.userId),
    expiresIdx: index('sessions_expires_idx').on(table.expiresAt),
  }),
);

export const discordGuilds = pgTable(
  'discord_guilds',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('gld')),
    discordId: text('discord_id').notNull(),
    name: text('name').notNull(),
    iconUrl: text('icon_url'),

    // False once the bot is removed. Members keep their lists either way.
    botConnected: boolean('bot_connected').notNull().default(false),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    discordIdKey: uniqueIndex('guilds_discord_id_key').on(table.discordId),
    connectedIdx: index('guilds_connected_idx').on(table.botConnected),
  }),
);

export const guildSettings = pgTable(
  'guild_settings',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('gst')),
    guildId: text('guild_id')
      .notNull()
      .references(() => discordGuilds.id, { onDelete: 'cascade' }),

    enabled: boolean('enabled').notNull().default(true),
    // Off by default so Couchlist never posts in a server uninvited.
    notificationsEnabled: boolean('notifications_enabled').notNull().default(false),
    announceChannelId: text('announce_channel_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    guildKey: uniqueIndex('guild_settings_guild_key').on(table.guildId),
  }),
);

export const guildMemberships = pgTable(
  'guild_memberships',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('mem')),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guildId: text('guild_id')
      .notNull()
      .references(() => discordGuilds.id, { onDelete: 'cascade' }),

    // Refreshed from Discord on every login. Rows go inactive rather than being
    // deleted, so we never claim access the user no longer has.
    isActive: boolean('is_active').notNull().default(true),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userGuildKey: uniqueIndex('memberships_user_guild_key').on(table.userId, table.guildId),
    guildActiveIdx: index('memberships_guild_active_idx').on(table.guildId, table.isActive),
    userActiveIdx: index('memberships_user_active_idx').on(table.userId, table.isActive),
  }),
);


export const friendships = pgTable(
  'friendships',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('frn')),
    // userA/userB are stored in lexical order so one pair can only exist once.
    userAId: text('user_a_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userBId: text('user_b_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    requestedByUserId: text('requested_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatusEnum('status').notNull().default('PENDING'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pairKey: uniqueIndex('friendships_pair_key').on(table.userAId, table.userBId),
    userAIdx: index('friendships_user_a_idx').on(table.userAId, table.status),
    userBIdx: index('friendships_user_b_idx').on(table.userBId, table.status),
    pairOrderCheck: check('friendships_order_check', sql`${table.userAId} < ${table.userBId}`),
    requesterCheck: check(
      'friendships_requester_check',
      sql`${table.requestedByUserId} = ${table.userAId} OR ${table.requestedByUserId} = ${table.userBId}`,
    ),
  }),
);

export const mediaEntries = pgTable(
  'media_entries',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('ent')),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    provider: mediaProviderEnum('provider').notNull(),
    providerMediaId: text('provider_media_id').notNull(),
    mediaType: mediaTypeEnum('media_type').notNull(),

    status: listStatusEnum('status').notNull(),
    rating: doublePrecision('rating'),
    progress: integer('progress'),

    // Denormalised so lists and friend activity render without an API call.
    title: text('title').notNull(),
    posterUrl: text('poster_url'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The duplicate-entry guarantee lives here, in the database.
    userMediaKey: uniqueIndex('entries_user_media_key').on(
      table.userId,
      table.provider,
      table.providerMediaId,
      table.mediaType,
    ),
    userStatusIdx: index('entries_user_status_idx').on(table.userId, table.status),
    mediaIdx: index('entries_media_idx').on(
      table.provider,
      table.providerMediaId,
      table.mediaType,
    ),
    userUpdatedIdx: index('entries_user_updated_idx').on(table.userId, table.updatedAt),
  }),
);

export const mediaCache = pgTable(
  'media_cache',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('cch')),

    provider: mediaProviderEnum('provider').notNull(),
    providerMediaId: text('provider_media_id').notNull(),
    mediaType: mediaTypeEnum('media_type').notNull(),

    title: text('title').notNull(),
    year: integer('year'),
    posterUrl: text('poster_url'),
    bannerUrl: text('banner_url'),
    payload: jsonb('payload').notNull(),

    fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    mediaKey: uniqueIndex('cache_media_key').on(
      table.provider,
      table.providerMediaId,
      table.mediaType,
    ),
    expiresIdx: index('cache_expires_idx').on(table.expiresAt),
  }),
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('aud')),
    // Kept on delete so the audit trail survives an account deletion.
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    guildId: text('guild_id').references(() => discordGuilds.id, { onDelete: 'set null' }),

    action: text('action').notNull(),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    guildIdx: index('audit_guild_idx').on(table.guildId, table.createdAt),
    actionIdx: index('audit_action_idx').on(table.action, table.createdAt),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type DiscordGuildRow = typeof discordGuilds.$inferSelect;
export type GuildMembership = typeof guildMemberships.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type MediaEntry = typeof mediaEntries.$inferSelect;
export type NewMediaEntry = typeof mediaEntries.$inferInsert;
export type MediaCacheRow = typeof mediaCache.$inferSelect;
export type AuditLogRow = typeof auditLogs.$inferSelect;
