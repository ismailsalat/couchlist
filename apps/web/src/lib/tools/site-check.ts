import 'server-only';
import { parse as parseDomain } from 'tldts';
import {
  createLogger,
  describeLookalike,
  escalate,
  findLookalikes,
  hasPunycode,
  isPrivateHostname,
  normalizeDomain,
  type KnownDomain,
  type SiteVerdict,
  type VerdictLevel,
  type VerdictSignal,
} from '@couchlist/shared';
import { repos } from '@/lib/db';
import { safeBrowsing } from './providers/safe-browsing';
import { urlhaus } from './providers/urlhaus';
import type { ReputationProvider } from './providers/types';

const log = createLogger({ service: 'tools' });

/**
 * "Is this site safe?"
 *
 * Four tiers, worst answer wins, each reported by name:
 *
 *   1. our own directory      instant, no network, and the only tier that can
 *                             say a site was *removed* and why
 *   2. synced blocklists      a local table, so this tier never fails and
 *                             never needs a key
 *   3. keyed providers        Safe Browsing and URLhaus, cached, each named
 *                             separately rather than averaged
 *   4. shape of the name      lookalikes of domains we list, and non-ASCII
 *                             names rendered to look like ASCII ones
 *
 * Tiers 1, 2 and 4 need no network at all, which is what keeps the tool
 * useful when the providers are unconfigured, over quota or simply down. If
 * every tier comes back empty the answer is "not listed", never "safe".
 *
 * This function is given a hostname and never fetches the site itself. That
 * is the whole reason it is safe to put behind a public form: a server that
 * retrieves user-supplied addresses is the request-forgery hole that
 * `parseExternalUrl` exists to prevent.
 */

const PROVIDERS: readonly ReputationProvider[] = [safeBrowsing, urlhaus];

/** One slow provider must not hold up an answer the other tiers can already give. */
const PROVIDER_TIMEOUT_MS = 4_000;

/**
 * Blocklist coverage, cached.
 *
 * Counting rows per request would add two queries to every lookup for data
 * that changes once a week.
 */
const COVERAGE_TTL_MS = 5 * 60_000;
let coverageCache: { at: number; domains: number; lists: string[]; syncedAt: Date | null } | null = null;

async function blocklistCoverage(): Promise<{ domains: number; lists: string[]; syncedAt: Date | null }> {
  if (coverageCache && Date.now() - coverageCache.at < COVERAGE_TTL_MS) return coverageCache;

  const { tools } = repos();
  const [domains, syncs] = await Promise.all([tools.blockedDomainCount(), tools.lastSyncs()]);
  const ok = syncs.filter((entry) => entry.ok);
  const syncedAt = ok.reduce<Date | null>(
    (latest, entry) => (entry.finishedAt && (!latest || entry.finishedAt > latest) ? entry.finishedAt : latest),
    null,
  );

  coverageCache = { at: Date.now(), domains, lists: ok.map((entry) => entry.list), syncedAt };
  return coverageCache;
}

/** The directory is tiny and changes rarely; re-reading it per request is waste. */
const KNOWN_TTL_MS = 5 * 60_000;
let knownCache: { at: number; entries: KnownDomain[] } | null = null;

export function resetKnownDomainCache(): void {
  knownCache = null;
  coverageCache = null;
}

async function knownDomains(): Promise<KnownDomain[]> {
  if (knownCache && Date.now() - knownCache.at < KNOWN_TTL_MS) return knownCache.entries;

  const rows = await repos().sources.allDomainsForLookalike();
  const entries = rows.map((row) => ({
    domain: row.domain,
    label: parseDomain(row.domain).domainWithoutSuffix ?? row.domain.split('.')[0]!,
    name: row.name,
  }));
  knownCache = { at: Date.now(), entries };
  return entries;
}

export interface SiteCheckInput {
  /** Anything a person might paste: a bare host, or a full URL. */
  query: string;
  /** Set false in tests to keep the suite off the network. */
  allowNetwork?: boolean;
}

export class InvalidDomainError extends Error {}

/** Ask every tier about one domain and compose a single answer. */
export async function checkSite(input: SiteCheckInput): Promise<SiteVerdict> {
  const domain = normalizeDomain(input.query);
  if (!domain) {
    throw new InvalidDomainError('That does not look like a web address.');
  }
  if (isPrivateHostname(domain)) {
    throw new InvalidDomainError('That address is on a private network, so there is nothing to look up.');
  }

  /*
   * Keep the path when one was pasted.
   *
   * `normalizeDomain` deliberately reduces anything to a hostname, which is
   * right for the directory and the blocklists — both are keyed by host. It
   * is wrong for Safe Browsing, which flags individual URLs: the common case
   * is one bad page on an otherwise ordinary domain, and dropping the path
   * meant we asked a question nobody had.
   */
  let path: string | null = null;
  try {
    const candidate = input.query.trim().includes('://') ? input.query.trim() : `https://${input.query.trim()}`;
    const url = new URL(candidate);
    path = url.pathname === '/' && !url.search ? null : `${url.pathname}${url.search}`;
  } catch {
    path = null;
  }

  const parsed = parseDomain(domain);
  const registrable = parsed.domain ?? domain;
  const label = parsed.domainWithoutSuffix ?? domain.split('.')[0]!;

  const { sources, mirrors, tools } = repos();

  const [listed, mirrorSourceId, blocklist, cached, known] = await Promise.all([
    sources.findByDomain(domain),
    mirrors.findSourceIdByDomain(domain),
    tools.blocklistHits([...new Set([domain, registrable])]),
    tools.freshReputation(domain),
    knownDomains(),
  ]);

  const signals: VerdictSignal[] = [];
  let level: VerdictLevel = 'UNKNOWN';
  let title = 'Not listed';
  let body =
    'We have nothing on this address, which is not the same as it being safe — it only means nobody has added or reported it. Treat it the way you would any unknown site: an ad blocker on, no downloads, no sign-ups.';
  let verdictSource: SiteVerdict['source'];
  let lookalikeOf: string | undefined;

  // ---- tier 1: our own directory -------------------------------------
  const row = listed ?? (mirrorSourceId ? await sources.findRowById(mirrorSourceId) : undefined);

  if (row) {
    const viaMirror = !listed;
    verdictSource = { id: row.id, name: row.name, slugPath: `/source/${row.id}` };

    if (row.deletedAt) {
      level = 'REMOVED';
      title = 'Removed from Couchlist';
      body = row.deletedReason
        ? `We removed this one: ${row.deletedReason}`
        : 'We removed this one from the directory. We would not open it.';
      signals.push({
        source: 'Couchlist',
        status: 'flagged',
        detail: 'Removed from the directory.',
        checkedAt: row.deletedAt.toISOString(),
      });
    } else if (row.shouldAvoid) {
      level = 'LISTED_WARN';
      title = 'Listed, with an avoid warning';
      body = row.avoidReason ?? 'This is in the directory but carries our strongest warning.';
      signals.push({ source: 'Couchlist', status: 'flagged', detail: 'Carries an avoid warning.' });
    } else if (row.hiddenAt) {
      level = 'UNKNOWN';
      title = 'Not published yet';
      body = 'This one is in the directory but not published, so it has not been checked by anybody yet.';
      signals.push({ source: 'Couchlist', status: 'unknown', detail: 'Added but not yet published.' });
    } else {
      level = row.hasLotsOfAds ? 'LISTED_WARN' : 'LISTED_OK';
      title = row.hasLotsOfAds ? 'Listed, expect heavy ads' : 'Listed on Couchlist';
      const mirrorNote = viaMirror ? ` It is a known mirror of ${row.name}.` : '';
      body = row.hasLotsOfAds
        ? `${row.name} is in the directory, and people have flagged pop-ups and misleading play buttons on it. It works, but turn an ad blocker on first.${mirrorNote}`
        : `${row.name} is in the directory.${mirrorNote}`;

      signals.push({
        source: 'Couchlist',
        status: row.hasLotsOfAds ? 'flagged' : 'clean',
        detail: row.hasLotsOfAds
          ? 'Listed, with the heavy-ads warning.'
          : `Listed${row.trustedRank !== null ? ' and marked as a moderator pick' : ''}.`,
      });
    }

    // Our own link check is evidence in its own right and worth naming.
    if (row.lastHealthCheckAt) {
      const healthy = row.healthStatus === 'OK';
      signals.push({
        source: 'Couchlist link check',
        status: healthy ? 'clean' : 'unknown',
        detail: healthy
          ? 'Answered normally when we last checked.'
          : `Last check came back ${String(row.healthStatus ?? 'inconclusive').toLowerCase()}.`,
        checkedAt: row.lastHealthCheckAt.toISOString(),
      });
      if (!healthy && row.healthFailures >= 3 && level === 'LISTED_OK') {
        level = 'LISTED_WARN';
        title = 'Listed, but not answering';
        body = `${row.name} is in the directory, but it has failed our last ${row.healthFailures} checks. It may be down or have moved.`;
      }
    }
  }

  // ---- tier 2: synced blocklists -------------------------------------
  // The host and its registrable domain are often the same string, so the
  // two lookups can return the same row twice. One list naming a domain is
  // one signal, however many ways we asked.
  const hits = [...(blocklist.get(domain) ?? []), ...(blocklist.get(registrable) ?? [])].filter(
    (hit, index, all) => all.findIndex((other) => other.list === hit.list) === index,
  );
  const serious = hits.filter((hit) => hit.category !== 'ADS');
  const adsOnly = hits.filter((hit) => hit.category === 'ADS');

  for (const hit of serious) {
    signals.push({
      source: hit.list,
      status: 'flagged',
      detail: `Listed as ${hit.category.toLowerCase()}.`,
      checkedAt: hit.lastSeenAt.toISOString(),
    });
  }
  for (const hit of adsOnly) {
    // Ad and tracker lists are informational. Being on one says a domain
    // serves adverts, which is true of a great deal of the ordinary web, and
    // treating it as danger would cry wolf.
    signals.push({
      source: hit.list,
      status: 'unknown',
      detail: 'On ad and tracker blocklists. Common, and not dangerous by itself.',
      checkedAt: hit.lastSeenAt.toISOString(),
    });
  }

  if (hits.length === 0) {
    /*
     * Say so when nothing matched.
     *
     * Without this line an empty blocklist table and a genuinely clean domain
     * produced identical output: no mention of the blocklists at all. A
     * reader cannot tell "checked, nothing found" from "never checked", and
     * the second one silently reassures. If the sync has never run, this
     * reports the tier as unavailable rather than letting it pass quietly.
     */
    const coverage = await blocklistCoverage();
    signals.push(
      coverage.domains > 0
        ? {
            source: coverage.lists.length > 0 ? coverage.lists.join(' + ') : 'Public blocklists',
            status: 'clean',
            detail: `Not on ${coverage.domains.toLocaleString('en-GB')} domains we hold from the public phishing and malware lists.`,
            checkedAt: coverage.syncedAt ? coverage.syncedAt.toISOString() : undefined,
          }
        : {
            source: 'Public blocklists',
            status: 'unavailable',
            detail: 'Not synced yet, so nothing was checked against them.',
          },
    );
  }

  if (serious.length > 0) {
    level = escalate(level, 'DANGEROUS');
    title = 'Flagged as dangerous';
    const names = [...new Set(serious.map((hit) => hit.list))].join(' and ');
    body = `${names} ${serious.length === 1 ? 'lists' : 'list'} this domain for ${[...new Set(serious.map((h) => h.category.toLowerCase()))].join(' and ')}. We would not open it.`;
  }

  // ---- tier 3: keyed providers ---------------------------------------
  /*
   * Cache per exact target, not per domain. Caching a page's answer under its
   * host would let one clean page vouch for a whole site, and one bad page
   * condemn it.
   */
  const cacheTarget = path ? `${domain}${path}` : domain;
  const cachedForTarget = path ? await tools.freshReputation(cacheTarget) : cached;
  const cachedByProvider = new Map(cachedForTarget.map((entry) => [entry.provider, entry]));

  for (const provider of PROVIDERS) {
    const hit = cachedByProvider.get(provider.name);
    if (hit) {
      signals.push({
        source: provider.name,
        status: hit.status,
        detail: hit.detail ?? '',
        checkedAt: hit.checkedAt.toISOString(),
      });
      if (hit.status === 'flagged') level = escalate(level, 'DANGEROUS');
      continue;
    }

    if (!provider.configured()) {
      signals.push({ source: provider.name, status: 'unavailable', detail: 'Not configured.' });
      continue;
    }
    if (input.allowNetwork === false) {
      signals.push({ source: provider.name, status: 'unavailable', detail: 'Skipped.' });
      continue;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
    try {
      const answer = await provider.lookup({ host: domain, path }, controller.signal);
      signals.push({ source: provider.name, status: answer.status, detail: answer.detail });

      if (answer.cacheFor > 0) {
        await repos().tools.cacheReputation({
          domain: cacheTarget,
          provider: provider.name,
          status: answer.status,
          detail: answer.detail,
          expiresAt: new Date(Date.now() + answer.cacheFor),
        });
      }
      if (answer.status === 'flagged') level = escalate(level, 'DANGEROUS');
    } catch (error) {
      // A provider failing is normal and must never fail the request: the
      // other tiers have already produced an answer worth giving.
      log.warn('provider lookup failed', { provider: provider.name, error: String(error) });
      signals.push({
        source: provider.name,
        status: 'unavailable',
        detail: 'Did not answer in time.',
      });
    } finally {
      clearTimeout(timer);
    }
  }

  if (level === 'DANGEROUS' && serious.length === 0) {
    const flagged = signals.filter((signal) => signal.status === 'flagged' && signal.source !== 'Couchlist');
    if (flagged.length > 0) {
      title = 'Flagged as dangerous';
      body = `${flagged.map((signal) => signal.source).join(' and ')} flagged this domain. We would not open it.`;
    }
  }

  /*
   * ---- a moderator's review of the flags ------------------------------
   *
   * A public blocklist is evidence, not a verdict, and the people who keep
   * one have never heard of this directory. Without this branch a single
   * community entry overrides a source a moderator vetted, and the tool
   * argues against the catalogue it is part of.
   *
   * The review is scoped to the providers it was made against. A provider
   * that starts flagging the domain afterwards is evidence nobody has looked
   * at, so the warning comes back — which is the difference between a review
   * and a permanent mute.
   */
  const flaggedBy = signals
    .filter((signal) => signal.status === 'flagged' && signal.source !== 'Couchlist')
    .map((signal) => signal.source);

  if (row?.reputationReviewedAt && flaggedBy.length > 0) {
    const covered = new Set(row.reputationReviewedSources ?? []);
    const unreviewed = flaggedBy.filter((source) => !covered.has(source));

    if (unreviewed.length === 0) {
      const reviewedOn = row.reputationReviewedAt.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      level = row.hasLotsOfAds ? 'LISTED_WARN' : 'LISTED_OK';
      title = 'Listed — we checked the warning';
      body = row.reputationReviewNote
        ? `${flaggedBy.join(' and ')} ${flaggedBy.length === 1 ? 'flags' : 'flag'} this domain. We reviewed it on ${reviewedOn}: ${row.reputationReviewNote}`
        : `${flaggedBy.join(' and ')} ${flaggedBy.length === 1 ? 'flags' : 'flag'} this domain. A moderator reviewed it on ${reviewedOn} and kept it in the directory. The flag is shown below so you can judge for yourself.`;

      signals.push({
        source: 'Couchlist review',
        status: 'clean',
        detail: `A moderator reviewed ${flaggedBy.join(' and ')} and kept this listing.`,
        checkedAt: row.reputationReviewedAt.toISOString(),
      });
    } else {
      // New evidence since the review. Say so rather than quietly escalating.
      signals.push({
        source: 'Couchlist review',
        status: 'unknown',
        detail: `An earlier review covered ${[...covered].join(' and ') || 'nothing'}, but ${unreviewed.join(' and ')} ${unreviewed.length === 1 ? 'has' : 'have'} flagged it since.`,
        checkedAt: row.reputationReviewedAt.toISOString(),
      });
    }
  }

  // ---- tier 4: the shape of the name ---------------------------------
  if (hasPunycode(domain)) {
    signals.push({
      source: 'Couchlist name check',
      status: 'flagged',
      detail: 'Written in a non-Latin script that can be made to look Latin.',
    });
    if (!row) {
      level = escalate(level, 'LISTED_WARN');
      title = 'Written to look like something else';
      body =
        'This address uses characters from another script that render almost identically to ordinary letters. That is occasionally legitimate and very often not.';
    }
  }

  if (!row) {
    const matches = findLookalikes({ domain: registrable, label }, known);
    const strong = matches.find((match) => match.reason !== 'one-character-off') ?? matches[0];

    if (strong) {
      lookalikeOf = strong.known.domain;
      const severe = strong.reason !== 'one-character-off';
      level = escalate(level, severe ? 'DANGEROUS' : 'LISTED_WARN');
      if (level !== 'DANGEROUS' || serious.length === 0) {
        title = severe ? 'Looks like a site we list — it is not that site' : 'Close to a name we list';
        body = describeLookalike(strong);
      }
      signals.push({
        source: 'Couchlist name check',
        status: 'flagged',
        detail: `Resembles ${strong.known.domain}, which is a different site.`,
      });
    }
  }

  if (level === 'UNKNOWN' && !row) {
    signals.push({
      source: 'Couchlist',
      status: 'unknown',
      detail: 'Not in the directory. Nobody has added or reported it.',
    });
  }

  // ---- what to try instead -------------------------------------------
  // Gathered for every listed source, not only broken ones: the "site down"
  // tool and the safety tool are the same lookup with a different question,
  // and splitting them into two endpoints would mean two round trips and two
  // rate-limit buckets for one answer.
  let mirrorDomains: string[] | undefined;
  let alternatives: SiteVerdict['alternatives'];

  if (row) {
    const [rows, similar] = await Promise.all([
      mirrors.forSource(row.id),
      sources.similar(row.id, 4),
    ]);
    const others = rows.map((entry) => entry.domain).filter((entry) => entry !== domain);
    if (others.length > 0) mirrorDomains = others;
    if (similar.length > 0) {
      alternatives = similar
        .filter((entry) => typeof entry.domain === 'string' && entry.domain.length > 0)
        .map((entry) => ({ id: entry.id, name: entry.name, domain: entry.domain as string }));
    }
  }

  return {
    domain,
    level,
    title,
    body,
    signals,
    source: verdictSource,
    lookalikeOf,
    mirrors: mirrorDomains,
    alternatives,
  };
}
