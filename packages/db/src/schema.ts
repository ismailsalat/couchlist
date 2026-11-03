import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  date,
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
  // The directory's three reasons are BROKEN_LINK, LOTS_OF_ADS and OTHER. The
  // rest predate the rebuild and are kept so historical reports still read.
  'LOTS_OF_ADS',
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

// Directory enums.
/** PostgreSQL bytea, which Drizzle has no first-class column type for. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const sourceVoteValueEnum = pgEnum('source_vote_value', ['LIKE', 'DISLIKE']);
/** A contributor's public display choice. Anonymous hides identity, not the record. */
export const creditModeEnum = pgEnum('credit_mode', ['CREDITED', 'ANONYMOUS']);
export const contributionKindEnum = pgEnum('contribution_kind', [
  'NEW_SOURCE',
  'CORRECTION',
  'GUIDE',
  'GUIDE_CORRECTION',
]);
export const guideTopicEnum = pgEnum('guide_topic', [
  'BLOCKING',
  'WATCHING',
  'READING',
  'TRANSLATION',
  'SUBTITLES',
  'CASTING',
  'FIXES',
]);
export const guideSuggestionKindEnum = pgEnum('guide_suggestion_kind', [
  'NEW_GUIDE',
  'CORRECTION',
  'BROKEN_LINK',
]);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('usr')),

    // Email accounts are the supported way in. Discord columns remain so that
    // accounts created before the directory rebuild keep working and keep
    // their contribution credit; they are never merged by name or email.
    email: text('email'),
    passwordHash: text('password_hash'),
    displayName: text('display_name'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),

    // Server-checked administrator role. Replaces the Discord owner-id list:
    // authorization is a property of the account, not of an env var.
    isAdmin: boolean('is_admin').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),

    discordId: text('discord_id'),
    username: text('username').notNull(),
    globalName: text('global_name'),
    avatarUrl: text('avatar_url'),
    // Set when the account has an uploaded picture. The type lives on the row
    // so "has a picture" costs neither a join nor the bytes.
    avatarMime: text('avatar_mime'),

    // Privacy defaults to the more private of the two options.
    profileVisibility: profileVisibilityEnum('profile_visibility')
      .notNull()
      .default('MUTUAL_SERVERS'),
    showRatings: boolean('show_ratings').notNull().default(true),
    showProgress: boolean('show_progress').notNull().default(true),

    /** A line people may write about themselves. Capped in the database. */
    bio: text('bio'),
    /** Answered or dismissed; either way the survey never asks again. */
    surveyClosedAt: timestamp('survey_closed_at', { withTimezone: true }),

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
    // Lowercased, so two spellings of one address cannot both register.
    // Partial, so legacy Discord-only rows do not collide on a null email.
    emailKey: uniqueIndex('users_email_key')
      .on(sql`lower(${table.email})`)
      .where(sql`${table.email} is not null`),
    adminIdx: index('users_admin_idx').on(table.isAdmin).where(sql`${table.isAdmin}`),
    lastSeenIdx: index('users_last_seen_idx').on(table.lastSeenAt),
    /*
     * A live account must be reachable. A deleted one is a tombstone that
     * exists only to anchor contribution credit, so it is allowed to carry no
     * identifier at all — clearing both is the point of the deletion.
     */
    identityCheck: check(
      'users_identity_check',
      sql`${table.deletedAt} is not null or ${table.discordId} is not null or ${table.email} is not null`,
    ),
  }),
);

export const authTokenPurposeEnum = pgEnum('auth_token_purpose', [
  'EMAIL_VERIFICATION',
  'PASSWORD_RESET',
]);

/**
 * Email verification codes and password-reset tokens.
 *
 * One table so that expiry, single use and attempt limiting have exactly one
 * implementation. Only a hash is stored, so a database dump cannot be replayed
 * to verify an address or take over an account.
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('atk')),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: authTokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    // A code issued for one address must not verify a different one after an
    // email change, so the target address is pinned at issue time.
    sentToEmail: text('sent_to_email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashKey: uniqueIndex('auth_tokens_hash_key').on(table.purpose, table.tokenHash),
    userIdx: index('auth_tokens_user_idx').on(table.userId, table.purpose, table.createdAt),
    expiryIdx: index('auth_tokens_expiry_idx').on(table.expiresAt),
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

    // A short, useful line about what the source offers. Untrusted text: it is
    // rendered as text, never as markup.
    description: text('description'),
    iconUrl: text('icon_url'),
    /**
     * Set when a site icon exists, so a listing knows to render one without
     * joining the table that holds the image bytes.
     */
    iconMime: text('icon_mime'),

    /*
     * The two moderator-set warnings, in increasing severity. Both are
     * decided by a person; neither is computed from vote counts.
     *
     *  - `hasLotsOfAds` is a caution. The site works; it is unpleasant.
     *  - `shouldAvoid` says plainly not to go there. The listing stays, so
     *    people who hear the name elsewhere find the warning rather than
     *    silence, and `avoidReason` says why in one line.
     */
    hasLotsOfAds: boolean('has_lots_of_ads').notNull().default(false),
    shouldAvoid: boolean('should_avoid').notNull().default(false),
    avoidReason: text('avoid_reason'),

    /*
     * A moderator's pick. Null is the normal state and the usual ranking
     * applies; a number pins the source above everything unpicked, lowest
     * first, so the order of the picks is chosen rather than accidental.
     */
    /*
     * A short moderator-set quality note: 4K, HD, HQ scans. Free text within
     * twelve characters, because one list holds video and reading sources and
     * no fixed set of values says anything useful about both.
     */
    qualityLabel: text('quality_label'),

    trustedRank: integer('trusted_rank'),
    trustedNote: text('trusted_note'),
    trustedAt: timestamp('trusted_at', { withTimezone: true }),

    supportsAnime: boolean('supports_anime').notNull().default(false),
    supportsMovies: boolean('supports_movies').notNull().default(false),
    supportsTv: boolean('supports_tv').notNull().default(false),
    supportsManga: boolean('supports_manga').notNull().default(false),
    supportsManhwa: boolean('supports_manhwa').notNull().default(false),
    supportsComics: boolean('supports_comics').notNull().default(false),

    // Hiding is reversible, so both the moment and the reason are kept.
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenReason: text('hidden_reason'),
    // Set only when a human actually checked this source's link.
    linksReviewedAt: timestamp('links_reviewed_at', { withTimezone: true }),

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

    /*
     * The result of that last look.
     *
     * `healthFailures` counts consecutive failures, not total: one timeout is
     * weather, three in a row is a dead site, and a success resets it so a
     * flaky host cannot accumulate its way to being flagged over a year.
     */
    healthStatus: text('health_status'),
    healthStatusCode: integer('health_status_code'),
    healthFailures: integer('health_failures').notNull().default(0),
    healthDetail: text('health_detail'),

    /*
     * A moderator's answer to an external reputation flag.
     *
     * `reputationReviewedSources` records which providers were flagging the
     * domain at the time, so the review covers that evidence and not future
     * evidence. A new provider flagging it later is something nobody has
     * looked at yet, and the warning returns.
     */
    reputationReviewedAt: timestamp('reputation_reviewed_at', { withTimezone: true }),
    reputationReviewedByUserId: text('reputation_reviewed_by_user_id'),
    reputationReviewNote: text('reputation_review_note'),
    reputationReviewedSources: jsonb('reputation_reviewed_sources').$type<string[]>(),

    /** Set when a preview picture exists, so the row knows without the bytes. */
    previewMime: text('preview_mime'),

    /**
     * Deleting, reversibly.
     *
     * Set rather than destroyed, so a bulk delete that took forty listings
     * and their votes with it can be undone. A purge removes rows whose
     * window has passed.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedByUserId: text('deleted_by_user_id'),
    deletedReason: text('deleted_reason'),

    /**
     * How many times somebody pressed Visit. A total and nothing else: no
     * account, no address, no session, no timestamp finer than the day the
     * total last moved. It can say which sites people open and cannot say
     * who opened them.
     */
    visitCount: bigint('visit_count', { mode: 'number' }).notNull().default(0),
    visitCountedOn: date('visit_counted_on'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainKey: uniqueIndex('watch_sources_domain_key').on(table.domain),
    enabledIdx: index('watch_sources_enabled_idx').on(table.isEnabled, table.sourceType),
    categoryIdx: index('watch_sources_category_idx').on(
      table.isEnabled,
      table.supportsAnime,
      table.supportsMovies,
      table.supportsTv,
      table.supportsManga,
      table.supportsManhwa,
      table.supportsComics,
    ),
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
    supportsManga: boolean('supports_manga').notNull().default(false),
    supportsManhwa: boolean('supports_manhwa').notNull().default(false),
    supportsComics: boolean('supports_comics').notNull().default(false),
    description: text('description'),
    comment: text('comment'),

    // What this submission is: a new listing or a correction to one.
    kind: contributionKindEnum('kind').notNull().default('NEW_SOURCE'),
    // The contributor's public display choice, chosen at submission time.
    creditMode: creditModeEnum('credit_mode').notNull().default('CREDITED'),
    // Set for a correction: the source being corrected.
    targetSourceId: text('target_source_id').references(() => watchSources.id, {
      onDelete: 'cascade',
    }),

    // A correction proposes replacements. Null means "leave this field alone".
    proposedName: text('proposed_name'),
    proposedUrl: text('proposed_url'),
    proposedDescription: text('proposed_description'),
    proposedCategories: jsonb('proposed_categories'),
    proposedHasLotsOfAds: boolean('proposed_has_lots_of_ads'),
    proposedShouldAvoid: boolean('proposed_should_avoid'),
    /** Set when the contributor attached a site icon to this suggestion. */
    iconMime: text('icon_mime'),
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
    // One *pending* new-source suggestion per domain. The previous
    // all-time-unique index meant a rejected domain could never be suggested
    // again and a correction could not reference an already-listed domain.
    pendingDomainKey: uniqueIndex('watch_candidates_pending_domain_key')
      .on(table.domain)
      .where(sql`${table.status} = 'PENDING' and ${table.kind} = 'NEW_SOURCE'`),
    statusIdx: index('watch_candidates_status_idx').on(table.status, table.discoveredAt),
    kindIdx: index('watch_candidates_kind_idx').on(table.kind, table.status, table.createdAt),
    submitterIdx: index('watch_candidates_submitter_idx').on(
      table.submittedByUserId,
      table.createdAt,
    ),
    targetIdx: index('watch_candidates_target_idx').on(table.targetSourceId, table.status),
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
    resolutionNote: text('resolution_note'),

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

/**
 * Like / dislike feedback on a source.
 *
 * One row per verified account per source. The uniqueness guarantee is the
 * database index, not application code, so two concurrent requests cannot
 * both insert a vote.
 */
export const sourceVotes = pgTable(
  'source_votes',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('svt')),
    sourceId: text('source_id')
      .notNull()
      .references(() => watchSources.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    value: sourceVoteValueEnum('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userSourceKey: uniqueIndex('source_votes_user_source_key').on(table.sourceId, table.userId),
    sourceIdx: index('source_votes_source_idx').on(table.sourceId, table.value),
  }),
);

/**
 * A saved source website.
 *
 * Saving a source is not the old show watchlist: the row points at a site, and
 * the note on it is private to its owner.
 */
export const sourceBookmarks = pgTable(
  'source_bookmarks',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('bmk')),
    sourceId: text('source_id')
      .notNull()
      .references(() => watchSources.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Owner-only. Never included in a public response shape. */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userSourceKey: uniqueIndex('source_bookmarks_user_source_key').on(
      table.sourceId,
      table.userId,
    ),
    userIdx: index('source_bookmarks_user_idx').on(table.userId, table.createdAt),
  }),
);

/**
 * Credit for an approved contribution.
 *
 * `userId` is kept for moderation even when `creditMode` is ANONYMOUS. The
 * public boundary is enforced where responses are built: an anonymous row must
 * never expose the account, nor an id that can be joined back to one.
 */
export const sourceContributions = pgTable(
  'source_contributions',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('con')),
    sourceId: text('source_id').references(() => watchSources.id, { onDelete: 'cascade' }),
    guideId: text('guide_id').references((): typeof guides.id => guides.id, {
      onDelete: 'cascade',
    }),
    // Set null on account deletion: the credit survives, the identity does not.
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: contributionKindEnum('kind').notNull(),
    creditMode: creditModeEnum('credit_mode').notNull().default('CREDITED'),
    /**
     * True for the first approved suggestion of a source: the original
     * contributor. Later approved corrections get their own rows and never
     * replace this one.
     */
    isOriginal: boolean('is_original').notNull().default(false),
    summary: text('summary'),
    candidateId: text('candidate_id').references(() => watchSourceCandidates.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceIdx: index('source_contributions_source_idx').on(table.sourceId, table.createdAt),
    userIdx: index('source_contributions_user_idx').on(table.userId, table.createdAt),
    guideIdx: index('source_contributions_guide_idx').on(table.guideId, table.createdAt),
    originalKey: uniqueIndex('source_contributions_original_key')
      .on(table.sourceId)
      .where(sql`${table.isOriginal}`),
    targetCheck: check(
      'source_contributions_target_check',
      sql`(${table.sourceId} is not null)::int + (${table.guideId} is not null)::int = 1`,
    ),
  }),
);

/** History of meaningful approved updates to a source. */
export const sourceRevisions = pgTable(
  'source_revisions',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('rev')),
    sourceId: text('source_id')
      .notNull()
      .references(() => watchSources.id, { onDelete: 'cascade' }),
    contributionId: text('contribution_id').references(() => sourceContributions.id, {
      onDelete: 'set null',
    }),
    summary: text('summary').notNull(),
    changedFields: jsonb('changed_fields'),
    appliedByUserId: text('applied_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceIdx: index('source_revisions_source_idx').on(table.sourceId, table.createdAt),
  }),
);

/**
 * A guide or tool entry.
 *
 * Compatibility, pricing and links are the facts that go stale fastest, so they
 * are editable columns rather than hard-coded content. `lastReviewedAt` is null
 * until a human actually checked: the UI shows a reviewed date only when it is
 * set, so Couchlist never invents one.
 */
export const guides = pgTable(
  'guides',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('gde')),
    slug: text('slug').notNull(),
    /** The task, in the reader's words: "Block ads in Firefox". */
    title: text('title').notNull(),
    /** The tool and scope: "uBlock Origin - Desktop and Android". */
    task: text('task').notNull(),
    topic: guideTopicEnum('topic').notNull(),
    summary: text('summary').notNull(),
    /** Ordered plain steps. A guide is instructions, not an article. */
    steps: jsonb('steps').notNull().default(sql`'[]'::jsonb`),
    /** [{ label, url }] - official project or store pages only. */
    links: jsonb('links').notNull().default(sql`'[]'::jsonb`),
    /** Honest limitations: what the tool does not do. */
    note: text('note'),
    costNote: text('cost_note'),
    browserNotes: text('browser_notes'),

    deviceComputer: boolean('device_computer').notNull().default(false),
    deviceIphone: boolean('device_iphone').notNull().default(false),
    deviceAndroid: boolean('device_android').notNull().default(false),
    deviceTv: boolean('device_tv').notNull().default(false),
    deviceLabel: text('device_label').notNull().default(''),

    /** Extra search terms, including common misspellings. */
    keywords: text('keywords').notNull().default(''),
    isStarter: boolean('is_starter').notNull().default(false),
    isPublished: boolean('is_published').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(100),

    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    lastReviewedByUserId: text('last_reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugKey: uniqueIndex('guides_slug_key').on(table.slug),
    topicIdx: index('guides_topic_idx').on(table.topic, table.isPublished, table.sortOrder),
    starterIdx: index('guides_starter_idx').on(table.isStarter, table.isPublished),
  }),
);

/** Community guide submissions, corrections and broken-link reports. */
export const guideSuggestions = pgTable(
  'guide_suggestions',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('gsg')),
    kind: guideSuggestionKindEnum('kind').notNull(),
    targetGuideId: text('target_guide_id').references(() => guides.id, { onDelete: 'cascade' }),
    submittedByUserId: text('submitted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    creditMode: creditModeEnum('credit_mode').notNull().default('CREDITED'),

    title: text('title'),
    topic: guideTopicEnum('topic'),
    body: text('body').notNull(),
    links: jsonb('links').notNull().default(sql`'[]'::jsonb`),

    status: watchCandidateStatusEnum('status').notNull().default('PENDING'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewNotes: text('review_notes'),
    promotedGuideId: text('promoted_guide_id').references(() => guides.id, {
      onDelete: 'set null',
    }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('guide_suggestions_status_idx').on(table.status, table.createdAt),
    submitterIdx: index('guide_suggestions_submitter_idx').on(
      table.submittedByUserId,
      table.createdAt,
    ),
    targetIdx: index('guide_suggestions_target_idx').on(table.targetGuideId, table.status),
    targetCheck: check(
      'guide_suggestions_target_check',
      sql`${table.kind} = 'NEW_GUIDE' or ${table.targetGuideId} is not null`,
    ),
  }),
);

/** A named list of sources. Private unless its owner publishes it. */
export const sourceCollections = pgTable(
  'source_collections',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('col')),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Per owner, so two people can both have "weekend-movies".
    ownerSlugKey: uniqueIndex('source_collections_owner_slug_key').on(
      table.ownerUserId,
      table.slug,
    ),
    publicIdx: index('source_collections_public_idx').on(table.isPublic, table.updatedAt),
  }),
);

export const sourceCollectionItems = pgTable(
  'source_collection_items',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('cli')),
    collectionId: text('collection_id')
      .notNull()
      .references(() => sourceCollections.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => watchSources.id, { onDelete: 'cascade' }),
    note: text('note'),
    position: integer('position').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    itemKey: uniqueIndex('source_collection_items_key').on(table.collectionId, table.sourceId),
    orderIdx: index('source_collection_items_order_idx').on(table.collectionId, table.position),
  }),
);

/**
 * A site icon.
 *
 * Kept in its own table so that listing the directory never pulls image bytes
 * along, and in the database rather than an object store so the feature needs
 * no storage credential to work.
 *
 * The bytes are validated against the file's magic numbers before they get
 * here, and served back with the stored type plus nosniff. SVG is never
 * accepted, because it can carry script.
 */
export const sourceIcons = pgTable(
  'source_icons',
  {
    id: text('id').primaryKey().$defaultFn(() => createId('ico')),
    sourceId: text('source_id').references(() => watchSources.id, { onDelete: 'cascade' }),
    // An account's profile picture. Exactly one of the three target columns
    // is set; a check constraint enforces it.
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    candidateId: text('candidate_id').references(() => watchSourceCandidates.id, {
      onDelete: 'cascade',
    }),
    /**
     * What this image is for: the small site icon, or the larger preview of
     * what the site looks like. One of each per listing.
     */
    kind: text('kind').notNull().default('ICON'),
    /** Where a preview came from, so the listing can say so. */
    sourceNote: text('source_note'),
    /**
     * False only for a screenshot a bot took, which waits for a moderator.
     * Anything a person uploaded or fetched deliberately is approved as it
     * arrives.
     */
    approved: boolean('approved').notNull().default(true),
    /** The address a screenshot was taken from. */
    capturedFrom: text('captured_from'),
    mime: text('mime').notNull(),
    bytes: bytea('bytes').notNull(),
    byteSize: integer('byte_size').notNull(),
    uploadedByUserId: text('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sourceKindKey: uniqueIndex('source_icons_source_kind_key')
      .on(table.sourceId, table.kind)
      .where(sql`${table.sourceId} is not null`),
    candidateKey: uniqueIndex('source_icons_candidate_key')
      .on(table.candidateId)
      .where(sql`${table.candidateId} is not null`),
    targetCheck: check(
      'source_icons_target_check',
      sql`(${table.sourceId} is not null)::int + (${table.candidateId} is not null)::int = 1`,
    ),
    mimeCheck: check(
      'source_icons_mime_check',
      sql`${table.mime} in ('image/png', 'image/jpeg', 'image/webp')`,
    ),
    sizeCheck: check(
      'source_icons_size_check',
      sql`${table.byteSize} > 0 and ${table.byteSize} <= 262144`,
    ),
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
export type AuthTokenRow = typeof authTokens.$inferSelect;
export type NewAuthToken = typeof authTokens.$inferInsert;
export type SourceVoteRow = typeof sourceVotes.$inferSelect;
export type SourceBookmarkRow = typeof sourceBookmarks.$inferSelect;
export type SourceContributionRow = typeof sourceContributions.$inferSelect;
export type NewSourceContribution = typeof sourceContributions.$inferInsert;
export type SourceRevisionRow = typeof sourceRevisions.$inferSelect;
export type GuideRow = typeof guides.$inferSelect;
export type NewGuide = typeof guides.$inferInsert;
export type GuideSuggestionRow = typeof guideSuggestions.$inferSelect;
export type SourceCollectionRow = typeof sourceCollections.$inferSelect;
export type SourceCollectionItemRow = typeof sourceCollectionItems.$inferSelect;
export type SourceIconRow = typeof sourceIcons.$inferSelect;

/**
 * The addresses a listing answers on.
 *
 * Sites in this directory change domain often, and the old shape made a
 * listing and an address the same thing: when the address died, the votes,
 * the credit and the description died with it and somebody re-added the same
 * site as a stranger. A listing is a site; a row here is one of the places
 * that site currently lives.
 */
export const watchSourceDomains = pgTable(
  'watch_source_domains',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('wsd')),
    watchSourceId: text('watch_source_id')
      .notNull()
      .references(() => watchSources.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(),
    homepageUrl: text('homepage_url').notNull(),
    /** The address shown on the listing and checked by the weekly job. */
    isPrimary: boolean('is_primary').notNull().default(false),
    /**
     * False for a mirror the link checker proposed from a redirect and no
     * person has accepted yet. Proposed mirrors are never shown publicly:
     * the site being checked chooses where the redirect points, so accepting
     * one automatically would let it add its own addresses to our directory.
     */
    isConfirmed: boolean('is_confirmed').notNull().default(true),
    note: text('note'),
    addedByUserId: text('added_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    domainKey: uniqueIndex('watch_source_domains_domain_key').on(table.domain),
    sourceIdx: index('watch_source_domains_source_idx').on(table.watchSourceId),
  }),
);

/**
 * Survey answers.
 *
 * One row per person, replaced if they answer again, so this cannot be read
 * as a record of somebody changing their mind over time. It holds a number
 * between one and five and an optional yes or no, and nothing else.
 */
export const surveyResponses = pgTable(
  'survey_responses',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('svr')),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ease: integer('ease').notNull(),
    usesAdBlocker: boolean('uses_ad_blocker'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userKey: uniqueIndex('survey_responses_user_key').on(table.userId),
    easeCheck: check('survey_responses_ease_check', sql`${table.ease} between 1 and 5`),
  }),
);

/**
 * A local copy of public domain blocklists.
 *
 * Synced from the lists' GitHub mirrors, which need no API key and no
 * account. This is what makes the safety tool answer at all when the keyed
 * providers are unconfigured, rate-limited or down: a local table is never
 * slow and never refuses.
 *
 * Keyed by (domain, list) rather than domain alone, because knowing that two
 * independent lists both name a domain is stronger evidence than one, and the
 * answer shows each by name instead of blending them into a score.
 */
export const blockedDomains = pgTable(
  'blocked_domains',
  {
    domain: text('domain').notNull(),
    list: text('list').notNull(),
    category: text('category').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: uniqueIndex('blocked_domains_pk').on(table.domain, table.list),
    domainIdx: index('blocked_domains_domain_idx').on(table.domain),
    categoryCheck: check(
      'blocked_domains_category_check',
      sql`${table.category} in ('PHISHING', 'MALWARE', 'ADS')`,
    ),
  }),
);

/**
 * Cached answers from the providers that need a key.
 *
 * `expiresAt` comes from the provider, not from us. Safe Browsing's terms
 * allow a warning to be shown only while its own cache duration is still
 * valid, so the expiry has to be stored rather than assumed.
 */
export const domainReputation = pgTable(
  'domain_reputation',
  {
    domain: text('domain').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull(),
    detail: text('detail'),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    pk: uniqueIndex('domain_reputation_pk').on(table.domain, table.provider),
    expiryIdx: index('domain_reputation_expiry_idx').on(table.expiresAt),
    statusCheck: check(
      'domain_reputation_status_check',
      sql`${table.status} in ('clean', 'flagged', 'unknown', 'unavailable')`,
    ),
  }),
);

/** One row per list per sync run, so freshness can be stated rather than implied. */
export const blocklistSyncs = pgTable(
  'blocklist_syncs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => createId('bls')),
    list: text('list').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    entryCount: integer('entry_count').notNull().default(0),
    ok: boolean('ok').notNull().default(false),
    detail: text('detail'),
  },
  (table) => ({
    listIdx: index('blocklist_syncs_list_idx').on(table.list, table.startedAt),
  }),
);
