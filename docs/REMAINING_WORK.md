# What is not built

An honest list. Everything here was in scope at some phase of the brief and is
**not** implemented, so nothing in the product pretends otherwise.

## Phase-two community features not built

The brief puts these after the directory, accounts, credit, guides and
moderation are working, "in manageable phases". These are the ones still
outstanding:

- **Collaborative collections.** Collections exist and can be public or
  private, but they have a single owner. There is no editor permission and no
  sharing model beyond publishing.
- **Source requests.** Nobody can post "I'm looking for somewhere to read X"
  for others to answer, and there is no helpful-answer marking.
- **Source experience notes.** No short per-source notes from readers with a
  helpfulness action.
- **Dated "works for me" confirmations.** Deliberately left out rather than
  approximated: presenting a thumbs-up as evidence a site is up today would be
  the fake metric the brief warns against. The like/dislike vote is not a
  statement about uptime and is not displayed as one.
- **Notifications.** No email or in-app notifications about saved sources,
  followed categories or submission outcomes. Submission outcomes are visible
  in My submissions, which people have to visit. No notification preference UI
  exists, and no promotional email is sent — there is no mailing list.

## Deliberately not done

- **Profile picture upload.** The schema and the UI read `avatarUrl`, but there
  is no upload endpoint, because there is no object-store credential and
  inventing one would have produced an endpoint that cannot work. Validation by
  type and size, and revoking public access to a deleted picture, need to be
  written with the storage backend. Until then a profile shows a letter tile.
- **The zod upgrade.** `npm audit` reports one high-severity advisory in
  production dependencies: zod below 4.6.6 can exhaust memory while validating
  an oversized list, because it checks every element against its rules before
  it reaches the rule saying the list may hold six. Fixing it properly means
  zod 4, which is a major version and touches every schema in
  `packages/shared/src`, so it is its own piece of work rather than a
  drive-by.

  Two things already stand in front of it: request bodies are capped at 2 MB,
  and `assertSaneArrays` in `apps/web/src/lib/api/handler.ts` refuses any list
  over a thousand elements before a validator sees it. Together those remove
  the practical attack. Do the upgrade anyway when there is time, and delete
  the array guard only once it is done.
- **Google sign-in.** The brief marks it optional and later. Not started.
- **Automatic link health checking.** Done, with one thing left to you: it
  does not run unless you schedule it. `npm run check:links` is the command and
  `docs/DEPLOYMENT.md` has the Railway cron settings. The checker re-validates
  every redirect hop through `packages/shared/src/watch/url.ts`, so a listed
  site cannot redirect it into a private address. What it deliberately does not
  do is act: a failing source is put in front of a moderator on
  `/admin/attention` and nothing public changes until a person decides.
- **Account merging for old Discord users.** Legacy Discord accounts are intact
  and keep their contribution credit, but there is no flow to link one to a new
  email account. The brief forbids merging by display name or unverified email,
  and a safe flow needs a decision about how someone proves they own both. See
  "Account transition" below.

## Account transition for legacy Discord users

Nothing has been merged, and nothing will merge itself. The current state:

- Old accounts keep their rows, their `discord_id`, their contribution history
  and their source ownership links.
- They have no email or password, so they cannot sign in. The Discord OAuth
  routes are gone.
- `users_identity_check` allows a row with a `discord_id` and no email, so they
  remain valid.

A safe transition, when you want one, looks like: the person signs in through a
one-time Discord OAuth link added back temporarily, proves control of the old
account that way, then sets an email and password on *that* row. That keeps the
account id stable, so credit and ownership follow automatically. The thing not
to do is match on display name or on an unverified email address.

## Fixed after first delivery

- **Signup left you signed out.** Creating an account through the form did not
  start a session, so clicking through to the verification page bounced to
  sign-in and the code could never be entered. The form now signs in with the
  credentials just submitted, through the ordinary login endpoint — chosen over
  creating a session inside signup, because signup answers identically whether
  or not the address was already registered, and issuing a session in that case
  would sign the visitor in as somebody else.

  It was missed because both the HTTP and browser suites called the signup API
  and then logged in separately, which no person clicking the form ever does.
  `tests/e2e/smoke.spec.ts` now fills the real form and clicks the real buttons;
  reverting the fix makes it fail.

## Testing gaps

- The integration suites run against a real PostgreSQL database and the e2e
  suite against a real browser, but neither has been run against production
  data volumes. Ranking is `ORDER BY` over a computed expression; it is indexed
  for filtering but not for the score, so it is worth re-checking with a large
  directory.
- No load testing of any kind.
- No accessibility audit with a screen reader. Keyboard focus, labels,
  contrast and 44px touch targets were built in and checked by eye and by
  automated layout assertions, which is not the same thing.

## Not verified

- **No deployment has been performed.** No migration has been run against your
  production database, and no email has been delivered through a real provider.
  The Resend integration is written against their documented API and has never
  been exercised with a live key.

## Ideas not yet scheduled

`docs/IDEAS.md` holds the ones worth keeping: a small set of tools above the
guides, a capped favourites shelf on profiles, and a Discord bot. Each entry
records the trap the obvious version falls into, which is the part that gets
forgotten when somebody picks the idea up again.

## Open items from the tools work

### The live status page now fills itself — done

**Resolved.** `/tools/status` used to read stored results from a weekly job
that had never run in production, so all 54 sources read "not checked yet" and
the counts were 0 up, 0 down, 54 unchecked. The page was behaving correctly;
it was simply reporting that nothing had ever been checked.

The cause was a missing scheduled service, not the page. Rather than depend on
a second paid service that nobody remembers to create, the schedule now runs
inside the web process — `apps/web/src/lib/maintenance/scheduler.ts`, started
from `instrumentation.ts`. One pass a tick: the link check (which already
selects only sources last checked over six days ago, and empties the
thirty-day deleted bin), then a blocklist refresh if the newest sync is over a
week old. First pass 60 seconds after boot, then every six hours.

Set `MAINTENANCE_IN_PROCESS=false` to turn it off and go back to an external
schedule; the same work stays one command, `npm run maintenance`.

**The honest trade:** a schedule inside the web server stops when the web
server stops. For link health that is acceptable — the one moment nobody is
reading the status page is while the site is down — and it is why the flag
exists.

**Preview capture is deliberately still a command.** It drives a real browser,
which is hundreds of megabytes the web container has no other reason to carry,
and the screenshots only feed a queue a moderator looks at by hand. Run
`npm run capture:previews` when listings need pictures.

#### The bug this nearly shipped with, worth not repeating

The first version took its advisory lock through the ordinary query helper.
That helper borrows a pooled connection per statement and hands it straight
back, and `pg_try_advisory_lock` is held by the *session* — so the lock and the
unlock landed on different connections. The unlock returned false, nothing
said so, and the lock stayed held by whichever connection took it. The
scheduler would have run exactly one pass and then skipped every later one
while logging `pass_skipped_locked`, which reads like a deliberate decision.

It now checks one client out of the pool and holds it for the pass, and
destroys that connection if the unlock is ever refused. Both the broken
behaviour and the fix are pinned in `tests/integration/maintenance-lock.test.ts`
so the shorter version cannot come back.

#### The page now reports on the schedule itself

Migration `0026_maintenance_runs` adds a row per job per pass. "The schedule
has never run" and "the schedule runs and fails every time" used to render the
identical page, so a job that stopped working was invisible. The board now
says which it is, and quotes the failure when there is one. Silent when
healthy. Covered by `tests/unit/live-status.test.ts`.

### One missed check no longer reads as "down"

**Resolved.** A single failed check used to paint a source red. One failure
from our server is about as likely to be our DNS, our network or a host that
dislikes our user agent that minute as it is to be a dead website, and telling
every visitor that a working site is broken is the kind of confidently wrong
answer that makes a tool worth less than no tool.

There are now four states: answering, **missed one check** (amber, "That may
well have been us"), not answering (two or more in a row — the same evidence
the moderator queue waits for), and not checked yet. Covered by
`tests/unit/live-status.test.ts`.

### KissAnime is listed at `kissanime.tv.in`

Worth a human look. That is the exact shape the tool's own lookalike check
exists to catch: a well-known name, long dead at its original address, on an
unusual suffix. It may be a genuine successor and it may be somebody who took
the name — the directory cannot tell, and neither can the checker.

Two consequences while it stays listed:

- the name check will flag *other* domains for resembling it, treating it as
  the thing worth imitating;
- anybody pasting a different `kissanime.*` address gets told it resembles a
  site Couchlist lists, which is only useful advice if this one is the real one.

Same question applies to `kuoranime.com`, listed as **KuroAnime** — the
spelling in the domain is not the spelling in the name.

## Making the deploy faster

The build itself is around 20 seconds; nearly all of a slow deploy is
install. Two settings on the host account for most of it, and both are
dashboard changes rather than code:

**1. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`** as a build variable.

Playwright is a test dependency and its browser download is roughly 150 MB.
Nothing in a deploy needs it: the only thing that drives a browser is preview
capture, which is a command run by hand. This is deliberately *not* set in
`.npmrc`, because that file is shared with everyone — a fresh clone needs the
browsers for `npx playwright test`, and silently skipping them there turns a
working test suite into a confusing failure.

**2. Watch paths must cover the whole build.**

Listed in `docs/READER-EXTENSION.md`. A host watching only `/apps/web/**`
silently skips a commit that changes `scripts/` or `packages/`, reporting "no
deployment needed" rather than failing — which is far harder to notice than a
broken build, and cost most of an evening once already.

Beyond that, the remaining time is `npm ci` and the Next.js build, both of
which are roughly what they should be for a project this size.
