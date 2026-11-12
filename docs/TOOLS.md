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

## Why there is no region check

There was one. It asked your browser to fetch something from the site and
compared that with our own scheduled check. It reported that YouTube was down.

A browser cannot tell you *why* a request failed. Blocked where you are,
blocked by your ad blocker, and refused by the site's own cross-origin policy
all arrive as the same failure. In practice the ad blocker is the common case:
a request to another site fired from ours looks exactly like a tracking pixel,
which is the thing a blocker exists to stop. So the tool told people a working
site was down, while the tool beside it congratulated them on the blocker that
caused it.

Probing a known-good control first would catch most of that — if the control
fails too, the browser cannot probe at all. It would still not distinguish a
regional block from a site that refuses cross-origin requests, which is most
large sites.

A real region check needs a server *in that region*. That is infrastructure,
not a bug fix. The tool was removed rather than shipped with caveats, on the
rule that a tool which confidently says the wrong thing is worse than no tool.

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

## The three states

`READY` — works, and we are confident it is right.

`TESTING` — works, but depends on something we cannot verify, so it says so
and asks to be told when it is wrong. The ad blocker check lives here: it
turns on how somebody's extension behaves, which no test of ours can settle.

`COMING_SOON` — not built. Gets a dashed tile and the roadworks screen for
free, with no page needed.

The middle state exists because the alternative was a choice between
overstating a tool and hiding it. A tool that is honest about its own
uncertainty is still useful; one that is quietly unsure is not.

## Adding a tool

1. Add an entry to `TOOLS` in `packages/shared/src/tools/catalog.ts`.
2. With `COMING_SOON` there is nothing else to do.
3. When it is built, add a case to `ToolBody` in
   `apps/web/src/app/tools/[slug]/page.tsx` and move it to `TESTING`, then
   `READY` once it has been used in anger.

## Why there is one link tool and not two

"Is this site safe?" and "Site down — what else?" were separate tools that
took the same input and ran the same lookup. Somebody holding a link has one
question — what is this, and where else can I go — and being made to choose a
door first was our problem rather than theirs.

The safety endpoint already returned mirrors and alternatives; the second tool
existed only because the first was not showing them.

The same `ComingSoon` component renders the maintenance screen: pass
`heading="Be right back"` for a page that is down rather than unbuilt.

## Live status, and what keeps it current

`/tools/status` reports four states per listed source, not two. The extra two
exist to stop the board overclaiming in either direction:

| State | Meaning |
| --- | --- |
| answering | Last check got a reply. A redirect counts: it answered. |
| missed one check | One failed check. Shown amber, worded "That may well have been us." |
| not answering | Two or more failures in a row. |
| not checked yet | Never checked. Never counted as working. |

A single failure is not evidence that a website is down — from our server it is
about as likely to be our DNS, our network, or a host that dislikes our user
agent that minute. Painting that red tells every visitor a working site is
broken. Two in a row is the same evidence the moderator queue already waits
for before flagging a source.

Note also that `401`, `403`, `405` and `429` are treated as **answering**, not
as failures: plenty of hosts refuse an unusual client, and a refusal is proof
that something is there to refuse.

### What keeps it filled

The checks run from inside the web server
(`apps/web/src/lib/maintenance/scheduler.ts`, started by `instrumentation.ts`)
— first pass 60 seconds after boot, then every six hours. A pass runs the link
check, which already selects only sources last checked over six days ago and
empties the thirty-day deleted bin, then refreshes the blocklists if the
newest sync is over a week old.

Only one instance runs a pass, guarded by a PostgreSQL advisory lock held on a
single connection checked out of the pool for the length of the pass. That
detail is load-bearing: the lock belongs to the *session*, and the ordinary
query helper hands its connection back after every statement, so taking the
lock with one query and releasing it with the next unlocks a different session
and leaves the lock held forever. See `tests/integration/maintenance-lock.test.ts`.

Set `MAINTENANCE_IN_PROCESS=false` to use an external schedule instead; the
same work is one command, `npm run maintenance`. Preview capture is not in the
pass — it drives a real browser — and stays `npm run capture:previews`.

### Telling "never ran" apart from "keeps failing"

Every job writes a row to `maintenance_runs` when it starts and again when it
finishes. Without that record those two states produce an identical page —
every source unchecked, "No check has run yet" — which is how a schedule that
quietly broke goes unnoticed for a month.

The board therefore shows a line above the counts, but only when it would tell
the reader something the rows cannot:

- nothing on record → "The scheduled check has not run yet. It runs shortly
  after the site starts, then every six hours." (expected for the first minute
  after a deploy)
- started, never finished → interrupted, or running right now
- finished and failed → says so, and quotes the reason

When the schedule is healthy the line is absent: the rows already say
everything, and a banner repeating it is noise.

A run that is killed mid-pass — a redeploy, an out-of-memory kill — leaves
`finished_at` null, which is why the started/finished pair is written rather
than one row at the end.
