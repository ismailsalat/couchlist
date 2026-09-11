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

export const watchSourceTypeEnum = pgEnum('watch_source_type', [
  'OFFICIAL',
  'FREE_AD_SUPPORTED',
  'RENT_BUY',
  'LIBRARY',
  'PUBLIC_DOMAIN',
  'COMMUNITY',
  'UNVERIFIED',
]);
export const watchAccessTypeEnum = pgEnum('watch_access_type', [
  'SUBSCRIPTION',
  'FREE',
  'FREE_WITH_ADS',
  'RENT',
  'BUY',
  'LIBRARY_CARD',
  'UNKNOWN',
]);
export const watchAvailabilityStatusEnum = pgEnum('watch_availability_status', [
  'AVAILABLE',
  'UNKNOWN',
  'RECENTLY_UNAVAILABLE',
]);
export const watchSourceOriginEnum = pgEnum('watch_source_origin', [
  'OFFICIAL_API',
  'MANUAL',
  'COMMUNITY',
  'DIRECTORY',
  'OTHER',
]);
export const watchCandidateStatusEnum = pgEnum('watch_candidate_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
]);
export const watchReportReasonEnum = pgEnum('watch_report_reason', [
  'BROKEN_LINK',
  'WRONG_TITLE',
  'WRONG_EPISODE',
  'MISLEADING_QUALITY',
  'UNSAFE_REDIRECT',
  'SPAM',
  'OTHER',
]);
export const watchHealthVoteEnum = pgEnum('watch_health_vote', ['WORKING', 'BROKEN']);
export const watchQualityEnum = pgEnum('watch_quality', [
  '4K',
  '1080p',
  '720p',
  'SD',
  'HD_CLAIMED',
  'UNKNOWN',
]);
export const watchAudioEnum = pgEnum('watch_audio', ['SUB', 'DUB', 'SUB_DUB', 'UNKNOWN']);

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
    // Last successful Discord guild-membership refresh. This lets the web app
    // refresh joins/leaves without forcing a logout/login loop or hitting Discord
    // on every page request.
    guildsSyncedAt: timestamp('guilds_synced_at', { withTimezone: true }),
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
    // Cross-provider identity for Anime. Example: `mal:21` for One Piece.
    // Null means the row predates canonicalization or the provider has not
    // exposed a trustworthy mapping yet.
    canonicalMediaKey: text('canonical_media_key'),

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
    userCanonicalKey: uniqueIndex('entries_user_canonical_key')
      .on(table.userId, table.canonicalMediaKey)
      .where(sql`${table.canonicalMediaKey} is not null`),
    userStatusIdx: index('entries_user_status_idx').on(table.userId, table.status),
    mediaIdx: index('entries_media_idx').on(
      table.provider,
      table.providerMediaId,
      table.mediaType,
    ),
    userUpdatedIdx: index('entries_user_updated_idx').on(table.userId, table.updatedAt),
  }),
);

/**
 * Learned Anime provider aliases.
 *
 * Once Couchlist learns that ANILIST:30013 and JIKAN:21 both mean mal:21,
 * later profile/server loads can reconcile them without another provider call.
 */
export const animeAliases = pgTable(
  'anime_aliases',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('als')),
    provider: mediaProviderEnum('provider').notNull(),
    providerMediaId: text('provider_media_id').notNull(),
    canonicalMediaKey: text('canonical_media_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    providerKey: uniqueIndex('anime_aliases_provider_key').on(
      table.provider,
      table.providerMediaId,
    ),
    canonicalIdx: index('anime_aliases_canonical_idx').on(table.canonicalMediaKey),
    animeProviderCheck: check(
      'anime_aliases_provider_check',
      sql`${table.provider} <> 'TMDB'`,
    ),
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

/**
 * Global registry of places a title can be watched.
 *
 * One row per service, not per title: adding a source is a database insert, and
 * nothing about rendering it is hard-coded in the application.
 */
export const watchSources = pgTable(
  'watch_sources',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('wsr')),
    name: text('name').notNull(),
    // Normalised (lowercase, no leading www) so two spellings cannot both exist.
    domain: text('domain').notNull(),
    homepageUrl: text('homepage_url').notNull(),

    sourceType: watchSourceTypeEnum('source_type').notNull(),
    accessType: watchAccessTypeEnum('access_type').notNull().default('UNKNOWN'),

    supportsAnime: boolean('supports_anime').notNull().default(false),
    supportsMovies: boolean('supports_movies').notNull().default(false),
    supportsTv: boolean('supports_tv').notNull().default(false),

    // Simple operator controls for the public directory. A penalty lowers
    // ranking without deleting history; a health override is reversible.
    adminRankPenalty: integer('admin_rank_penalty').notNull().default(0),
    adminHealthOverride: text('admin_health_override'),

    requiresAccount: boolean('requires_account').notNull().default(false),
    regionInfo: text('region_info'),

    // Verification is a human decision; enablement is the on/off switch. A row
    // can be trusted but temporarily disabled, or enabled while still unverified.
    isVerified: boolean('is_verified').notNull().default(false),
    isEnabled: boolean('is_enabled').notNull().default(false),

    // Only ever true for sources that explicitly permit embedding. Everything
    // else opens in a new tab; Couchlist does not frame third-party players.
    allowsEmbed: boolean('allows_embed').notNull().default(false),

    origin: watchSourceOriginEnum('origin').notNull().default('MANUAL'),
    originUrl: text('origin_url'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }),

    lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainKey: uniqueIndex('watch_sources_domain_key').on(table.domain),
    enabledIdx: index('watch_sources_enabled_idx').on(table.isEnabled, table.sourceType),
    typeIdx: index('watch_sources_type_idx').on(table.sourceType),
    adminRankPenaltyCheck: check(
      'watch_sources_admin_rank_penalty_check',
      sql`${table.adminRankPenalty} between 0 and 100`,
    ),
    adminHealthOverrideCheck: check(
      'watch_sources_admin_health_override_check',
      sql`${table.adminHealthOverride} is null or ${table.adminHealthOverride} in ('WORKING', 'DEGRADED', 'DOWN')`,
    ),
  }),
);

/**
 * Availability of one title on one source.
 *
 * `contentKey` is Couchlist's canonical media concept, not a provider id: for
 * Anime that is `CANONICAL:mal:<id>` once identity has been resolved, so the
 * same title arriving via AniList, Jikan or Kitsu maps to a single row rather
 * than three. Movies and TV use the TMDB identity, which is already canonical.
 */
export const mediaWatchSources = pgTable(
  'media_watch_sources',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('mws')),
    watchSourceId: text('watch_source_id')
      .notNull()
      .references(() => watchSources.id, { onDelete: 'cascade' }),

    contentKey: text('content_key').notNull(),
    mediaType: mediaTypeEnum('media_type').notNull(),
    // Kept for debugging and re-resolution; never used as the identity.
    provider: mediaProviderEnum('provider'),
    providerMediaId: text('provider_media_id'),
    canonicalMediaKey: text('canonical_media_key'),

    accessType: watchAccessTypeEnum('access_type').notNull().default('UNKNOWN'),
    quality: watchQualityEnum('quality').notNull().default('UNKNOWN'),
    audio: watchAudioEnum('audio').notNull().default('UNKNOWN'),
    subAvailable: boolean('sub_available'),
    dubAvailable: boolean('dub_available'),
    priceLabel: text('price_label'),

    availabilityUrl: text('availability_url').notNull(),
    availabilityStatus: watchAvailabilityStatusEnum('availability_status')
      .notNull()
      .default('UNKNOWN'),

    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The no-duplicate-availability guarantee, enforced by the database.
    contentSourceKey: uniqueIndex('media_watch_sources_content_source_key').on(
      table.contentKey,
      table.watchSourceId,
    ),
    contentIdx: index('media_watch_sources_content_idx').on(table.contentKey, table.mediaType),
    sourceIdx: index('media_watch_sources_source_idx').on(table.watchSourceId),
    staleIdx: index('media_watch_sources_stale_idx').on(table.lastCheckedAt),
  }),
);

/**
 * Discovered-but-not-trusted sources.
 *
 * A submission lands here, gets its domain normalised and deduplicated, and
 * only becomes a real watch_sources row after a human approves it. Nothing
 * promotes itself.
 */
export const watchSourceCandidates = pgTable(
  'watch_source_candidates',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('wsc')),
    domain: text('domain').notNull(),
    suggestedName: text('suggested_name').notNull(),
    homepageUrl: text('homepage_url').notNull(),

    origin: watchSourceOriginEnum('origin').notNull().default('COMMUNITY'),
    originUrl: text('origin_url'),
    submittedByUserId: text('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    guildId: text('guild_id').references(() => discordGuilds.id, { onDelete: 'set null' }),
    supportsAnime: boolean('supports_anime').notNull().default(false),
    supportsMovies: boolean('supports_movies').notNull().default(false),
    supportsTv: boolean('supports_tv').notNull().default(false),
    comment: text('comment'),
    contentKey: text('content_key'),
    mediaType: mediaTypeEnum('media_type'),
    mediaTitle: text('media_title'),
    availabilityUrl: text('availability_url'),

    status: watchCandidateStatusEnum('status').notNull().default('PENDING'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    // Set when approval creates a registry row, so the trail survives.
    promotedSourceId: text('promoted_source_id').references(() => watchSources.id, {
      onDelete: 'set null',
    }),

    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainKey: uniqueIndex('watch_candidates_domain_key').on(table.domain),
    statusIdx: index('watch_candidates_status_idx').on(table.status, table.discoveredAt),
  }),
);

/**
 * Server-scoped source sharing.
 *
 * These rows are social recommendations, not registry entries. A member can
 * share an external site with one Discord community without publishing it to
 * Couchlist globally. If the domain is already in the global registry the
 * optional watchSourceId links the two identities.
 */
export const serverWatchPosts = pgTable(
  'server_watch_posts',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('swp')),
    guildId: text('guild_id')
      .notNull()
      .references(() => discordGuilds.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    watchSourceId: text('watch_source_id').references(() => watchSources.id, {
      onDelete: 'set null',
    }),

    domain: text('domain').notNull(),
    homepageUrl: text('homepage_url').notNull(),
    suggestedName: text('suggested_name').notNull(),
    comment: text('comment'),

    contentKey: text('content_key'),
    mediaType: mediaTypeEnum('media_type'),
    mediaTitle: text('media_title'),

    supportsAnime: boolean('supports_anime').notNull().default(false),
    supportsMovies: boolean('supports_movies').notNull().default(false),
    supportsTv: boolean('supports_tv').notNull().default(false),

    isHidden: boolean('is_hidden').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    guildIdx: index('server_watch_posts_guild_idx').on(table.guildId, table.createdAt),
    sourceIdx: index('server_watch_posts_source_idx').on(table.watchSourceId),
    domainIdx: index('server_watch_posts_domain_idx').on(table.guildId, table.domain),
  }),
);

/** One 1-5 star rating per user, either global or scoped to one server. */
export const watchSourceRatings = pgTable(
  'watch_source_ratings',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('wrt')),
    watchSourceId: text('watch_source_id').references(() => watchSources.id, {
      onDelete: 'cascade',
    }),
    serverWatchPostId: text('server_watch_post_id').references(() => serverWatchPosts.id, {
      onDelete: 'cascade',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guildId: text('guild_id').references(() => discordGuilds.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ratingCheck: check('watch_source_ratings_value_check', sql`${table.rating} between 1 and 5`),
    targetCheck: check(
      'watch_source_ratings_target_check',
      sql`((${table.watchSourceId} is not null)::int + (${table.serverWatchPostId} is not null)::int) = 1`,
    ),
    globalSourceKey: uniqueIndex('watch_source_ratings_global_source_key')
      .on(table.watchSourceId, table.userId)
      .where(sql`${table.watchSourceId} is not null and ${table.guildId} is null`),
    guildSourceKey: uniqueIndex('watch_source_ratings_guild_source_key')
      .on(table.watchSourceId, table.userId, table.guildId)
      .where(sql`${table.watchSourceId} is not null and ${table.guildId} is not null`),
    postKey: uniqueIndex('watch_source_ratings_post_key')
      .on(table.serverWatchPostId, table.userId)
      .where(sql`${table.serverWatchPostId} is not null`),
    sourceIdx: index('watch_source_ratings_source_idx').on(table.watchSourceId, table.guildId),
    postIdx: index('watch_source_ratings_post_idx').on(table.serverWatchPostId),
  }),
);

/** Fresh, replaceable "works / not working" votes used for reliability. */
export const watchSourceHealthVotes = pgTable(
  'watch_source_health_votes',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('whv')),
    watchSourceId: text('watch_source_id').references(() => watchSources.id, {
      onDelete: 'cascade',
    }),
    serverWatchPostId: text('server_watch_post_id').references(() => serverWatchPosts.id, {
      onDelete: 'cascade',
    }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    guildId: text('guild_id').references(() => discordGuilds.id, { onDelete: 'cascade' }),
    status: watchHealthVoteEnum('status').notNull(),
    reason: watchReportReasonEnum('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    targetCheck: check(
      'watch_source_health_votes_target_check',
      sql`((${table.watchSourceId} is not null)::int + (${table.serverWatchPostId} is not null)::int) = 1`,
    ),
    globalSourceKey: uniqueIndex('watch_source_health_global_source_key')
      .on(table.watchSourceId, table.userId)
      .where(sql`${table.watchSourceId} is not null and ${table.guildId} is null`),
    guildSourceKey: uniqueIndex('watch_source_health_guild_source_key')
      .on(table.watchSourceId, table.userId, table.guildId)
      .where(sql`${table.watchSourceId} is not null and ${table.guildId} is not null`),
    postKey: uniqueIndex('watch_source_health_post_key')
      .on(table.serverWatchPostId, table.userId)
      .where(sql`${table.serverWatchPostId} is not null`),
    sourceIdx: index('watch_source_health_source_idx').on(table.watchSourceId, table.updatedAt),
    postIdx: index('watch_source_health_post_idx').on(table.serverWatchPostId, table.updatedAt),
  }),
);

/**
 * User reports about a listing, global source, or server recommendation.
 * Reports accumulate for moderation; one report never removes anything on its own.
 */
export const watchSourceReports = pgTable(
  'watch_source_reports',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('wrp')),
    mediaWatchSourceId: text('media_watch_source_id').references(() => mediaWatchSources.id, {
      onDelete: 'cascade',
    }),
    watchSourceId: text('watch_source_id').references(() => watchSources.id, {
      onDelete: 'cascade',
    }),
    serverWatchPostId: text('server_watch_post_id').references(() => serverWatchPosts.id, {
      onDelete: 'cascade',
    }),
    reportedByUserId: text('reported_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    reason: watchReportReasonEnum('reason').notNull(),
    details: text('details'),

    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: text('resolved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    targetCheck: check(
      'watch_reports_target_check',
      sql`((${table.mediaWatchSourceId} is not null)::int + (${table.watchSourceId} is not null)::int + (${table.serverWatchPostId} is not null)::int) = 1`,
    ),
    listingIdx: index('watch_reports_listing_idx').on(table.mediaWatchSourceId, table.createdAt),
    sourceIdx: index('watch_reports_source_idx').on(table.watchSourceId, table.createdAt),
    postIdx: index('watch_reports_post_idx').on(table.serverWatchPostId, table.createdAt),
    openIdx: index('watch_reports_open_idx').on(table.resolvedAt),
    listingReporterKey: uniqueIndex('watch_reports_listing_reporter_key')
      .on(table.mediaWatchSourceId, table.reportedByUserId)
      .where(sql`${table.resolvedAt} is null and ${table.mediaWatchSourceId} is not null and ${table.reportedByUserId} is not null`),
    sourceReporterKey: uniqueIndex('watch_reports_source_reporter_key')
      .on(table.watchSourceId, table.reportedByUserId)
      .where(sql`${table.resolvedAt} is null and ${table.watchSourceId} is not null and ${table.reportedByUserId} is not null`),
    postReporterKey: uniqueIndex('watch_reports_post_reporter_key')
      .on(table.serverWatchPostId, table.reportedByUserId)
      .where(sql`${table.resolvedAt} is null and ${table.serverWatchPostId} is not null and ${table.reportedByUserId} is not null`),
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
export type WatchSourceRow = typeof watchSources.$inferSelect;
export type NewWatchSource = typeof watchSources.$inferInsert;
export type MediaWatchSourceRow = typeof mediaWatchSources.$inferSelect;
export type NewMediaWatchSource = typeof mediaWatchSources.$inferInsert;
export type WatchSourceCandidateRow = typeof watchSourceCandidates.$inferSelect;
export type ServerWatchPostRow = typeof serverWatchPosts.$inferSelect;
export type WatchSourceRatingRow = typeof watchSourceRatings.$inferSelect;
export type WatchSourceHealthVoteRow = typeof watchSourceHealthVotes.$inferSelect;
export type WatchSourceReportRow = typeof watchSourceReports.$inferSelect;
