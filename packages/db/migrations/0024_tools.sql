-- Tools: the data that lets the site answer "is this safe?" without a network call.
--
-- Three tables, one per tier of the answer:
--
--   blocked_domains    a local copy of public blocklists, synced weekly from
--                      their GitHub mirrors. Needs no API key and no account,
--                      so the tool keeps answering when every keyed provider
--                      is down, unconfigured or out of quota.
--
--   domain_reputation  cached answers from the keyed providers. Cached because
--                      their free tiers are small, and because Safe Browsing's
--                      terms permit showing a warning only while the cached
--                      response is still valid — so their expiry is stored
--                      rather than invented here.
--
--   blocklist_syncs    one row per list per run, so freshness can be stated
--                      instead of implied.

CREATE TABLE IF NOT EXISTS blocked_domains (
  domain        text NOT NULL,
  list          text NOT NULL,
  category      text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocked_domains_category_check
    CHECK (category IN ('PHISHING', 'MALWARE', 'ADS'))
);

CREATE UNIQUE INDEX IF NOT EXISTS blocked_domains_pk ON blocked_domains (domain, list);
CREATE INDEX IF NOT EXISTS blocked_domains_domain_idx ON blocked_domains (domain);

CREATE TABLE IF NOT EXISTS domain_reputation (
  domain     text NOT NULL,
  provider   text NOT NULL,
  status     text NOT NULL,
  detail     text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT domain_reputation_status_check
    CHECK (status IN ('clean', 'flagged', 'unknown', 'unavailable'))
);

CREATE UNIQUE INDEX IF NOT EXISTS domain_reputation_pk ON domain_reputation (domain, provider);
CREATE INDEX IF NOT EXISTS domain_reputation_expiry_idx ON domain_reputation (expires_at);

CREATE TABLE IF NOT EXISTS blocklist_syncs (
  id          text PRIMARY KEY,
  list        text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  entry_count integer NOT NULL DEFAULT 0,
  ok          boolean NOT NULL DEFAULT false,
  detail      text
);

CREATE INDEX IF NOT EXISTS blocklist_syncs_list_idx ON blocklist_syncs (list, started_at);
