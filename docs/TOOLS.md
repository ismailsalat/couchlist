# Tools

Small things that do a job, at `/guides` (the hub) and `/tools/<slug>`.

## How the safety answer is built

`checkSite()` in `apps/web/src/lib/tools/site-check.ts` asks four tiers and
lets the **worst** answer win. Every tier reports under its own name; nothing
is averaged into a score, because a named report is defensible and an invented
number is not.

| Tier | Source | Needs network? | Needs a key? |
|---|---|---|---|
| 1 | Our own directory, mirrors, link-check history | no | no |
| 2 | `blocked_domains` — public blocklists, synced weekly | no | no |
| 3 | Google Safe Browsing, URLhaus — cached per provider | yes | yes |
| 4 | Name shape: lookalikes of listed domains, punycode | no | no |

Three of the four tiers work with no network and no key. That is deliberate:
the free quotas are small and the providers go down, and a tool that stops
answering when a third party has a bad day is not worth putting on the page.

**An unknown domain is never called safe.** The wording is "not listed", and
it says in as many words that this is not the same as being safe.

### The fallbacks, in order

1. A provider with no key configured → reported `unavailable`.
2. A provider that errors or takes longer than 4s → reported `unavailable`,
   request continues.
3. A blocklist sync that fails → last week's rows keep answering; the failure
   is recorded in `blocklist_syncs` and shown on the status page.
4. Everything unavailable → tiers 1, 2 and 4 still produce an answer.

### What it never does

It is given a **hostname** and never fetches the address. A server that
retrieves user-supplied URLs is the request-forgery hole `parseExternalUrl`
exists to prevent, and a public form in front of one is the worst version of
that. `isPrivateHostname` additionally refuses anything on a private network,
including the cloud metadata endpoint — there is a test for it.

## When a moderator disagrees

A blocklist entry normally beats our own directory, because the cost of being
wrong is asymmetric: a stale listing is more likely than a stale malware
report. But a community list has never heard of this directory, and without
an escape hatch one entry can label a vetted source dangerous and leave the
tool arguing against the catalogue it belongs to.

So a moderator can review a flag and keep the listing, from the admin source
row. What that does **not** do is hide the warning: the checker still names
the list that flagged the domain, and prints the review beside it, so a reader
judges for themselves.

The scoping is the part worth preserving. A review records **which providers
were flagging the domain when it was made** (`reputation_reviewed_sources`).
If a different provider flags it afterwards, that is evidence nobody has
looked at, and the full warning returns on its own. The easy version of this
feature is a permanent "ignore warnings" switch, and it would be a bad one.

The set is captured server-side from a live check, never sent by the client.

## Setting up Google Safe Browsing

1. In a Google Cloud project, **enable the Safe Browsing API** — a key alone
   is not enough, and a key for a project without the API enabled fails with
   403 rather than anything that reads like "turn this on".
2. Create an API key and restrict it to the Safe Browsing API, so a leaked key
   costs you quota and nothing else.
3. Set `GOOGLE_SAFE_BROWSING_API_KEY` locally and in the host's variables.

**Testing it.** Google's test URLs are path-specific:

    http://testsafebrowsing.appspot.com/apiv4/ANY_PLATFORM/MALWARE/URL/
    http://malware.testing.google.test/testing/malware/

Paste the whole thing, not the domain. The bare root of those hosts returns no
match, so a domain-only check looks like a broken key when it is working
perfectly.

This is why the checker keeps the path when one is given. Safe Browsing flags
*URLs*: one bad page on an otherwise ordinary host is the common case, and
asking only about `/` misses it. Our own directory and the blocklists are
keyed by host, so they still answer about the site; only the URL-based
providers see the path.

Cached answers are keyed by the exact target, so a clean page cannot vouch for
a whole site and a bad page cannot condemn one.

## Blocklists

Synced by `packages/db/src/scripts/sync-blocklists.ts`, from GitHub mirrors
that need no account:

- **Phishing.Database** (`phishing-domains-ACTIVE.txt`) → category `PHISHING`
- **StevenBlack hosts** → category `ADS`

`ADS` is informational only and never produces a danger verdict. Most of the
ordinary web serves adverts; treating that as danger would cry wolf.

### Never add a category-based list

Both lists above are **evidence-based**: a domain is on them because somebody
observed a specific thing happening at that address — a credential-stealing
page, an ad server. Neither has an opinion about what kind of site it is.

Several well-known blocklists are **category-based** instead, and some of them
carry a "piracy" or "copyright" category: a domain is listed for *being* a
pirate site, full stop. Wiring one of those in would flag every single listing
in the directory as dangerous, and the tool would spend its time arguing
against the product it is part of.

So the rule for adding a list: it must record *observed behaviour*, not
classification. If the list would flag a source purely for being the kind of
site Couchlist exists to catalogue, it does not belong here, however
reputable the project behind it.

Capped at 300,000 entries per list, ordered most-recent-first.

**They fill themselves.** When the web server starts and finds the table
empty, it downloads them in the background — not awaited, so the server comes
up immediately and a healthcheck never waits on a 13 MB download. It is a
no-op on every boot after the first, which keeps the weekly job in charge of
freshness rather than the restart schedule.

That exists because the alternative was asking somebody to remember a one-off
command after each fresh deploy, and a tool that silently checks less than it
claims is worse than one that is plainly switched off.

To refresh them by hand: `npm run db:sync:blocklists`.

## The browser-side tools

Ad blocker check, download safety check and region check do their work in the
page. Nothing is uploaded. The download check reads only the first 16 bytes of
a file — enough to tell a Windows executable from a Matroska video, and not
enough to be worth sending anywhere.

## Adding a tool

1. Add an entry to `TOOLS` in `packages/shared/src/tools/catalog.ts`.
2. With `state: 'COMING_SOON'` it gets a dashed tile and the roadworks screen
   for free — no page needed.
3. When it is built, add a case to `ToolBody` in `apps/web/src/app/tools/[slug]/page.tsx`
   and flip the state to `READY`.

The same `ComingSoon` component renders the maintenance screen: pass
`heading="Be right back"` for a page that is down rather than unbuilt.
