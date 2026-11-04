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

### The live status page is empty until something checks the links

`/tools/status` reads stored results from the weekly link check. That job has
never run in production, so all 54 sources read "not checked yet" and the
counts are 0 up, 0 down, 54 unchecked.

This is the page behaving correctly — unchecked is its own state and is never
counted as working — but it makes the page useless until the job exists.

**The cause is the missing weekly service**, not the page. The same job also
fills listing screenshots and empties the thirty-day deleted bin, which are
likewise empty. `docs/DEPLOYMENT.md` has the five-field setup.

**The fix, if the cron keeps not happening:** do what the blocklists now do and
run the check from `instrumentation.ts` in the background when nothing has
ever been checked. Started and then abandoned, deliberately: unlike a
blocklist, link health goes stale within days, so a boot-time check gives one
good snapshot and then quietly rots unless deploys are frequent. A staleness
window (re-check when the newest result is over a week old) would make deploys
refresh it, at the cost of 54 outbound requests per deploy. Worth doing only
if the scheduled service is genuinely never going to exist.

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
