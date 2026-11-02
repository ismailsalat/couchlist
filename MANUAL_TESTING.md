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

## 5. On a real phone

An emulator is not a phone. Check on actual hardware:

- [ ] The source row is readable and the Save and Like targets are easy to hit.
- [ ] The guide topic grid works with a thumb.
- [ ] Focusing a search field does not zoom the page.
- [ ] Nothing scrolls sideways.

## 6. Accessibility

- [ ] Tab through Discover: focus is always visible, and Skip to content works.
- [ ] Use a screen reader on the directory. Row position, source name,
      category and the Like/Save state are all announced.
- [ ] Check the category pills with a colour-blindness simulator: each one
      still reads, because the name is written out.
