# Manual testing checklist

The automated suites cover the database guarantees, authorization, ranking,
validation, the HTTP layer and the browser flows — run `npm run check` and
`npm run test:e2e` for those. This list is what still needs a human, mostly
because it depends on a live email provider or on judgement.

Work top to bottom. Each step assumes the previous one passed.

## Before you start

```bash
npm install
cp .env.example .env     # set DATABASE_URL, AUTH_SECRET, ADMIN_EMAILS
npm run db:migrate
npm run db:seed:guides
npm run build && npm start
```

## 1. Email delivery (needs a real provider)

Set `MAIL_TRANSPORT=auto` with a real `RESEND_API_KEY` and `MAIL_FROM`.

- [ ] Type two different passwords on the signup form. It stops you before
      anything is sent, and no account is created for that address.
- [ ] Sign up with an address you can read. A code arrives, and it is six digits.
- [ ] The code works. The account can then vote and contribute.
- [ ] Ask for another code within a minute: it is refused with a wait time.
- [ ] Wait, ask again: a new code arrives, and the **old one no longer works**.
- [ ] Let a code sit for 30 minutes: it is refused as expired.
- [ ] "Forgot password" sends a link that works once, and signs you out of
      other sessions.
- [ ] Start a signup with an address that already has an account. The response
      looks identical to a new signup, and the real owner is emailed about it.

## 2. The directory, as a stranger

Signed out, in a private window:

- [ ] Browsing, searching, filtering and sorting all work.
- [ ] A source page opens, shows the destination domain next to Visit website,
      and the link opens the real site in a new tab.
- [ ] Clicking Save or Like sends you to sign in, and nothing claims to have
      saved anything.
- [ ] After signing in you land back where you were.

## 3. Judgement calls the tests cannot make

- [ ] Open `/admin/guides`. Every seeded guide says "never reviewed". Open the
      official links of at least one guide per topic and confirm they still
      point where the guide says. Confirm the platform support is accurate —
      especially the browser-specific ad-blocking guides, which go stale fastest.
- [ ] Mark one reviewed and confirm the date appears on the public guide page.
- [ ] Read a few guides as someone who does not already know the answer. Are
      the steps followable without guessing?

## 4. Moderation, with a second account

- [ ] Suggest a source as a normal account; it is **not** public yet.
- [ ] As the administrator, approve it. It appears in Discover immediately.
- [ ] The contributor sees "Approved" in My submissions, with a link.
- [ ] Suggest one anonymously and approve it. The public page shows Anonymous,
      and the admin queue still shows who sent it.
- [ ] Reject one with a note. The contributor reads the note.
- [ ] Report a source from three accounts. The admin queue shows **one** card
      with a count of three.
- [ ] Hide a source, confirm it leaves Discover, restore it, confirm it returns.
- [ ] Sign in as a normal account and try `/admin` — it 404s.

### Several people, one website

- [ ] Suggest the **same** website from three accounts, with different names
      and descriptions. Each one is accepted; none is turned away.
- [ ] The admin queue shows them as one card headed "3 submissions", with a
      radio beside each write-up.
- [ ] Pick the *second* write-up and approve. The published listing uses that
      name and description, but the **first** submitter carries "found it
      first".
- [ ] All three appear under Credit. One who chose to stay anonymous shows as
      Anonymous with no link, and their name is not in the page source.
- [ ] Suggest the same website again from one of those accounts before
      approval: it replaces that person's own earlier submission rather than
      adding a fourth.
- [ ] With more than three contributors, the Credit card shows a shortened
      line ("Mina, Jay and 3 others") and a "Show N more contributors" button.

### Signing up holds you until you verify

- [ ] Sign up. Press the back button from the code page: you land back on it.
- [ ] Type `/` or `/saved` into the address bar: same.
- [ ] Use the code. The site opens up and the account menu appears.
- [ ] Sign up again with another address and click "Use a different address".
      You are signed out and can browse normally.

### Telling the marks apart

- [ ] Open Discover with a greyscale filter on. A category, a quality note, a
      warning and a trusted star are still four different things.
- [ ] The star has no pill around it and sits before the name.
- [ ] Hover the star: the reason appears. Tab to it with a screen reader on:
      the reason is read out, not just the word "trusted".

### Quality labels

- [ ] Set one to `4K` from the admin row. It shows as a square outlined badge,
      not a pill.
- [ ] Try one longer than twelve characters. It is refused.
- [ ] Clear it. The badge goes.

### Admin bulk work

- [ ] Tick three rows. The bar appears and says how many.
- [ ] "Select all on this page" selects exactly the page, not the whole table.
- [ ] Open the delete confirmation: every name is listed before you agree.
- [ ] Delete them. All three go; the accounts that voted on them do not.
- [ ] Add a source with the form. It appears in Discover immediately with no
      credit recorded and nothing left in the suggestion queue.
- [ ] Add the same domain twice. The second is refused.

### Trusted picks

- [ ] Mark a low-scoring source as trusted with order 10. It jumps to the top
      of Discover, above sources with far more votes.
- [ ] It shows a gold Trusted mark, and the note appears on hover.
- [ ] It does not jump the queue when sorting by name — that would look broken.
- [ ] Untick it. The note and the mark both go, and it returns to its place.

### Deleting a source

- [ ] Open Edit on a source with votes and saves. "Delete permanently" says
      plainly that hiding is usually better.
- [ ] The confirmation names how many votes and saves go with it.
- [ ] The delete button stays disabled until the domain is typed exactly.
- [ ] Delete it. It is gone from Discover, from Saved, and from any collection.
- [ ] The account that voted on it still exists and can still sign in.

### When email breaks

- [ ] Set a wrong RESEND_API_KEY and try to sign up. The admin overview says
      the key was rejected, and names the variable.
- [ ] Set MAIL_FROM to an unverified domain. The admin overview explains the
      restriction rather than showing a bare 403.

### Votes and saves

- [ ] Like something. It fills in and turns red, and the count goes up by one.
- [ ] Reload. It is still shown as yours.
- [ ] Click it again. The vote clears and the count goes back down.
- [ ] Dislike something else. It is clearly not the same colour as a like.
- [ ] Save something. The bookmark fills in, and it is under Saved.
- [ ] With a colour filter on, a like, a dislike and neither are still three
      visibly different things.

### Exporting your saved list

- [ ] Each of the four formats downloads with the right file extension.
- [ ] Open the CSV in a spreadsheet. A source whose name begins with `=` shows
      as text, not as a formula the spreadsheet runs.
- [ ] Open the Markdown in a notes app. Every link points where it should.
- [ ] The JSON parses.
- [ ] Sign out and request an export URL directly. It refuses.

### Warnings and colour

- [ ] Open a listing with the "Lots of ads" chip and one marked "Avoid". The
      two do not look alike, and neither looks like a category pill.
- [ ] Check this with colour removed (a greyscale filter, or a colour-blind
      simulation). The shapes and words still tell them apart.
- [ ] On an avoided source, the warning sits above the description and the
      button, and the button is not the page's brightest thing.
- [ ] The link still works. This is advice, not a block.
- [ ] Turn the avoid warning off as an admin: the reason disappears with it.

### Going straight to a website

- [ ] On a row, the arrow opens the website in a new tab; the name opens the
      Couchlist page. Both work on a phone.
- [ ] Nothing scrolls sideways at 320px with both controls present.

### Profile pictures

- [ ] Upload a picture in account settings. It appears in the header and
      beside your name on a credited contribution.
- [ ] Remove it. The initial comes back everywhere.
- [ ] An anonymous contribution shows no picture and no name, even when that
      account has one.
- [ ] Try an SVG and a file over 256 KB. Both are refused with a readable
      reason.

### The review queue, when it is busy

- [ ] With more than five websites waiting, the cards arrive collapsed.
- [ ] Search by part of a domain, a suggested name and a submitter's name.
      Each finds what it should, and the URL can be bookmarked.
- [ ] Change the order to newest and oldest, and check the first card moves.
- [ ] Clear the search and confirm the full queue returns.

### Site icons

- [ ] Attach a PNG to a suggestion. The admin card shows it as a thumbnail.
- [ ] Approve that submission: the icon appears beside the listing in Discover
      and at the top of the source page.
- [ ] Approve a *different* submission in the same group. The icon still
      carries over from whichever submission had one.
- [ ] Try to attach an SVG, or a file renamed to `.png` that is not an image.
      It is refused, with a readable reason, before the form is sent.
- [ ] Try a file over 256 KB. It is refused.
- [ ] While a suggestion is still pending, open its icon URL
      (`/api/admin/candidates/<id>/icon`) while signed out — it 401s.

## 4b. Link health and the attention queue

The seeded example sources live on `.invalid` domains, so every check against
them fails. That is the fastest way to see this working.

- [ ] Run `npm run check:links -- --all`. It reports how many it checked and
      how many failed, one line per unhealthy source.
- [ ] Run it twice more. The failure count climbs; it does not reset.
- [ ] Open a source page. It says when the link was last checked, in days.
- [ ] Open a source that has failed three times. The wording is careful: it
      says the address could not be reached and that a moderator has been
      asked to look. It does **not** say the site is dead, and the listing,
      its votes and its Visit button are all unchanged.
- [ ] Open `/admin/attention`. The failing sources are listed with a plain
      reason, a count, and a line saying nothing has been hidden.
- [ ] Point a listing at a real site that redirects (for example
      `http://github.com/`). Run the checker. The source is listed as having
      moved, with the advice to update the address rather than delete it.
- [ ] Point a listing at a working site and run the checker twice. It leaves
      the attention queue, and the source page says it was checked today.
- [ ] As a signed-in verified account, open a source page and press **Link
      looks dead**. It reports in one click and thanks you. Press it again
      after a reload: still accepted, still one open report.
- [ ] Signed out, the same control is a link to sign in, not a dead button.
- [ ] Have three different accounts report the same source. It appears on
      `/admin/attention` with "3 people reported this", without any failed
      check.
- [ ] Confirm `/admin/attention` 404s or redirects for a non-admin account.

## 4c. The pages that say who runs this

- [ ] Open `/about`, `/privacy` and `/terms`. Read them. Every factual claim
      should be true of *your* deployment — no analytics, nothing hosted, who
      runs it, how data is handled.
- [ ] Send a mail to the contact address shown in the footer. It must arrive
      somewhere you read. This is where removal and security reports go.
- [ ] Open `/.well-known/security.txt`. The `Expires` date is in the future.
- [ ] From a source page, use the footer to reach Privacy and Terms.
- [ ] Sign up, and on the verification page open Privacy in a new tab. It
      opens rather than bouncing you back to the code page.
- [ ] Confirm the footer is on the sign-in page. That is the page that looks
      most like phishing without it.

## 4d. Import, export and the bin

- [ ] Open `/admin/import`. Paste a small JSON file with one good row and one
      broken one. Press **Check it first**: it reports what would change and
      lists the bad row with a reason, and nothing is written.
- [ ] Press Import. The good row arrives, and it is **hidden** — confirm it is
      not on Discover.
- [ ] In `/admin/sources`, the hidden badge is red with a crossed-out eye, not
      grey. You can tell at a glance which rows are unpublished.
- [ ] Import the same file again with one field corrected. It updates rather
      than duplicating.
- [ ] Download the export and import it straight back. No rejected rows, no new
      listings.
- [ ] Delete a listing that has votes. It disappears from the directory, and
      appears in `/admin/deleted` with the days remaining. Restore it: it comes
      back hidden, with its votes.

## 4e. Mirrors, icons and previews

- [ ] Edit a source. The open row has an accent edge and a tint, and a sticky
      bar naming it that stays put as you scroll the form.
- [ ] Add a second address under Addresses, then press **Use this**. The
      listing's address changes, its votes stay, and the old address is still
      listed on the public page as an alternative.
- [ ] Try adding an address another listing already uses. It is refused, with a
      reason.
- [ ] Press **Fetch from site** on the icon of a real, reachable site. It takes
      the site's favicon, or says plainly that there is none.
- [ ] Press **Fetch from site** on the preview. It uses the share image the
      site publishes, and the caption on the public page says so.
- [ ] Upload a preview by hand. The caption changes to say a moderator added it.

## 4f. Statistics and the survey

- [ ] Open `/stats` signed out. Every panel renders and the numbers match what
      you can count by hand in the admin list.
- [ ] Press Visit on a listing, then reload `/stats`. The open count went up by
      one. Press it again in the same browser session: it does not double-count.
- [ ] Read the privacy page's counting section. It describes exactly what that
      counter holds. If you change what is collected, change that section.
- [ ] Sign in with an account older than a day. If the survey bar appears,
      answer it — then reload. It never comes back.
- [ ] Dismiss it with the X on another account. Also never comes back, and
      nothing was stored.

## 4g. Screenshots

- [ ] Run `npm run maintenance`. It checks links, empties the bin and then
      captures, and it **exits** rather than hanging — a scheduled job that
      does not terminate gets its next run skipped.
- [ ] Run it with no Chromium installed. It says screenshots are off and
      carries on with the rest, without an error.
- [ ] Install Chromium and run it again. It reports what it captured.
- [ ] Open the listing it captured, signed out. There is **no picture**: the
      capture has not been approved.
- [ ] Open `/admin/previews`. The screenshot is there, large, with the address
      it was taken from. The Screenshots tab shows a count.
- [ ] Press **Discard** on one. It disappears, and the listing still shows no
      picture.
- [ ] Press **Use it** on another. Reload the listing signed out: the picture
      is there, with a caption saying it was taken automatically.
- [ ] With nothing waiting, the Screenshots tab is gone from the admin row.
- [ ] Try `/api/admin/sources/<id>/preview` signed out. It refuses.

## 5. On a real phone

The one thing an emulator cannot show you is the status bar. Check these on
actual hardware:

- [ ] The header starts **below** the clock and the battery, not behind them.
- [ ] Nothing touches the left or right edge of the screen.
- [ ] Rotate to landscape on a notched phone: content stays clear of the
      camera housing on whichever side it ends up.
- [ ] Nothing sits under the home indicator at the bottom.
- [ ] Install it to the home screen and open it from there. That is the mode
      where the status bar overlaps, so it is the one that matters.

An emulator is not a phone. Check on actual hardware:

- [ ] The source row is readable and the Save and Like targets are easy to hit.
- [ ] The guide topic grid works with a thumb.
- [ ] Focusing a search field does not zoom the page.
- [ ] Nothing scrolls sideways.
- [ ] On a source page, the "last checked" line sits quietly under the Visit
      button and does not crowd it.
- [ ] "Link looks dead" is an easy thumb target and does not sit flush against
      "Suggest a correction".
- [ ] The footer links wrap onto two lines rather than scrolling sideways, and
      each one is big enough to tap.

## 6. Accessibility

- [ ] Tab through Discover: focus is always visible, and Skip to content works.
- [ ] Use a screen reader on the directory. Row position, source name,
      category and the Like/Save state are all announced.
- [ ] Check the category pills with a colour-blindness simulator: each one
      still reads, because the name is written out.
