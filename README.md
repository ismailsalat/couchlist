# Couchlist

A community directory of good places to watch and read, plus guides for getting
them working.

Couchlist lists websites and explains how to use them. It does not host, proxy
or mirror video, comics or translated pages.

## What it does

- **Discover** — browse and search sources for Anime, Movies, TV, Manga,
  Manhwa and Comics. No account needed to browse, search, filter, open a source
  page or follow a link.
- **Guides** — pick an ad blocker for your actual browser, play a video file,
  read manga and manhwa, translate a panel, add subtitles, cast to a TV, and
  fix the usual problems. Filtered by topic and by the device you are on.
- **Saved** — keep sources you want again, with a private note on each.
- **Two levels of warning** — a moderator can mark a site "lots of ads" as a
  caution, or "avoid" when it is a bad place to send anyone. An avoided site
  stays listed, so somebody who hears the name elsewhere finds the warning
  rather than silence. Warning colours are reserved: no category pill is
  orange or red, and each warning carries a distinct shape and the words too,
  so colour is never the only thing saying it.
- **One click to the website** — every row has a direct link beside the name,
  for people who have already decided and do not want the listing page first.
- **Contribute** — suggest a source, correct a listing, report a problem, or
  write a guide, credited to your account or anonymously, your choice. A
  suggestion can carry a small PNG, JPEG or WebP icon of the site; the file is
  checked against its own magic bytes, stored as-is and served from Couchlist,
  never hot-linked from the site being listed.
- **One website, many finders** — when several people suggest the same
  website, the submissions are held together as one group. A moderator reads
  them side by side, publishes whichever write-up is best, and everybody who
  sent it is credited; the earliest is recorded as having found it first. On a
  listing with a crowd of contributors the names shorten to "Mina, Jay and 4
  others", expandable in place. The review queue is searchable and sorted by
  how many people asked for a site, and collapses once it is long.
- **Profile pictures** — uploaded through the same validated image pipeline as
  site icons, served from Couchlist rather than hot-linked.
- **Your own vote looks like yours** — a like fills in and turns the accent
  colour, a dislike takes its own cool slate so the two are never confused,
  and both survive a reload.
- **Take your list with you** — the saved list exports as a spreadsheet, plain
  text, Markdown or JSON.
- **Four marks, four shapes** — a category is a rounded pill, a quality note
  is a square outline, a warning is a notched banner, and a moderator's pick
  is a bare gold star. Each is recognisable with the colour removed, which
  colour alone never was.
- **Trusted picks** — a moderator can pin sources above the ranking, in an
  order they choose, with a note saying why.
- **Quality labels** — a short moderator-set note such as 4K or HQ scans.
  Free text within twelve characters, because one list holds video and
  reading sources and no fixed set of values suits both.
- **Admin bulk actions** — tick rows and delete them in one confirmed step
  that lists every name first, and add a listing directly without suggesting
  it to yourself and approving your own suggestion.
- **Bulk import and export** — paste or upload a JSON or CSV file of sites and
  it tells you what would change *before* writing anything: how many created,
  how many updated, how many repeats, and every rejected row with the reason.
  A listing is identified by its domain, so re-importing a corrected file fixes
  rather than duplicates. Everything new arrives hidden. The export is the same
  shape, so it round-trips and doubles as a backup.
- **Mirrors** — one listing, several addresses. A site that changes domain keeps
  its votes, its credit and its description instead of being deleted and
  re-added by a stranger a week later, and the weekly checker proposes a new
  address when it sees a redirect — proposes, never accepts, because the site
  being checked chooses where its redirect points.
- **A thirty-day undo** — deleting marks rather than destroys. The listing
  leaves the directory at once; the votes and credit wait in a recently-deleted
  view in case it was a mistake, and the weekly job empties the bin.
- **A picture of each site, and a queue in front of it** — the listing can
  show what a site looks like, from three places: a moderator's upload, the
  share image the site publishes in its own HTML, or a screenshot taken by a
  scheduled job. The screenshot is the one with the queue: it lands
  unapproved, appears on an admin page with Use it and Discard, and no reader
  sees it until somebody says so. A bot photographing other people's homepages
  will eventually photograph something nobody wants published, and the person
  who finds that out should not be a reader.
- **Statistics, in public** — how big the directory is, what it covers, how the
  links are holding up and which sites get opened, drawn as charts that are
  readable with the colour removed. Every number is a count of rows that
  already exist, plus one aggregate total per listing, described on the privacy
  page in the same words.
- **A one-question survey** — a small dismissible bar, shown once, to a quarter
  of people who have had an account for a day. It asks rather than detects:
  working out whether somebody runs an ad blocker means probing their browser
  with bait, which is what ad-walls do.
- **Profiles worth having** — a real picture, a joined date, a line about
  yourself, and the number that matters: how many strangers kept something you
  found. Milestones are earned and quiet, never a points economy.
- **It says who runs it** — an about page, a privacy page that lists exactly
  what is stored (no third-party analytics, no ad network, no third-party
  scripts anywhere; aggregate counters on listings, never on people), terms
  with an address for removal requests,
  a contact address in the footer of every page, and a `security.txt` whose
  expiry never goes stale. These are the pages a phishing site never has, and
  a new domain that collects an email and a password is judged on whether it
  has them.
- **Links are checked, people are not surprised** — a weekly job sends one
  `HEAD` request per source and records what came back. Three consecutive
  failures, a redirect somewhere else, or three different people reporting the
  same site put it on an admin queue; nothing is hidden or re-ranked
  automatically, because one bad afternoon on somebody else's server is not a
  reason to delete a good listing. Every source page says when it was last
  checked, so the directory reads as maintained rather than abandoned.
- **One click to say a link is dead** — on a source page, next to the
  corrections link. The full report form is right for "this site has malware"
  and far too much for "the page did not load".
- **Verification actually gates the account** — signing up holds you on the
  code page until the address is confirmed. Browsing, the back button and a
  typed URL all land back there, and there is a way out that is not the code.

## Running it locally

You need **Node 20.9+** and **PostgreSQL 13+**. Nothing else: no Docker, no API
keys, no mail account.

```bash
npm install
createdb couchlist            # or make the database however you like
cp .env.example .env
```

Open `.env` and set two things:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/couchlist
AUTH_SECRET=<32+ random characters>      # openssl rand -base64 32
ADMIN_EMAILS=you@example.com             # the address you will sign up with
CONTACT_EMAIL=you@example.com            # shown on /about, /privacy, /terms
```

Leave `MAIL_TRANSPORT=log` as it is — that is what makes local signup work
without a mailbox.

Then:

```bash
npm run db:migrate    # creates the schema
npm run db:seed       # starter guides + example sources to look at
npm run dev           # http://localhost:3000
```

### Signing in without an email account

`MAIL_TRANSPORT=log` sends nothing. Instead the verification code is printed in
your terminal **and** shown on the signup page, both clearly labelled as not
emailed. So:

1. Go to `/signup` and create an account with the address you put in
   `ADMIN_EMAILS`.
2. The six-digit code appears on screen. Enter it.
3. You can now vote, save and contribute, and `/admin` is open to you.

If you want to be an administrator later, or for a different account:

```bash
npm run admin:grant -- someone@example.com
npm run admin:grant -- someone@example.com --revoke
```

### About the seeded data

`npm run db:seed` adds the 22 starter guides and nine example sources so the
directory is not empty. The example sources are invented and live on
`.invalid` domains, which can never resolve — their Visit website buttons go
nowhere on purpose. They exist so you can see the design. `npm run db:reset`
empties everything, and the seed refuses to run against a production
environment or a hosted-looking database.

The guides are real content, but every one says **"not yet reviewed"** until a
moderator checks its links in `/admin/guides`. That is deliberate: they came
from the design reference and have not been verified.

### Checking the links

```bash
npm run check:links                # everything due (last checked 6+ days ago)
npm run check:links -- --all       # everything, ignoring the window
npm run check:links -- --limit 20  # a handful, for a quick look
```

The same job empties the deleted bin: anything deleted more than thirty days
ago is removed for good.

### Taking screenshots

```bash
npm run capture:previews -- --limit 5
```

Needs a Chromium on the machine; without one it says so and exits without an
error. Everything it captures waits on `/admin/previews` for a decision.
`docs/DEPLOYMENT.md` has the Railway settings.

One `HEAD` request per source, four at a time, ten-second timeout, with an
honest user agent. Three consecutive failures put a source on
`/admin/attention`; any success resets the count. Nothing is hidden or
re-ranked automatically. In production this runs weekly from a scheduler —
`docs/DEPLOYMENT.md` has the Railway cron settings.

Against the seeded example sources every check fails, because `.invalid`
domains cannot resolve by design. That is a convenient way to see the admin
queue with something in it.

### If something goes wrong

- **`DATABASE_URL is not set`** — the commands read the `.env` at the
  repository root. Check it is there and not `.env.example`.
- **`AUTH_SECRET is not set`** — the app refuses to start without it.
- **Signup says the email could not be sent** — that is correct with
  `MAIL_TRANSPORT=log`. Use the code shown on the page.
- **Windows and optional dependencies** — `npm run repair:windows-deps`
  reinstalls with optional packages, which fixes the occasional missing
  platform binary.

### Checks

```bash
npm run lint        # eslint, zero warnings allowed
npm run typecheck   # tsc across every workspace
npm test            # unit + integration (needs TEST_DATABASE_URL)
npm run test:e2e    # Playwright, desktop and mobile
npm run build       # production build
npm run check       # lint + typecheck + test
```

The integration suites run against a real PostgreSQL database, because the
guarantees worth testing — one vote per account, one pending suggestion per
submitter, atomic approval that credits a whole group — are enforced by
constraints and transactions, not by application code.

## How it is put together

```
apps/web          Next.js 16 app router, React 19, Tailwind
packages/shared   Domain logic: categories, ranking, credit, validation, auth
packages/db       Drizzle schema, migrations and repositories
tests/            unit, integration (real database), e2e (real browser)
docs/             deployment, remaining work, design direction
docs/history/     release notes from earlier versions, kept for reference
```

A few decisions worth knowing about:

**Ranking is confidence-aware.** A source with one positive vote must not
outrank a well-established one on percentage alone, so the Recommended score
shrinks a small sample toward "nobody knows yet" (`packages/shared/src/directory/ranking.ts`).
80 likes out of 100 scores 0.78; 1 like out of 1 scores 0.56. The same
shrinkage is expressed in SQL so ranking survives pagination, and a unit test
checks the two agree.

**The left-hand number is a list position.** Not a score, not a rating. It
continues correctly across pages.

**Anonymous credit is a display choice, not a deletion.** The server keeps the
submitting account so moderation still works. `publicCredit()` is the only
approved way to build a public credit shape, so there is one place to audit,
and an anonymous contribution carries no name, no avatar and no account id.

**Authorization is always server-side.** Every admin mutation calls
`requireAdmin()`. Hiding a button is never the control.

**Nothing fetches a submitted URL.** Saving a suggestion validates and
normalises the address but never requests it, so a form submission cannot be
turned into a server-side request to an address a stranger chose.

## Credits

Guide content is Couchlist's own wording and links only to official project or
store pages. Seeded guides are marked "not yet reviewed" until a moderator has
actually checked their links, platform support and pricing — Couchlist does not
invent a review date.
