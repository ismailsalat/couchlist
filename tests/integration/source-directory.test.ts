import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  CreditMode,
  MAX_VERIFICATION_ATTEMPTS,
  compareSources,
  expiresInMinutes,
  hashAuthToken,
  hashPassword,
} from '@couchlist/shared';
import type { Database } from '@couchlist/db';
import { repositories, resetTables, setupTestDatabase } from '../helpers/db';

/**
 * Directory guarantees, against a real PostgreSQL database.
 *
 * These are the rules that must hold because of a constraint or a transaction
 * rather than because application code remembered: one vote per account,
 * bookmark ownership, duplicate suggestions, atomic approval, and anonymous
 * credit staying anonymous.
 */
let db: Database;
let repos: ReturnType<typeof repositories>;

beforeAll(async () => {
  db = await setupTestDatabase();
  repos = repositories(db);
});

beforeEach(async () => {
  await resetTables(db);
});

let accountCounter = 0;

async function createAccount(options: { verified?: boolean; admin?: boolean } = {}) {
  accountCounter += 1;
  const email = `person${accountCounter}@example.test`;
  // Both of these are read before the first await, so accounts created in
  // parallel do not all end up sharing the latest counter value.
  const displayName = `Person ${accountCounter}`;
  const passwordHash = await hashPassword('a-long-enough-password');
  const user = await repos.accounts.create({ email, passwordHash, displayName });
  if (!user) throw new Error('could not create the test account');
  if (options.verified !== false) await repos.accounts.markEmailVerified(user.id);
  if (options.admin) await repos.accounts.setAdmin(user.id, true);
  return (await repos.accounts.findById(user.id))!;
}

async function createSource(overrides: Partial<{ name: string; domain: string }> = {}) {
  const name = overrides.name ?? `Source ${Math.random().toString(36).slice(2, 8)}`;
  const domain = overrides.domain ?? `${name.toLowerCase().replace(/[^a-z0-9]/gu, '')}.test`;

  const rows = await db.execute(sql`
    insert into watch_sources (id, name, domain, homepage_url, source_type, supports_movies, is_enabled)
    values (${'wsr_' + Math.random().toString(36).slice(2, 14)}, ${name}, ${domain},
            ${'https://' + domain + '/'}, 'COMMUNITY', true, true)
    returning id
  `);
  return (rows.rows[0] as { id: string }).id;
}

describe('one vote per account per source', () => {
  it('replaces a vote rather than adding another', async () => {
    const source = await createSource();
    const user = await createAccount();

    let state = await repos.sources.setVote(source, user.id, 'LIKE');
    expect(state).toMatchObject({ likes: 1, dislikes: 0, userVote: 'LIKE' });

    // Changing a vote must not leave the old one behind.
    state = await repos.sources.setVote(source, user.id, 'DISLIKE');
    expect(state).toMatchObject({ likes: 0, dislikes: 1, userVote: 'DISLIKE' });

    state = await repos.sources.setVote(source, user.id, 'NONE');
    expect(state).toMatchObject({ likes: 0, dislikes: 0, userVote: null });
  });

  it('holds under concurrent requests, because the database enforces it', async () => {
    const source = await createSource();
    const user = await createAccount();

    // Ten simultaneous votes from one account. The unique index is what makes
    // this safe; nothing here serialises the requests.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, index) =>
        repos.sources.setVote(source, user.id, index % 2 === 0 ? 'LIKE' : 'DISLIKE'),
      ),
    );
    expect(results.some((result) => result.status === 'fulfilled')).toBe(true);

    const rows = await db.execute(
      sql`select count(*)::int as count from source_votes where source_id = ${source}`,
    );
    expect((rows.rows[0] as { count: number }).count).toBe(1);
  });

  it('counts one vote per person across accounts', async () => {
    const source = await createSource();
    const [a, b, c] = await Promise.all([createAccount(), createAccount(), createAccount()]);

    await repos.sources.setVote(source, a.id, 'LIKE');
    await repos.sources.setVote(source, b.id, 'LIKE');
    await repos.sources.setVote(source, c.id, 'DISLIKE');

    const state = await repos.sources.voteState(source, a.id);
    expect(state).toMatchObject({ likes: 2, dislikes: 1, userVote: 'LIKE' });
    // Another viewer sees the same totals but their own vote.
    expect((await repos.sources.voteState(source, c.id)).userVote).toBe('DISLIKE');
    expect((await repos.sources.voteState(source)).userVote).toBeNull();
  });

  it('ranks the directory with the same order as the shared comparator', async () => {
    const lucky = await createSource({ name: 'Lucky One', domain: 'lucky.test' });
    const established = await createSource({ name: 'Established', domain: 'established.test' });

    const voters = await Promise.all(Array.from({ length: 12 }, () => createAccount()));
    await repos.sources.setVote(lucky, voters[0]!.id, 'LIKE');
    for (const voter of voters.slice(0, 10)) {
      await repos.sources.setVote(established, voter.id, 'LIKE');
    }
    for (const voter of voters.slice(10)) {
      await repos.sources.setVote(established, voter.id, 'DISLIKE');
    }

    const page = await repos.sources.list({ sort: 'recommended' });
    const names = page.sources.map((source) => source.name);

    // 100% of one vote must not beat 83% of twelve.
    expect(names[0]).toBe('Established');
    expect(names).toEqual([...page.sources].sort(compareSources('recommended')).map((s) => s.name));
  });

  it('keeps numbering sensible across pages', async () => {
    const names = Array.from({ length: 7 }, (_, index) => `Source ${String(index).padStart(2, '0')}`);
    for (const name of names) {
      await createSource({ name, domain: `${name.replace(/\s/gu, '')}.test` });
    }

    const first = await repos.sources.list({ sort: 'name', limit: 3, offset: 0 });
    const second = await repos.sources.list({ sort: 'name', limit: 3, offset: 3 });
    const third = await repos.sources.list({ sort: 'name', limit: 3, offset: 6 });

    const combined = [...first.sources, ...second.sources, ...third.sources].map((s) => s.name);
    expect(combined).toEqual(names);
    expect(new Set(combined).size).toBe(names.length);
    expect(first.total).toBe(7);
  });
});

describe('bookmarks and private notes', () => {
  it('keeps a note readable only through its owner', async () => {
    const source = await createSource();
    const owner = await createAccount();
    const other = await createAccount();

    await repos.sources.setBookmark(source, owner.id, true, 'Needs a blocker');

    expect(await repos.sources.bookmarkNote(source, owner.id)).toBe('Needs a blocker');
    // Another account asking for the same source gets nothing.
    expect(await repos.sources.bookmarkNote(source, other.id)).toBeNull();
  });

  it('never exposes a note through the public directory shape', async () => {
    const source = await createSource();
    const owner = await createAccount();
    await repos.sources.setBookmark(source, owner.id, true, 'SECRET-NOTE-TEXT');

    const page = await repos.sources.list({});
    expect(JSON.stringify(page.sources)).not.toContain('SECRET-NOTE-TEXT');
  });

  it('saves once however many times it is saved', async () => {
    const source = await createSource();
    const owner = await createAccount();

    await repos.sources.setBookmark(source, owner.id, true);
    await repos.sources.setBookmark(source, owner.id, true);
    expect(await repos.sources.bookmarkCount(owner.id)).toBe(1);

    await repos.sources.setBookmark(source, owner.id, false);
    expect(await repos.sources.bookmarkCount(owner.id)).toBe(0);
  });

  it('shows only the owner their own saved list', async () => {
    const source = await createSource();
    const owner = await createAccount();
    const other = await createAccount();
    await repos.sources.setBookmark(source, owner.id, true);

    expect((await repos.sources.list({ savedByUserId: owner.id })).total).toBe(1);
    expect((await repos.sources.list({ savedByUserId: other.id })).total).toBe(0);
  });

  it('keeps an updated note without losing the save', async () => {
    const source = await createSource();
    const owner = await createAccount();
    await repos.sources.setBookmark(source, owner.id, true, 'first');
    await repos.sources.setBookmark(source, owner.id, true, 'second');

    expect(await repos.sources.bookmarkNote(source, owner.id)).toBe('second');
    expect(await repos.sources.bookmarkCount(owner.id)).toBe(1);
  });
});

describe('suggestions, duplicates and approval', () => {
  it('refuses a domain that is already listed', async () => {
    await createSource({ name: 'Existing', domain: 'existing.test' });
    const user = await createAccount();

    const outcome = await repos.contributions.suggestSource({
      domain: 'existing.test',
      homepageUrl: 'https://existing.test/',
      name: 'Existing again',
      categories: ['Movies'],
      submittedByUserId: user.id,
      creditMode: CreditMode.CREDITED,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('already_listed');
  });

  it('groups several suggestions for one domain instead of refusing them', async () => {
    const [a, b, c] = await Promise.all([createAccount(), createAccount(), createAccount()]);
    const payload = {
      domain: 'fresh.test',
      homepageUrl: 'https://fresh.test/',
      name: 'Fresh',
      categories: ['Anime' as const],
      creditMode: CreditMode.CREDITED,
    };

    for (const user of [a, b, c]) {
      const outcome = await repos.contributions.suggestSource({
        ...payload,
        submittedByUserId: user.id,
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.updatedExisting ?? false).toBe(false);
    }

    const groups = await repos.contributions.pendingSuggestionGroups();
    const group = groups.find((entry) => entry.domain === 'fresh.test');
    expect(group).toBeTruthy();
    expect(group!.submissions).toHaveLength(3);
  });

  it('replaces a submitter\'s own earlier suggestion rather than stacking it', async () => {
    const user = await createAccount();
    const payload = {
      domain: 'again.test',
      homepageUrl: 'https://again.test/',
      name: 'Again',
      categories: ['TV' as const],
      submittedByUserId: user.id,
      creditMode: CreditMode.CREDITED,
    };

    const first = await repos.contributions.suggestSource(payload);
    expect(first.ok).toBe(true);

    const second = await repos.contributions.suggestSource({
      ...payload,
      description: 'A better write-up on the second attempt.',
    });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.updatedExisting).toBe(true);

    const group = (await repos.contributions.pendingSuggestionGroups()).find(
      (entry) => entry.domain === 'again.test',
    );
    expect(group!.submissions).toHaveLength(1);
    expect(group!.submissions[0]!.description).toBe('A better write-up on the second attempt.');
  });

  it('credits every submitter when one submission in a group is approved', async () => {
    const admin = await createAccount({ admin: true });
    const [a, b, c] = await Promise.all([createAccount(), createAccount(), createAccount()]);
    const payload = {
      domain: 'crowd.test',
      homepageUrl: 'https://crowd.test/',
      name: 'Crowd',
      categories: ['Manhwa' as const],
    };

    const submitted: string[] = [];
    for (const [index, user] of [a, b, c].entries()) {
      const outcome = await repos.contributions.suggestSource({
        ...payload,
        name: `Crowd ${index}`,
        submittedByUserId: user.id,
        // The last submitter asked not to be named.
        creditMode: index === 2 ? CreditMode.ANONYMOUS : CreditMode.CREDITED,
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) submitted.push(outcome.candidate.id);
    }

    // The admin picks the second write-up, not the first one in.
    const approved = await repos.contributions.approveNewSource(submitted[1]!, admin.id);
    expect(approved.creditedCount).toBe(3);
    expect(approved.source.name).toBe('Crowd 1');

    const credits = await repos.contributions.publicContributions(approved.source.id);
    expect(credits).toHaveLength(3);
    // The first person to suggest it keeps the original credit, even though
    // the admin published someone else's write-up.
    expect(credits.filter((credit) => credit.isOriginal)).toHaveLength(1);
    expect(credits[0]!.isOriginal).toBe(true);
    expect(credits[0]!.credit.displayName).toBe(a.displayName);
    // The anonymous submitter is counted but never named.
    expect(credits.filter((credit) => credit.credit.anonymous)).toHaveLength(1);
    expect(credits.some((credit) => credit.credit.displayName === c.displayName)).toBe(false);

    // Nothing is left pending for that domain.
    const stillPending = (await repos.contributions.pendingSuggestionGroups()).find(
      (entry) => entry.domain === 'crowd.test',
    );
    expect(stillPending).toBeUndefined();
  });

  it('lets a rejected domain be suggested again', async () => {
    const admin = await createAccount({ admin: true });
    const user = await createAccount();
    const payload = {
      domain: 'secondchance.test',
      homepageUrl: 'https://secondchance.test/',
      name: 'Second Chance',
      categories: ['TV' as const],
      submittedByUserId: user.id,
      creditMode: CreditMode.CREDITED,
    };

    const first = await repos.contributions.suggestSource(payload);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    await repos.contributions.rejectCandidate(first.candidate.id, admin.id, 'Not enough detail');

    // The old all-time-unique index made this impossible.
    const again = await repos.contributions.suggestSource(payload);
    expect(again.ok).toBe(true);
  });

  it('publishes an approved source immediately, with original credit, in one step', async () => {
    const admin = await createAccount({ admin: true });
    const contributor = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'approved.test',
      homepageUrl: 'https://approved.test/',
      name: 'Approved Source',
      description: 'A good one',
      categories: ['Anime', 'Manhwa'],
      submittedByUserId: contributor.id,
      creditMode: CreditMode.CREDITED,
    });
    expect(suggestion.ok).toBe(true);
    if (!suggestion.ok) return;

    const result = await repos.contributions.approveNewSource(suggestion.candidate.id, admin.id);

    // Visible straight away: no second enable step.
    expect(result.source.isEnabled).toBe(true);
    const listed = await repos.sources.findById(result.source.id);
    expect(listed?.name).toBe('Approved Source');
    expect(listed?.categories).toEqual(['Anime', 'Manhwa']);

    const credits = await repos.contributions.publicContributions(result.source.id);
    expect(credits).toHaveLength(1);
    expect(credits[0]!.isOriginal).toBe(true);
    expect(credits[0]!.credit.anonymous).toBe(false);

    const candidate = await repos.contributions.findCandidateById(suggestion.candidate.id);
    expect(candidate?.status).toBe('APPROVED');
    expect(candidate?.promotedSourceId).toBe(result.source.id);
  });

  it('refuses to approve the same suggestion twice', async () => {
    const admin = await createAccount({ admin: true });
    const contributor = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'once.test',
      homepageUrl: 'https://once.test/',
      name: 'Once',
      categories: ['Movies'],
      submittedByUserId: contributor.id,
      creditMode: CreditMode.CREDITED,
    });
    if (!suggestion.ok) throw new Error('setup failed');

    await repos.contributions.approveNewSource(suggestion.candidate.id, admin.id);
    await expect(
      repos.contributions.approveNewSource(suggestion.candidate.id, admin.id),
    ).rejects.toThrow();

    // Exactly one source, so a double approval cannot create a duplicate.
    const rows = await db.execute(
      sql`select count(*)::int as count from watch_sources where domain = 'once.test'`,
    );
    expect((rows.rows[0] as { count: number }).count).toBe(1);
  });

  it('leaves nothing behind when approval fails part way', async () => {
    const admin = await createAccount({ admin: true });
    const contributor = await createAccount();

    // A domain that already exists makes the insert inside the transaction fail.
    await createSource({ name: 'Taken', domain: 'collide.test' });
    const suggestion = await repos.contributions.suggestSource({
      domain: 'pending-collide.test',
      homepageUrl: 'https://pending-collide.test/',
      name: 'Collider',
      categories: ['TV'],
      submittedByUserId: contributor.id,
      creditMode: CreditMode.CREDITED,
    });
    if (!suggestion.ok) throw new Error('setup failed');

    await expect(
      repos.contributions.approveNewSource(suggestion.candidate.id, admin.id, {
        domain: 'collide.test',
      }),
    ).rejects.toThrow();

    // The candidate is still pending and no credit row was written: the
    // transaction rolled the whole thing back.
    const candidate = await repos.contributions.findCandidateById(suggestion.candidate.id);
    expect(candidate?.status).toBe('PENDING');

    const credits = await db.execute(sql`select count(*)::int as count from source_contributions`);
    expect((credits.rows[0] as { count: number }).count).toBe(0);
  });

  it('credits a correction separately, leaving the original credit in place', async () => {
    const admin = await createAccount({ admin: true });
    const author = await createAccount();
    const corrector = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'corrected.test',
      homepageUrl: 'https://corrected.test/',
      name: 'Old Name',
      categories: ['Movies'],
      submittedByUserId: author.id,
      creditMode: CreditMode.CREDITED,
    });
    if (!suggestion.ok) throw new Error('setup failed');
    const { source } = await repos.contributions.approveNewSource(suggestion.candidate.id, admin.id);

    const correction = await repos.contributions.suggestCorrection({
      targetSourceId: source.id,
      domain: source.domain,
      submittedByUserId: corrector.id,
      creditMode: CreditMode.CREDITED,
      proposedName: 'New Name',
    });
    const applied = await repos.contributions.approveCorrection(correction.id, admin.id);

    expect(applied.changed).toContain('name');
    expect((await repos.sources.findById(source.id))?.name).toBe('New Name');

    const credits = await repos.contributions.publicContributions(source.id);
    expect(credits).toHaveLength(2);
    // The original contributor keeps their credit.
    const original = credits.find((entry) => entry.isOriginal);
    expect(original?.credit.anonymous).toBe(false);
    expect(credits.filter((entry) => entry.isOriginal)).toHaveLength(1);

    const revisions = await repos.contributions.revisions(source.id);
    expect(revisions).toHaveLength(1);
  });

  it('gives no credit for a correction that changes nothing', async () => {
    const admin = await createAccount({ admin: true });
    const author = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'nochange.test',
      homepageUrl: 'https://nochange.test/',
      name: 'Same Name',
      categories: ['Movies'],
      submittedByUserId: author.id,
      creditMode: CreditMode.CREDITED,
    });
    if (!suggestion.ok) throw new Error('setup failed');
    const { source } = await repos.contributions.approveNewSource(suggestion.candidate.id, admin.id);

    const correction = await repos.contributions.suggestCorrection({
      targetSourceId: source.id,
      domain: source.domain,
      submittedByUserId: author.id,
      creditMode: CreditMode.CREDITED,
      proposedName: 'Same Name',
    });
    const applied = await repos.contributions.approveCorrection(correction.id, admin.id);

    expect(applied.changed).toHaveLength(0);
    // Still only the original credit.
    expect(await repos.contributions.publicContributions(source.id)).toHaveLength(1);
  });

  it('gives a rejected suggestion no credit at all', async () => {
    const admin = await createAccount({ admin: true });
    const user = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'rejected.test',
      homepageUrl: 'https://rejected.test/',
      name: 'Rejected',
      categories: ['Movies'],
      submittedByUserId: user.id,
      creditMode: CreditMode.CREDITED,
    });
    if (!suggestion.ok) throw new Error('setup failed');

    await repos.contributions.rejectCandidate(suggestion.candidate.id, admin.id, 'Spam');

    expect(await repos.contributions.publicContributionCount(user.id)).toBe(0);
    expect(await repos.contributions.ownContributions(user.id)).toHaveLength(0);
  });
});

describe('anonymous credit stays anonymous', () => {
  it('exposes no identity through the public source credit', async () => {
    const admin = await createAccount({ admin: true });
    const contributor = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'anon.test',
      homepageUrl: 'https://anon.test/',
      name: 'Anonymously Suggested',
      categories: ['Comics'],
      submittedByUserId: contributor.id,
      creditMode: CreditMode.ANONYMOUS,
    });
    if (!suggestion.ok) throw new Error('setup failed');
    const { source } = await repos.contributions.approveNewSource(suggestion.candidate.id, admin.id);

    const credits = await repos.contributions.publicContributions(source.id);
    const serialized = JSON.stringify(credits);

    expect(credits[0]!.credit.anonymous).toBe(true);
    expect(serialized).not.toContain(contributor.id);
    expect(serialized).not.toContain(contributor.displayName!);
    expect(serialized).not.toContain(contributor.email!);
  });

  it('keeps an anonymous contribution out of the public profile feed and count', async () => {
    const admin = await createAccount({ admin: true });
    const contributor = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'anonfeed.test',
      homepageUrl: 'https://anonfeed.test/',
      name: 'Hidden Contribution',
      categories: ['Manga'],
      submittedByUserId: contributor.id,
      creditMode: CreditMode.ANONYMOUS,
    });
    if (!suggestion.ok) throw new Error('setup failed');
    await repos.contributions.approveNewSource(suggestion.candidate.id, admin.id);

    // Not in the feed, and not in the count: otherwise a count of 1 next to a
    // feed of 0 would reveal that an anonymous contribution exists.
    expect(await repos.contributions.publicProfileContributions(contributor.id)).toHaveLength(0);
    expect(await repos.contributions.publicContributionCount(contributor.id)).toBe(0);

    // The owner can still see it in their own submissions.
    expect(await repos.contributions.ownContributions(contributor.id)).toHaveLength(1);
  });

  it('lets a contributor change their mind, but only about their own credit', async () => {
    const admin = await createAccount({ admin: true });
    const contributor = await createAccount();
    const stranger = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'switch.test',
      homepageUrl: 'https://switch.test/',
      name: 'Switchable',
      categories: ['Movies'],
      submittedByUserId: contributor.id,
      creditMode: CreditMode.ANONYMOUS,
    });
    if (!suggestion.ok) throw new Error('setup failed');
    const { contribution } = await repos.contributions.approveNewSource(
      suggestion.candidate.id,
      admin.id,
    );

    // A stranger cannot rewrite somebody else's credit.
    expect(
      await repos.contributions.setCreditMode(contribution.id, stranger.id, CreditMode.CREDITED),
    ).toBe(false);

    expect(
      await repos.contributions.setCreditMode(contribution.id, contributor.id, CreditMode.CREDITED),
    ).toBe(true);

    const credits = await repos.contributions.publicContributions(contribution.sourceId!);
    expect(credits[0]!.credit.anonymous).toBe(false);
  });

  it('renders credit as anonymous after the account is deleted', async () => {
    const admin = await createAccount({ admin: true });
    const contributor = await createAccount();

    const suggestion = await repos.contributions.suggestSource({
      domain: 'deleted.test',
      homepageUrl: 'https://deleted.test/',
      name: 'Still Listed',
      categories: ['TV'],
      submittedByUserId: contributor.id,
      creditMode: CreditMode.CREDITED,
    });
    if (!suggestion.ok) throw new Error('setup failed');
    const { source } = await repos.contributions.approveNewSource(suggestion.candidate.id, admin.id);

    const name = contributor.displayName!;
    await repos.accounts.softDelete(contributor.id);

    // The source survives; the identity does not.
    expect(await repos.sources.findById(source.id)).toBeTruthy();
    const credits = await repos.contributions.publicContributions(source.id);
    expect(credits[0]!.credit.anonymous).toBe(true);
    expect(JSON.stringify(credits)).not.toContain(name);

    // And the account can no longer be signed into.
    expect(await repos.accounts.findByEmail(contributor.email!)).toBeUndefined();
  });
});

describe('reports', () => {
  it('groups duplicate reports for one source into a single piece of work', async () => {
    const source = await createSource({ name: 'Broken', domain: 'broken.test' });
    const reporters = await Promise.all([createAccount(), createAccount(), createAccount()]);

    for (const reporter of reporters) {
      await repos.contributions.reportSource({
        sourceId: source,
        reportedByUserId: reporter.id,
        reason: 'BROKEN_LINK',
        details: 'Does not load',
      });
    }

    const groups = await repos.contributions.openReportGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]!.count).toBe(3);
    // One source with open reports, not three separate jobs.
    expect(await repos.contributions.openReportCount()).toBe(1);
  });

  it('collapses a second report from the same person', async () => {
    const source = await createSource();
    const reporter = await createAccount();

    const first = await repos.contributions.reportSource({
      sourceId: source,
      reportedByUserId: reporter.id,
      reason: 'LOTS_OF_ADS',
    });
    const second = await repos.contributions.reportSource({
      sourceId: source,
      reportedByUserId: reporter.id,
      reason: 'LOTS_OF_ADS',
    });

    expect(first.ok).toBe(true);
    expect(second.duplicate).toBe(true);
    expect((await repos.contributions.openReportGroups())[0]!.count).toBe(1);
  });

  it('resolves the whole group at once and lets the same person report again later', async () => {
    const source = await createSource();
    const admin = await createAccount({ admin: true });
    const reporter = await createAccount();

    await repos.contributions.reportSource({
      sourceId: source,
      reportedByUserId: reporter.id,
      reason: 'BROKEN_LINK',
    });

    const resolved = await repos.contributions.resolveReportsForSource(
      source,
      admin.id,
      'Fixed the address',
    );
    expect(resolved).toBe(1);
    expect(await repos.contributions.openReportGroups()).toHaveLength(0);

    // The partial index only blocks a second *open* report, so a recurrence
    // can be reported after the first was resolved.
    const again = await repos.contributions.reportSource({
      sourceId: source,
      reportedByUserId: reporter.id,
      reason: 'BROKEN_LINK',
    });
    expect(again.ok).toBe(true);
    expect(await repos.contributions.openReportCount()).toBe(1);
  });
});

describe('hiding and restoring a source', () => {
  it('removes a hidden source from the public directory but keeps the row', async () => {
    const source = await createSource({ name: 'Hideable', domain: 'hideable.test' });
    expect((await repos.sources.list({})).total).toBe(1);

    await db.execute(
      sql`update watch_sources set is_enabled = false, hidden_at = now(), hidden_reason = 'spam' where id = ${source}`,
    );

    expect((await repos.sources.list({})).total).toBe(0);
    // Still there for an administrator, and still restorable.
    expect((await repos.sources.list({ includeHidden: true })).total).toBe(1);
    expect(await repos.sources.findRowById(source)).toBeTruthy();

    await db.execute(
      sql`update watch_sources set is_enabled = true, hidden_at = null, hidden_reason = null where id = ${source}`,
    );
    expect((await repos.sources.list({})).total).toBe(1);
  });
});

describe('email verification', () => {
  it('spends a code once and refuses it afterwards', async () => {
    const user = await createAccount({ verified: false });
    const code = '123456';

    await repos.accounts.issueToken({
      userId: user.id,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: hashAuthToken(code),
      sentToEmail: user.email!,
      expiresAt: expiresInMinutes(30),
    });

    const first = await repos.accounts.consumeToken('EMAIL_VERIFICATION', hashAuthToken(code), {
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    });
    expect(first.ok).toBe(true);

    const second = await repos.accounts.consumeToken('EMAIL_VERIFICATION', hashAuthToken(code), {
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('already_used');
  });

  it('refuses an expired code', async () => {
    const user = await createAccount({ verified: false });
    const code = '222222';

    await repos.accounts.issueToken({
      userId: user.id,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: hashAuthToken(code),
      sentToEmail: user.email!,
      expiresAt: new Date(Date.now() - 1000),
    });

    const result = await repos.accounts.consumeToken('EMAIL_VERIFICATION', hashAuthToken(code), {
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('refuses a code issued for a different address', async () => {
    const user = await createAccount({ verified: false });
    const code = '333333';

    await repos.accounts.issueToken({
      userId: user.id,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: hashAuthToken(code),
      sentToEmail: 'old-address@example.test',
      expiresAt: expiresInMinutes(30),
    });

    const result = await repos.accounts.consumeToken('EMAIL_VERIFICATION', hashAuthToken(code), {
      expectedEmail: user.email!,
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('email_changed');
  });

  it('gives up after too many wrong guesses', async () => {
    const user = await createAccount({ verified: false });
    const code = '444444';

    await repos.accounts.issueToken({
      userId: user.id,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: hashAuthToken(code),
      sentToEmail: user.email!,
      expiresAt: expiresInMinutes(30),
    });

    // Each wrong guess costs the live code an attempt.
    for (let i = 0; i < MAX_VERIFICATION_ATTEMPTS; i += 1) {
      await repos.accounts.recordFailedAttempt(user.id, 'EMAIL_VERIFICATION');
    }

    const result = await repos.accounts.consumeToken('EMAIL_VERIFICATION', hashAuthToken(code), {
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('too_many_attempts');
  });

  it('supersedes an unused code when a new one is issued', async () => {
    const user = await createAccount({ verified: false });

    await repos.accounts.issueToken({
      userId: user.id,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: hashAuthToken('111111'),
      sentToEmail: user.email!,
      expiresAt: expiresInMinutes(30),
    });
    await repos.accounts.issueToken({
      userId: user.id,
      purpose: 'EMAIL_VERIFICATION',
      tokenHash: hashAuthToken('999999'),
      sentToEmail: user.email!,
      expiresAt: expiresInMinutes(30),
    });

    // Only the newest email works.
    const old = await repos.accounts.consumeToken('EMAIL_VERIFICATION', hashAuthToken('111111'), {
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    });
    expect(old.ok).toBe(false);

    const fresh = await repos.accounts.consumeToken('EMAIL_VERIFICATION', hashAuthToken('999999'), {
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
    });
    expect(fresh.ok).toBe(true);
  });

  it('refuses a second account for the same address', async () => {
    const first = await repos.accounts.create({
      email: 'duplicate@example.test',
      passwordHash: await hashPassword('a-long-enough-password'),
      displayName: 'First',
    });
    expect(first).toBeTruthy();

    // Different capitalisation is the same address.
    const second = await repos.accounts.create({
      email: 'Duplicate@Example.TEST',
      passwordHash: await hashPassword('a-long-enough-password'),
      displayName: 'Second',
    });
    expect(second).toBeNull();
  });
});

describe('private collections', () => {
  it('serves a private collection only to its owner', async () => {
    const owner = await createAccount();
    const other = await createAccount();
    const collection = await repos.collections.create({
      ownerUserId: owner.id,
      name: 'Weekend movies',
      isPublic: false,
    });

    expect(
      await repos.collections.findForViewer(owner.id, collection.slug, owner.id),
    ).toBeTruthy();
    // Another account, and an anonymous visitor, get nothing.
    expect(
      await repos.collections.findForViewer(owner.id, collection.slug, other.id),
    ).toBeUndefined();
    expect(await repos.collections.findForViewer(owner.id, collection.slug)).toBeUndefined();
  });

  it('serves a public collection to anyone', async () => {
    const owner = await createAccount();
    const collection = await repos.collections.create({
      ownerUserId: owner.id,
      name: 'Public picks',
      isPublic: true,
    });

    expect(await repos.collections.findForViewer(owner.id, collection.slug)).toBeTruthy();
    expect(await repos.collections.listPublic()).toHaveLength(1);
  });

  it('keeps a private collection out of the public listing', async () => {
    const owner = await createAccount();
    await repos.collections.create({ ownerUserId: owner.id, name: 'Secret', isPublic: false });

    expect(await repos.collections.listPublic()).toHaveLength(0);
    expect(await repos.collections.listOwned(owner.id)).toHaveLength(1);
  });

  it('refuses writes to a collection the caller does not own', async () => {
    const owner = await createAccount();
    const other = await createAccount();
    const source = await createSource();
    const collection = await repos.collections.create({
      ownerUserId: owner.id,
      name: 'Mine',
      isPublic: false,
    });

    expect(await repos.collections.addItem(collection.id, other.id, source)).toBe(false);
    expect(await repos.collections.addItem(collection.id, owner.id, source)).toBe(true);
    expect(await repos.collections.removeItem(collection.id, other.id, source)).toBe(false);
    expect(await repos.collections.update(collection.id, other.id, { isPublic: true })).toBeUndefined();
    expect(await repos.collections.remove(collection.id, other.id)).toBe(false);
  });
});

/**
 * The image table now holds three different kinds of thing. A row that
 * belongs to two owners at once, or to none, would make "whose picture is
 * this" unanswerable, so the database refuses it rather than trusting every
 * future caller to remember.
 */
describe('stored images', () => {
  it('refuses an image with no owner and one with two', async () => {
    const user = await createAccount();
    const sourceId = await createSource();

    const insert = (columns: string, values: string) =>
      db.execute(
        sql.raw(
          `insert into source_icons (id, mime, bytes, byte_size${columns})
           values ('ico_${Math.random().toString(36).slice(2, 12)}', 'image/png',
                   '\\x89504e47'::bytea, 4${values})`,
        ),
      );

    await expect(insert('', '')).rejects.toThrow();
    await expect(
      insert(', source_id, user_id', `, '${sourceId}', '${user.id}'`),
    ).rejects.toThrow();

    // One owner is fine.
    await expect(insert(', user_id', `, '${user.id}'`)).resolves.toBeDefined();
  });

  it('allows only one picture per account', async () => {
    const user = await createAccount();
    const png = { mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), byteSize: 4 };

    await repos.icons.setUserAvatar(user.id, png);
    await repos.icons.setUserAvatar(user.id, {
      ...png,
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d]),
      byteSize: 5,
    });

    const rows = await db.execute(
      sql`select count(*)::int as n from source_icons where user_id = ${user.id}`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(1);

    const stored = await repos.icons.forUser(user.id);
    expect(stored?.bytes.length).toBe(5);
  });

  it('records the picture type on the account, and clears it on removal', async () => {
    const user = await createAccount();
    await repos.icons.setUserAvatar(user.id, {
      mime: 'image/webp',
      bytes: Buffer.from('RIFF0000WEBP'),
      byteSize: 12,
    });

    expect((await repos.accounts.findById(user.id))?.avatarMime).toBe('image/webp');

    await repos.icons.removeUserAvatar(user.id);
    expect((await repos.accounts.findById(user.id))?.avatarMime).toBeNull();
    expect(await repos.icons.forUser(user.id)).toBeUndefined();
  });

  it('takes an account picture with the account when it is deleted', async () => {
    const user = await createAccount();
    await repos.icons.setUserAvatar(user.id, {
      mime: 'image/png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      byteSize: 4,
    });

    await db.execute(sql`delete from users where id = ${user.id}`);

    const rows = await db.execute(
      sql`select count(*)::int as n from source_icons where user_id = ${user.id}`,
    );
    expect((rows.rows[0] as { n: number }).n).toBe(0);
  });

  it('never purges an account picture as an orphaned suggestion icon', async () => {
    const user = await createAccount();
    await repos.icons.setUserAvatar(user.id, {
      mime: 'image/png',
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      byteSize: 4,
    });

    const purged = await repos.icons.purgeOrphans(new Date(Date.now() + 86_400_000));
    expect(purged).toBe(0);
    expect(await repos.icons.forUser(user.id)).toBeDefined();
  });
});
