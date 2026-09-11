import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '@couchlist/db';
import { MediaType, mediaContentKey, WatchSourceType } from '@couchlist/shared';
import { nextDiscordId, repositories, resetTables, setupTestDatabase } from '../helpers/db';

let db: Database;
let repos: ReturnType<typeof repositories>;

beforeAll(async () => {
  db = await setupTestDatabase();
  repos = repositories(db);
});

beforeEach(async () => {
  await resetTables(db);
});

async function makeUser(name = 'watcher') {
  return repos.users.upsertFromDiscord({ discordId: nextDiscordId(), username: name });
}

async function makeGuild(name = 'Watch Server') {
  const discordId = nextDiscordId();
  const guild = await repos.guilds.upsert({ discordId, name });
  await repos.guilds.setBotConnected(discordId, true);
  await repos.guilds.ensureSettings(guild.id);
  return { ...guild, discordId };
}

async function makeSource(overrides: Partial<Parameters<typeof repos.watchSources.registerSource>[0]> = {}) {
  return repos.watchSources.registerSource({
    name: 'Example Service',
    homepageUrl: 'https://example.com',
    sourceType: WatchSourceType.OFFICIAL,
    supportsAnime: true,
    supportsMovies: true,
    supportsTv: true,
    isVerified: true,
    isEnabled: true,
    ...overrides,
  });
}

/** One Piece as each Anime provider reports it. All three mean mal:21. */
const ONE_PIECE_CANONICAL = 'mal:21';
const ONE_PIECE_ANILIST = {
  provider: 'ANILIST',
  providerMediaId: '21',
  mediaType: 'ANIME',
} as const;
const ONE_PIECE_JIKAN = { provider: 'JIKAN', providerMediaId: '21', mediaType: 'ANIME' } as const;
const ONE_PIECE_KITSU = { provider: 'KITSU', providerMediaId: '12', mediaType: 'ANIME' } as const;

describe('watch source registry', () => {
  it('stores a normalised domain', async () => {
    const source = await makeSource({ homepageUrl: 'https://WWW.Example.com/browse/' });
    expect(source.domain).toBe('example.com');
  });

  it('does not create a second row for the same site', async () => {
    const first = await makeSource({ homepageUrl: 'https://example.com' });
    const second = await makeSource({ homepageUrl: 'https://www.example.com/' });
    expect(second.id).toBe(first.id);
  });

  it('refuses a source whose homepage is not a usable http(s) URL', async () => {
    await expect(makeSource({ homepageUrl: 'javascript:alert(1)' })).rejects.toThrow();
    await expect(makeSource({ homepageUrl: 'http://127.0.0.1/admin' })).rejects.toThrow();
  });
});

describe('media to source mapping', () => {
  it('links a title to a source and reads it back', async () => {
    const source = await makeSource();
    const contentKey = mediaContentKey({ ...ONE_PIECE_ANILIST, canonicalMediaKey: null });

    await repos.watchSources.upsertAvailability({
      watchSourceId: source.id,
      contentKey,
      mediaType: 'ANIME',
      availabilityUrl: 'https://example.com/one-piece',
      availabilityStatus: 'AVAILABLE',
    });

    const listings = await repos.watchSources.listingsForContent(contentKey);
    expect(listings).toHaveLength(1);
    expect(listings[0]?.source.name).toBe('Example Service');
  });

  it('hides a disabled source from the Watch section', async () => {
    const source = await makeSource();
    const contentKey = mediaContentKey({ ...ONE_PIECE_ANILIST, canonicalMediaKey: null });

    await repos.watchSources.upsertAvailability({
      watchSourceId: source.id,
      contentKey,
      mediaType: 'ANIME',
      availabilityUrl: 'https://example.com/one-piece',
    });
    expect(await repos.watchSources.listingsForContent(contentKey)).toHaveLength(1);

    await repos.watchSources.setSourceEnabled(source.id, false);
    expect(await repos.watchSources.listingsForContent(contentKey)).toHaveLength(0);
  });

  it('refuses an availability URL with a dangerous protocol', async () => {
    const source = await makeSource();
    await expect(
      repos.watchSources.upsertAvailability({
        watchSourceId: source.id,
        contentKey: 'CANONICAL:mal:21',
        mediaType: 'ANIME',
        availabilityUrl: 'javascript:alert(document.cookie)',
      }),
    ).rejects.toThrow();
  });
});

describe('canonical anime identity', () => {
  it('maps AniList, Jikan and Kitsu One Piece to one content key', () => {
    const keys = new Set(
      [ONE_PIECE_ANILIST, ONE_PIECE_JIKAN, ONE_PIECE_KITSU].map((identity) =>
        mediaContentKey({ ...identity, canonicalMediaKey: ONE_PIECE_CANONICAL }),
      ),
    );
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe(`CANONICAL:${ONE_PIECE_CANONICAL}`);
  });

  it('does not duplicate Watch entries when the same anime arrives from three providers', async () => {
    const source = await makeSource();

    for (const identity of [ONE_PIECE_ANILIST, ONE_PIECE_JIKAN, ONE_PIECE_KITSU]) {
      await repos.watchSources.upsertAvailability({
        watchSourceId: source.id,
        contentKey: mediaContentKey({ ...identity, canonicalMediaKey: ONE_PIECE_CANONICAL }),
        mediaType: 'ANIME',
        provider: identity.provider,
        providerMediaId: identity.providerMediaId,
        canonicalMediaKey: ONE_PIECE_CANONICAL,
        availabilityUrl: 'https://example.com/one-piece',
        availabilityStatus: 'AVAILABLE',
      });
    }

    const listings = await repos.watchSources.listingsForContent(
      `CANONICAL:${ONE_PIECE_CANONICAL}`,
    );
    expect(listings).toHaveLength(1);
  });

  it('keeps Movie and TV availability separate even when TMDB reuses an id', async () => {
    const source = await makeSource();
    const movie = mediaContentKey({
      provider: 'TMDB',
      providerMediaId: '550',
      mediaType: MediaType.MOVIE,
    });
    const tv = mediaContentKey({
      provider: 'TMDB',
      providerMediaId: '550',
      mediaType: MediaType.TV,
    });

    await repos.watchSources.upsertAvailability({
      watchSourceId: source.id,
      contentKey: movie,
      mediaType: 'MOVIE',
      availabilityUrl: 'https://example.com/movie',
    });
    await repos.watchSources.upsertAvailability({
      watchSourceId: source.id,
      contentKey: tv,
      mediaType: 'TV',
      availabilityUrl: 'https://example.com/show',
    });

    expect(await repos.watchSources.listingsForContent(movie)).toHaveLength(1);
    expect(await repos.watchSources.listingsForContent(tv)).toHaveLength(1);
  });
});

describe('watch section media coverage', () => {
  it('serves Anime, Movie and TV from the same tables', async () => {
    const source = await makeSource();
    const cases = [
      { key: 'CANONICAL:mal:21', mediaType: 'ANIME' as const },
      { key: 'TMDB:MOVIE:550', mediaType: 'MOVIE' as const },
      { key: 'TMDB:TV:1396', mediaType: 'TV' as const },
    ];

    for (const entry of cases) {
      await repos.watchSources.upsertAvailability({
        watchSourceId: source.id,
        contentKey: entry.key,
        mediaType: entry.mediaType,
        availabilityUrl: `https://example.com/${entry.mediaType.toLowerCase()}`,
        availabilityStatus: 'AVAILABLE',
      });
    }

    for (const entry of cases) {
      const listings = await repos.watchSources.listingsForContent(entry.key);
      expect(listings, entry.mediaType).toHaveLength(1);
      expect(listings[0]?.listing.mediaType).toBe(entry.mediaType);
    }
  });

  it('treats a title with no rows as stale so it will be fetched', async () => {
    expect(await repos.watchSources.isContentStale('CANONICAL:mal:999', 60_000)).toBe(true);
  });

  it('ignores manual availability when deciding provider freshness', async () => {
    const source = await makeSource();
    await repos.watchSources.upsertImportedAvailability({
      watchSourceId: source.id,
      contentKey: 'CANONICAL:mal:21',
      mediaType: 'ANIME',
      availabilityUrl: 'https://example.com/one-piece',
      canonicalMediaKey: 'mal:21',
    });
    expect(await repos.watchSources.isContentStale('CANONICAL:mal:21', 60_000)).toBe(true);
  });

  it('treats freshly checked provider content as not stale', async () => {
    const source = await makeSource();
    await repos.watchSources.upsertAvailability({
      watchSourceId: source.id,
      contentKey: 'CANONICAL:mal:21',
      mediaType: 'ANIME',
      provider: 'JIKAN',
      providerMediaId: '21',
      availabilityUrl: 'https://example.com/one-piece',
    });
    expect(await repos.watchSources.isContentStale('CANONICAL:mal:21', 60_000)).toBe(false);
  });

  it('tracks canonical Anime freshness separately for each provider', async () => {
    const source = await makeSource();
    await repos.watchSources.upsertAvailability({
      watchSourceId: source.id,
      contentKey: 'CANONICAL:mal:21',
      mediaType: 'ANIME',
      provider: 'JIKAN',
      providerMediaId: '21',
      availabilityUrl: 'https://example.com/one-piece',
    });

    expect(await repos.watchSources.isContentStale('CANONICAL:mal:21', 60_000, 'JIKAN')).toBe(false);
    expect(await repos.watchSources.isContentStale('CANONICAL:mal:21', 60_000, 'KITSU')).toBe(true);
  });
});

describe('candidate review workflow', () => {
  it('holds a community submission for review instead of publishing it', async () => {
    const user = await makeUser();
    const candidate = await repos.watchSources.recordCandidate({
      homepageUrl: 'https://newsite.example/watch',
      suggestedName: 'New Site',
      origin: 'COMMUNITY',
      submittedByUserId: user.id,
    });

    expect(candidate).not.toBeNull();
    // Nothing is live until a human approves it.
    expect(await repos.watchSources.findSourceByDomain('newsite.example')).toBeUndefined();
  });

  it('deduplicates repeated submissions of the same domain', async () => {
    const user = await makeUser();
    const first = await repos.watchSources.recordCandidate({
      homepageUrl: 'https://newsite.example',
      suggestedName: 'New Site',
      origin: 'COMMUNITY',
      submittedByUserId: user.id,
    });
    const second = await repos.watchSources.recordCandidate({
      homepageUrl: 'https://www.newsite.example/',
      suggestedName: 'New Site Again',
      origin: 'COMMUNITY',
      submittedByUserId: user.id,
    });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await repos.watchSources.pendingCandidates()).toHaveLength(1);
  });

  it('rejects an unusable submission outright', async () => {
    const user = await makeUser();
    const candidate = await repos.watchSources.recordCandidate({
      homepageUrl: 'javascript:alert(1)',
      suggestedName: 'Bad',
      origin: 'COMMUNITY',
      submittedByUserId: user.id,
    });
    expect(candidate).toBeNull();
  });

  it('approves into a disabled registry row, not a live one', async () => {
    const user = await makeUser();
    const reviewer = await makeUser('reviewer');
    const candidate = await repos.watchSources.recordCandidate({
      homepageUrl: 'https://newsite.example',
      suggestedName: 'New Site',
      origin: 'COMMUNITY',
      submittedByUserId: user.id,
    });

    const source = await repos.watchSources.approveCandidate({
      candidateId: candidate!.id,
      reviewerUserId: reviewer.id,
      sourceType: WatchSourceType.COMMUNITY,
      supportsAnime: true,
      supportsMovies: false,
      supportsTv: false,
    });

    expect(source).not.toBeNull();
    expect(source?.isEnabled).toBe(false);
    expect(source?.isVerified).toBe(false);
    // Still invisible on a media page until deliberately enabled.
    expect(await repos.watchSources.listingsForContent('CANONICAL:mal:21')).toHaveLength(0);
  });
});

describe('social source ratings and server sharing', () => {
  it('keeps one global rating per user and lets the user change it', async () => {
    const user = await makeUser();
    const source = await makeSource();

    await repos.watchSources.setSourceRating({ watchSourceId: source.id, userId: user.id, rating: 5 });
    await repos.watchSources.setSourceRating({ watchSourceId: source.id, userId: user.id, rating: 2 });

    const stats = (await repos.watchSources.sourceStats([source.id])).get(source.id);
    expect(stats?.ratingCount).toBe(1);
    expect(stats?.ratingAverage).toBe(2);
    expect(stats?.likes).toBe(0);
    expect(stats?.dislikes).toBe(1);
  });

  it('uses simple like/dislike sentiment and reversible admin controls', async () => {
    const source = await makeSource();
    const likeOne = await makeUser('like-one');
    const likeTwo = await makeUser('like-two');
    const dislike = await makeUser('dislike');

    await repos.watchSources.setSourceRating({ watchSourceId: source.id, userId: likeOne.id, rating: 5 });
    await repos.watchSources.setSourceRating({ watchSourceId: source.id, userId: likeTwo.id, rating: 5 });
    await repos.watchSources.setSourceRating({ watchSourceId: source.id, userId: dislike.id, rating: 1 });

    const normal = (await repos.watchSources.sourceStats([source.id])).get(source.id)!;
    expect(normal.likes).toBe(2);
    expect(normal.dislikes).toBe(1);
    expect(normal.likePercent).toBe(67);

    await repos.watchSources.updateSource({
      sourceId: source.id,
      adminRankPenalty: 25,
      adminHealthOverride: 'DOWN',
    });
    const lowered = (await repos.watchSources.sourceStats([source.id])).get(source.id)!;
    expect(lowered.adminRankPenalty).toBe(25);
    expect(lowered.adminHealthOverride).toBe('DOWN');
    expect(lowered.healthStatus).toBe('POSSIBLY_UNAVAILABLE');
    expect(lowered.sentimentScore).toBeLessThan(normal.sentimentScore);

    await repos.watchSources.updateSource({ sourceId: source.id, adminRankPenalty: 0, adminHealthOverride: null });
    const restored = (await repos.watchSources.sourceStats([source.id])).get(source.id)!;
    expect(restored.adminRankPenalty).toBe(0);
    expect(restored.adminHealthOverride).toBeNull();
    expect(restored.healthStatus).toBe('HEALTHY');
  });

  it('keeps a server rating separate from the Couchlist-wide rating', async () => {
    const user = await makeUser();
    const guild = await makeGuild();
    const source = await makeSource();

    await repos.watchSources.setSourceRating({ watchSourceId: source.id, userId: user.id, rating: 4 });
    await repos.watchSources.setSourceRating({
      watchSourceId: source.id,
      userId: user.id,
      guildId: guild.id,
      rating: 5,
    });

    const global = (await repos.watchSources.sourceStats([source.id])).get(source.id);
    const server = (await repos.watchSources.sourceStats([source.id], guild.id)).get(source.id);
    expect(global?.ratingAverage).toBe(4);
    expect(global?.ratingCount).toBe(1);
    expect(server?.ratingAverage).toBe(5);
    expect(server?.ratingCount).toBe(1);
  });

  it('turns repeated recent broken votes into a degraded warning without deleting the source', async () => {
    const source = await makeSource();
    for (let index = 0; index < 5; index += 1) {
      const user = await makeUser(`broken-${index}`);
      await repos.watchSources.setSourceHealth({
        watchSourceId: source.id,
        userId: user.id,
        status: 'BROKEN',
        reason: 'BROKEN_LINK',
      });
    }

    const stats = (await repos.watchSources.sourceStats([source.id])).get(source.id);
    expect(stats?.brokenRecent).toBe(5);
    expect(stats?.healthStatus).toBe('DEGRADED');
    expect(await repos.watchSources.findSourceByDomain('example.com')).toBeDefined();
  });

  it('lets working votes recover the reliability signal', async () => {
    const source = await makeSource();
    const users = await Promise.all(Array.from({ length: 5 }, (_, index) => makeUser(`health-${index}`)));
    for (const user of users) {
      await repos.watchSources.setSourceHealth({ watchSourceId: source.id, userId: user.id, status: 'BROKEN' });
    }
    for (const user of users.slice(0, 4)) {
      await repos.watchSources.setSourceHealth({ watchSourceId: source.id, userId: user.id, status: 'WORKING' });
    }

    const stats = (await repos.watchSources.sourceStats([source.id])).get(source.id);
    expect(stats?.workingRecent).toBe(4);
    expect(stats?.brokenRecent).toBe(1);
    expect(stats?.healthStatus).toBe('HEALTHY');
    expect(stats?.reliabilityPercent).toBe(80);
  });

  it('stores a server-only recommendation with media coverage and a comment', async () => {
    const user = await makeUser();
    const guild = await makeGuild();
    const post = await repos.watchSources.shareWithServer({
      guildId: guild.id,
      userId: user.id,
      homepageUrl: 'https://server-source.example/watch',
      suggestedName: 'Server Source',
      supportsAnime: true,
      supportsMovies: true,
      supportsTv: false,
      comment: 'Good for our watch nights.',
      mediaTitle: 'One Piece',
      mediaType: 'ANIME',
      contentKey: 'CANONICAL:mal:21',
    });

    const posts = await repos.watchSources.listServerPosts(guild.id);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe(post.id);
    expect(posts[0]?.supportsAnime).toBe(true);
    expect(posts[0]?.supportsMovies).toBe(true);
    expect(posts[0]?.supportsTv).toBe(false);
    expect(posts[0]?.comment).toBe('Good for our watch nights.');
    expect(posts[0]?.mediaTitle).toBe('One Piece');
    expect(await repos.watchSources.findSourceByDomain('server-source.example')).toBeUndefined();
  });

  it('can promote a server recommendation into the same Couchlist approval queue', async () => {
    const user = await makeUser();
    const guild = await makeGuild();
    const post = await repos.watchSources.shareWithServer({
      guildId: guild.id,
      userId: user.id,
      homepageUrl: 'https://community.example',
      supportsAnime: true,
      comment: 'Our server recommends it.',
    });

    expect(await repos.watchSources.promoteServerPostToCandidate(post.id, user.id)).toBe(true);
    const pending = await repos.watchSources.pendingCandidates();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.guildId).toBe(guild.id);
    expect(pending[0]?.supportsAnime).toBe(true);
    expect(pending[0]?.comment).toBe('Our server recommends it.');
  });

  it('can approve a title-specific suggestion for an existing source without duplicating the source', async () => {
    const user = await makeUser();
    const reviewer = await makeUser('reviewer');
    const source = await makeSource();
    const candidate = await repos.watchSources.recordCandidate({
      homepageUrl: 'https://example.com',
      suggestedName: 'Example Service',
      origin: 'COMMUNITY',
      submittedByUserId: user.id,
      supportsAnime: true,
      contentKey: 'CANONICAL:mal:21',
      mediaType: 'ANIME',
      mediaTitle: 'One Piece',
      availabilityUrl: 'https://example.com/one-piece',
    });

    expect(candidate).not.toBeNull();
    const approved = await repos.watchSources.approveCandidate({
      candidateId: candidate!.id,
      reviewerUserId: reviewer.id,
      sourceType: WatchSourceType.COMMUNITY,
      supportsAnime: true,
      supportsMovies: false,
      supportsTv: false,
    });

    expect(approved?.id).toBe(source.id);
    const listings = await repos.watchSources.listingsForContent('CANONICAL:mal:21');
    expect(listings).toHaveLength(1);
    expect(listings[0]?.source.id).toBe(source.id);
    expect(listings[0]?.listing.availabilityStatus).toBe('UNKNOWN');
  });
});

describe('broken link reports', () => {
  async function listingFor(sourceId: string) {
    return repos.watchSources.upsertAvailability({
      watchSourceId: sourceId,
      contentKey: 'CANONICAL:mal:21',
      mediaType: 'ANIME',
      availabilityUrl: 'https://example.com/one-piece',
    });
  }

  it('records a report', async () => {
    const user = await makeUser();
    const source = await makeSource();
    const listing = await listingFor(source.id);

    const report = await repos.watchSources.createReport({
      mediaWatchSourceId: listing.id,
      reportedByUserId: user.id,
      reason: 'BROKEN_LINK',
    });

    expect(report).not.toBeNull();
    expect(await repos.watchSources.openReportCount(listing.id)).toBe(1);
  });

  it('does not remove a listing because someone reported it', async () => {
    const user = await makeUser();
    const source = await makeSource();
    const listing = await listingFor(source.id);

    await repos.watchSources.createReport({
      mediaWatchSourceId: listing.id,
      reportedByUserId: user.id,
      reason: 'BROKEN_LINK',
    });

    expect(await repos.watchSources.listingsForContent('CANONICAL:mal:21')).toHaveLength(1);
  });

  it('counts one open report per person per listing', async () => {
    const user = await makeUser();
    const source = await makeSource();
    const listing = await listingFor(source.id);

    await repos.watchSources.createReport({
      mediaWatchSourceId: listing.id,
      reportedByUserId: user.id,
      reason: 'BROKEN_LINK',
    });
    const duplicate = await repos.watchSources.createReport({
      mediaWatchSourceId: listing.id,
      reportedByUserId: user.id,
      reason: 'WRONG_TITLE',
    });

    expect(duplicate).toBeNull();
    expect(await repos.watchSources.openReportCount(listing.id)).toBe(1);
  });
});

describe('existing list functionality is unaffected', () => {
  it('still tracks a title while watch sources exist alongside it', async () => {
    const user = await makeUser();
    const source = await makeSource();
    await repos.watchSources.upsertAvailability({
      watchSourceId: source.id,
      contentKey: 'CANONICAL:mal:21',
      mediaType: 'ANIME',
      availabilityUrl: 'https://example.com/one-piece',
    });

    const entry = await repos.entries.upsert({
      userId: user.id,
      ...ONE_PIECE_ANILIST,
      canonicalMediaKey: ONE_PIECE_CANONICAL,
      status: 'WATCHING',
      title: 'One Piece',
      progress: 1078,
    });

    expect(entry.status).toBe('WATCHING');
    expect(entry.progress).toBe(1078);

    // Deleting the source must not touch the user's list.
    await repos.watchSources.setSourceEnabled(source.id, false);
    const found = await repos.entries.findIdentityOrCanonical(
      user.id,
      ONE_PIECE_ANILIST,
      ONE_PIECE_CANONICAL,
    );
    expect(found?.progress).toBe(1078);
  });
});
