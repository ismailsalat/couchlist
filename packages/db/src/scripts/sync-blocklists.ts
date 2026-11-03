import { closeDatabase, getDatabase } from '../client.js';
import { loadProjectEnv } from '../load-env.js';
import { ToolsRepository } from '../repositories/tools.js';

/**
 * Pull public domain blocklists into our own table.
 *
 * These are the no-key tier of the safety tool. Google Safe Browsing and
 * URLhaus both need an API key and both have small free quotas; this does
 * not. The lists are fetched from their GitHub mirrors, which are plain text
 * over HTTPS with no account, no header and no rate limit worth the name.
 *
 * Run weekly from the maintenance job. A failure here is survivable: the
 * previous sync's rows stay in place and the tool keeps answering from them,
 * which is the entire reason this tier exists.
 */

interface ListSpec {
  /** Shown to people, so it must name the project rather than the file. */
  name: string;
  url: string;
  category: 'PHISHING' | 'MALWARE' | 'ADS';
  /** Hosts files put an IP before the domain; plain lists do not. */
  format: 'plain' | 'hosts';
}

export const BLOCKLISTS: readonly ListSpec[] = [
  {
    name: 'Phishing.Database',
    url: 'https://raw.githubusercontent.com/mitchellkrogza/Phishing.Database/master/phishing-domains-ACTIVE.txt',
    category: 'PHISHING',
    format: 'plain',
  },
  {
    name: 'StevenBlack hosts',
    url: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts',
    category: 'ADS',
    format: 'hosts',
  },
];

/**
 * A ceiling on how much of a list we keep.
 *
 * Phishing.Database alone is on the order of a million entries and grows.
 * Storing all of it costs more than it earns: the entries are ordered with
 * the most recently reported first, and a domain that was phishing four
 * years ago and has not been seen since is not the question anybody is
 * asking. The cap keeps the table small enough to stay entirely in cache.
 */
const MAX_ENTRIES_PER_LIST = 300_000;
const BATCH = 2_000;
const FETCH_TIMEOUT_MS = 90_000;

/** Domains that must never end up on a blocklist, however a list is edited. */
const NEVER_BLOCK = new Set(['couchlist.io', 'localhost']);

const DOMAIN_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/u;

/** Pull domains out of one line, tolerating comments and hosts syntax. */
export function parseLine(line: string, format: ListSpec['format']): string | null {
  const withoutComment = line.split('#')[0]?.trim() ?? '';
  if (!withoutComment) return null;

  let candidate: string;
  if (format === 'hosts') {
    const parts = withoutComment.split(/\s+/u);
    if (parts.length < 2) return null;
    // A hosts file maps an address to a name; we want the name.
    candidate = parts[1]!;
  } else {
    candidate = withoutComment.split(/\s+/u)[0]!;
  }

  const domain = candidate.toLowerCase().replace(/\.+$/u, '').replace(/^www\./u, '');

  // A hosts file's own loopback entries are not blocklist entries.
  if (!domain || domain === 'localhost' || domain.endsWith('.localdomain')) return null;
  if (NEVER_BLOCK.has(domain)) return null;
  if (domain.length > 253 || !domain.includes('.')) return null;
  if (!DOMAIN_SHAPE.test(domain)) return null;

  return domain;
}

async function syncOne(repo: ToolsRepository, spec: ListSpec): Promise<number> {
  const syncId = await repo.startSync(spec.name);
  const startedAt = new Date();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let text: string;
    try {
      const response = await fetch(spec.url, {
        signal: controller.signal,
        headers: { accept: 'text/plain', 'user-agent': 'couchlist-blocklist-sync' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      text = await response.text();
    } finally {
      clearTimeout(timer);
    }

    const seen = new Set<string>();
    for (const line of text.split('\n')) {
      const domain = parseLine(line, spec.format);
      if (domain) seen.add(domain);
      if (seen.size >= MAX_ENTRIES_PER_LIST) break;
    }

    const domains = [...seen];
    for (let index = 0; index < domains.length; index += BATCH) {
      await repo.upsertBlockedDomains(spec.name, spec.category, domains.slice(index, index + BATCH));
    }

    // Anything this run did not touch is no longer on the list upstream.
    const removed = await repo.pruneList(spec.name, startedAt);

    await repo.finishSync(syncId, {
      ok: true,
      entryCount: domains.length,
      detail: removed > 0 ? `${removed} entries dropped since the last run` : undefined,
    });
    console.log(`${spec.name}: ${domains.length} domains, ${removed} dropped`);
    return domains.length;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await repo.finishSync(syncId, { ok: false, entryCount: 0, detail });
    // Deliberately not rethrown: one list failing must not take the others
    // down, and last week's rows are still serving answers.
    console.error(`${spec.name}: sync failed — ${detail}`);
    return 0;
  }
}

/** Sync every list. Returns how many domains are stored in total. */
export async function runBlocklistSync(databaseUrl?: string): Promise<number> {
  const db = getDatabase(databaseUrl ?? process.env.DATABASE_URL ?? '');
  const repo = new ToolsRepository(db);

  let total = 0;
  for (const spec of BLOCKLISTS) {
    total += await syncOne(repo, spec);
  }
  await repo.pruneReputation();
  return total;
}

if (process.argv[1]?.includes('sync-blocklists')) {
  loadProjectEnv();
  runBlocklistSync()
    .then(async (total) => {
      console.log(`Blocklist sync finished: ${total} domains.`);
      await closeDatabase();
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      console.error('Blocklist sync failed:', error);
      await closeDatabase();
      process.exit(1);
    });
}
