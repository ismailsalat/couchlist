import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { Database } from '@couchlist/db';
import { repositories, resetTables, setupTestDatabase } from '../helpers/db';

/**
 * The safety checker, against a real database.
 *
 * These cover the behaviour that matters and that a unit test cannot show:
 * that the offline blocklist tier answers with no network and no API key,
 * that the worst tier wins, and above all that an unknown domain is never
 * described as safe.
 */
let db: Database;
let repos: ReturnType<typeof repositories>;
let checkSite: typeof import('@/lib/tools/site-check').checkSite;
let resetKnownDomainCache: typeof import('@/lib/tools/site-check').resetKnownDomainCache;

beforeAll(async () => {
  db = await setupTestDatabase();
  repos = repositories(db);

  // The module under test reaches for the app's shared pool; point it at the
  // test database so both sides see the same rows.
  vi.doMock('@/lib/db', () => ({ repos: () => repos }));
  const module = await import('@/lib/tools/site-check');
  checkSite = module.checkSite;
  resetKnownDomainCache = module.resetKnownDomainCache;
});

beforeEach(async () => {
  await resetTables(db);
  resetKnownDomainCache();
});

async function addSource(input: {
  id: string;
  name: string;
  domain: string;
  hasLotsOfAds?: boolean;
  shouldAvoid?: boolean;
}) {
  await db.execute(sql`
    insert into watch_sources
      (id, name, domain, homepage_url, source_type, supports_anime, is_enabled,
       has_lots_of_ads, should_avoid)
    values (${input.id}, ${input.name}, ${input.domain}, ${`https://${input.domain}/`},
            'COMMUNITY', true, true, ${input.hasLotsOfAds ?? false}, ${input.shouldAvoid ?? false})
  `);
}

describe('checkSite', () => {
  it('never calls an unknown domain safe', async () => {
    const verdict = await checkSite({ query: 'somewhere-nobody-listed.example', allowNetwork: false });

    expect(verdict.level).toBe('UNKNOWN');
    expect(verdict.title).toBe('Not listed');
    expect(verdict.body.toLowerCase()).toContain('not the same as it being safe');
    expect(verdict.body.toLowerCase()).not.toMatch(/\bis safe\b/);
  });

  it('accepts a full URL and answers about its host', async () => {
    const verdict = await checkSite({ query: 'https://Example.COM/some/path?x=1', allowNetwork: false });
    expect(verdict.domain).toBe('example.com');
  });

  it('refuses an address on a private network', async () => {
    await expect(checkSite({ query: 'http://127.0.0.1:3000/', allowNetwork: false })).rejects.toThrow();
    await expect(checkSite({ query: 'http://192.168.1.4/', allowNetwork: false })).rejects.toThrow();
  });

  it('answers from the blocklist tier with no key and no network', async () => {
    await repos.tools.upsertBlockedDomains('Phishing.Database', 'PHISHING', ['bad-example.test']);

    const verdict = await checkSite({ query: 'bad-example.test', allowNetwork: false });

    expect(verdict.level).toBe('DANGEROUS');
    expect(verdict.signals.some((s) => s.source === 'Phishing.Database' && s.status === 'flagged')).toBe(true);
  });

  it('treats an ad blocklist as information, not danger', async () => {
    await repos.tools.upsertBlockedDomains('StevenBlack hosts', 'ADS', ['adserver.test']);

    const verdict = await checkSite({ query: 'adserver.test', allowNetwork: false });

    expect(verdict.level).not.toBe('DANGEROUS');
    expect(verdict.signals.some((s) => s.source === 'StevenBlack hosts' && s.status === 'unknown')).toBe(true);
  });

  it('lets a malware listing beat our own directory entry', async () => {
    await addSource({ id: 'wsr_ok', name: 'AniKoto', domain: 'anikoto.test' });
    await repos.tools.upsertBlockedDomains('Phishing.Database', 'PHISHING', ['anikoto.test']);

    const verdict = await checkSite({ query: 'anikoto.test', allowNetwork: false });

    expect(verdict.level).toBe('DANGEROUS');
    expect(verdict.source?.name).toBe('AniKoto');
  });

  it('reports a listed source plainly', async () => {
    await addSource({ id: 'wsr_ok2', name: 'AniKoto', domain: 'anikoto.test' });

    const verdict = await checkSite({ query: 'anikoto.test', allowNetwork: false });

    expect(verdict.level).toBe('LISTED_OK');
    expect(verdict.source?.name).toBe('AniKoto');
  });

  it('warns about a listing that carries the heavy-ads flag', async () => {
    await addSource({ id: 'wsr_ads', name: 'Afterhours', domain: 'afterhours.test', hasLotsOfAds: true });

    const verdict = await checkSite({ query: 'afterhours.test', allowNetwork: false });

    expect(verdict.level).toBe('LISTED_WARN');
    expect(verdict.body).toContain('ad blocker');
  });

  it('spots a name borrowed from something we list', async () => {
    await addSource({ id: 'wsr_ka', name: 'KissAnime', domain: 'kissanime.to' });

    const verdict = await checkSite({ query: 'kissanime.tv.in', allowNetwork: false });

    expect(verdict.level).toBe('DANGEROUS');
    expect(verdict.lookalikeOf).toBe('kissanime.to');
  });

  it('reports an unconfigured provider as unavailable rather than clean', async () => {
    const verdict = await checkSite({ query: 'anything.test', allowNetwork: false });
    const google = verdict.signals.find((s) => s.source === 'Google Safe Browsing');
    expect(google?.status).toBe('unavailable');
  });
});

describe('being honest about what was checked', () => {
  it('says the blocklists were not synced rather than passing quietly', async () => {
    const verdict = await checkSite({ query: 'nothing-here.example', allowNetwork: false });

    const tier = verdict.signals.find((signal) => signal.source === 'Public blocklists');
    expect(tier?.status).toBe('unavailable');
    expect(tier?.detail).toContain('Not downloaded yet');
  });

  it('says how much it checked against once they are synced', async () => {
    await repos.tools.upsertBlockedDomains('Phishing.Database', 'PHISHING', [
      'one.test',
      'two.test',
      'three.test',
    ]);
    await repos.tools.finishSync(await repos.tools.startSync('Phishing.Database'), {
      ok: true,
      entryCount: 3,
    });
    resetKnownDomainCache();

    const verdict = await checkSite({ query: 'nothing-here.example', allowNetwork: false });

    const tier = verdict.signals.find((signal) => signal.source === 'Phishing.Database');
    expect(tier?.status).toBe('clean');
    expect(tier?.detail).toContain('3');
  });
});

describe("a moderator's review of an external flag", () => {
  async function flagAndReview(domain: string, lists: string[], reviewed: string[]) {
    await addSource({ id: 'wsr_rev', name: 'Reviewed Source', domain });
    for (const list of lists) {
      await repos.tools.upsertBlockedDomains(list, 'PHISHING', [domain]);
    }
    await db.execute(sql`
      update watch_sources
         set reputation_reviewed_at = now(),
             reputation_reviewed_by_user_id = 'usr_admin',
             reputation_review_note = 'One bad advert, since removed.',
             reputation_reviewed_sources = ${JSON.stringify(reviewed)}::jsonb
       where id = 'wsr_rev'
    `);
    resetKnownDomainCache();
  }

  it('keeps a listing a moderator reviewed, and still shows the flag', async () => {
    await flagAndReview('reviewed.test', ['Phishing.Database'], ['Phishing.Database']);

    const verdict = await checkSite({ query: 'reviewed.test', allowNetwork: false });

    expect(verdict.level).toBe('LISTED_OK');
    expect(verdict.title).toContain('we checked the warning');
    // The warning is not hidden: it is still there, by name.
    expect(verdict.signals.some((s) => s.source === 'Phishing.Database' && s.status === 'flagged')).toBe(true);
    expect(verdict.body).toContain('One bad advert');
  });

  it('brings the warning back when a provider nobody reviewed flags it', async () => {
    await flagAndReview(
      'partly.test',
      ['Phishing.Database', 'StevenBlack hosts'],
      ['StevenBlack hosts'],
    );

    const verdict = await checkSite({ query: 'partly.test', allowNetwork: false });

    // Phishing.Database was never reviewed, so the review does not cover it.
    expect(verdict.level).toBe('DANGEROUS');
    const review = verdict.signals.find((s) => s.source === 'Couchlist review');
    expect(review?.status).toBe('unknown');
    expect(review?.detail).toContain('Phishing.Database');
  });

  it('does not let a review mute a lookalike or an unlisted domain', async () => {
    // A review lives on a listing; a domain we do not list cannot have one.
    await addSource({ id: 'wsr_real', name: 'Real Site', domain: 'realsite.test' });
    resetKnownDomainCache();

    const verdict = await checkSite({ query: 'realsite.tv.in', allowNetwork: false });
    expect(verdict.level).toBe('DANGEROUS');
  });
});

describe('a pasted page, not just a domain', () => {
  it('keeps the path for the providers but keys our own tiers by host', async () => {
    await addSource({ id: 'wsr_path', name: 'Pathy', domain: 'pathy.test' });
    resetKnownDomainCache();

    const verdict = await checkSite({ query: 'https://pathy.test/some/page?x=1', allowNetwork: false });

    // The answer is still about the site, because that is what we list.
    expect(verdict.domain).toBe('pathy.test');
    expect(verdict.source?.name).toBe('Pathy');
  });

  it('does not let one page cache an answer for the whole host', async () => {
    await repos.tools.cacheReputation({
      domain: 'cached.test/bad-page',
      provider: 'Google Safe Browsing',
      status: 'flagged',
      detail: 'Flagged for malware.',
      expiresAt: new Date(Date.now() + 60_000),
    });

    // Asking about the bare host must not pick up the page's cached answer.
    const host = await checkSite({ query: 'cached.test', allowNetwork: false });
    expect(host.signals.find((s) => s.source === 'Google Safe Browsing')?.status).toBe('unavailable');
    expect(host.level).not.toBe('DANGEROUS');

    // Asking about that page again does.
    const page = await checkSite({ query: 'https://cached.test/bad-page', allowNetwork: false });
    expect(page.signals.find((s) => s.source === 'Google Safe Browsing')?.status).toBe('flagged');
    expect(page.level).toBe('DANGEROUS');
  });
});
