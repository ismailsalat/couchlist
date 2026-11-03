# Ideas not yet built

> **Built since this was written:** the tools section, the safety checker, the
> mirror finder, the live status page and report-without-an-account all now
> exist. See `docs/TOOLS.md`. The entries below are kept for the reasoning and
> the traps, which still apply to what comes next.

Things worth doing, written down while the reasoning is fresh. Nothing here is
scheduled. Each entry says what the idea is, the shape that works, and the
trap that the obvious version falls into — because the trap is the part that
gets forgotten six months later when somebody picks the idea back up.

---

## A small set of tools, above the guides

Useful things Couchlist can do that are not "browse the directory". The test
for belonging here: it uses something Couchlist already knows, and it helps
somebody do a thing.

### Is this site safe?

**The version that works:** type a domain, check it against *our own
directory* first. "Listed, 91% positive, checked two days ago", or "we list
this with an avoid warning: serves malware", or "not listed". That is
instant, costs nothing, needs no third party, and is the most honest answer
available — it is what this community actually found, rather than a number
we made up.

External reputation services can sit underneath as a second opinion, each
one **named separately** ("Google Safe Browsing: clean · URLhaus: clean")
rather than averaged. Reporting what somebody else concluded is defensible;
inventing a composite verdict is not.

**The trap:** a public "paste any URL and we will scan it" box is a different
product with three problems. VirusTotal's free tier is about four requests a
minute, so a public box breaks immediately. A server that fetches arbitrary
user-supplied addresses is exactly the request-forgery surface
`parseExternalUrl` exists to prevent, and pointing a public form at it
invites the one attack this codebase works hardest to refuse. And telling
somebody a malware site is "safe" is worse than having no tool at all.

**Better placement for the scanning itself:** run the reputation checks in
the weekly job, against the sites *already listed*. Bounded set, no user
input, no rate-limit problem, results cached. A site that trips Safe Browsing
gets flagged for review with the reason filled in, feeding labels that
already exist.

### My site is down — what else works?

Type a domain, get its mirrors and the closest listed alternatives in the same
category. Built entirely from the mirrors table and the weekly health data,
both of which already exist. Nothing else on the web has this for these sites.

### A live status page

Which listed sites are answering right now. The weekly check already collects
every bit of this and nobody outside the admin pages can see it. A gap rather
than a feature to invent.

This one belongs on Discover, not with the tools: it is about the directory
itself rather than about helping somebody do something.

### Format and device helper

"What plays .mkv on an iPhone?" A lookup table that routes people into the
subtitle, casting and player guides that are already written.

### Report a site without an account

The lowest-friction contribution there is.

### Where these go

**Not a fourth navigation tab.** Discover / Guides / Saved is three things and
reads instantly; a "Tools" item next to them makes somebody stop and decide
which one they want.

Guides is already "help me do a thing", which is what these are. A small row
of tools at the **top of the Guides page**, above the articles: same page,
same mental model, no new navigation, and they are found by everybody already
going there for help.

---

## Favourites: a shelf, not a library

Let people say what they actually love — a manga, a film, a show — on their
profile.

**The shape:** up to **six** entries, free text, one line each, with an
optional half-sentence on why. The cap is the entire design. Six is a shelf
you glance at; sixty is a library somebody has to browse, and browsing is
where the previous version of this product went wrong.

**No APIs.** Free text, no cover images, no AniList or TMDB identifiers, no
media cache, no third-party rate limits, nothing that breaks when somebody
else's service changes. The provider code from the old build is still in
`packages/shared/src/providers/`; this is the fork in the road, and the point
is not to take it.

**No following, no feed, no notifications.** Profiles already exist and are
already public. A shelf is one more small block on a page that was built for
exactly this. Somebody sees it because they are already looking at that
profile, not because something put it in front of them.

**The aggregate is the real feature.** If forty people name the same title,
that is worth showing: "most loved on Couchlist", grouped by category, built
from counting strings. Individual shelves are the input; the ranked list is
what people actually use, and it is what earns this a place on a site about
finding things. It also bridges back to the directory — "most loved manga"
belongs next to "best manga sites", one page rather than two unrelated halves.

**Two real problems.** Free text means somebody eventually types a slur or a
spam link, so entries must be reportable like everything else; the existing
report queue covers it. And six is a constraint that has to be *held* — the
pressure to raise it to ten and then twenty is precisely how a shelf turns
back into the old product.

---

## Discord bot

Not started, and the blocker is worth knowing: Couchlist has **no public read
API**. Every `GET` is images, health, the saved-list export, or admin. A bot
has nothing to call. That is the work; the library (discord.js) is the easy
part.

**The feature worth building first:** watch for links people post in a channel
and reply with what Couchlist knows — "listed with an avoid warning: serves
malware", or "listed, 91% positive", or nothing at all when it is not listed.
Read-only, no accounts, no tokens, and the only feature in this category that
protects somebody rather than entertaining them. It is also the best possible
advert: the bot answers a question in somebody else's server.

After that: `/find`, `/guide`, then `/suggest` (which needs the bot to
authenticate, so it is a second pass).

**Do not revive `apps/bot`.** It was written for the Discord-first version of
this product, around guild settings and watch posts that no longer exist, and
it has already broken a clean install once. Delete it. The leftover
`discord_guilds` and `guild_settings` tables are a separate decision — see
`REMAINING_WORK.md`.

**Avoid:** playing or streaming anything through the bot, which makes
Couchlist a host rather than a directory and crosses the one line the whole
site is built on not crossing. Also mirroring the directory into a channel
(stale immediately, unsearchable), per-server private lists (splits the
pooled votes that are the entire value), and voting from Discord without
linked accounts (ballot stuffing with extra steps).

---

## Still to build, now that the tools section exists

### Subtitle tools

Shift or stretch a `.srt`; convert between `.ass`, `.ssa`, `.vtt` and `.srt`;
repair the mojibake you get when a Cyrillic or CJK file is decoded as Latin-1;
strip the advert lines rippers bake into subtitle files.

**The shape that works:** all of it in the browser. Subtitle formats are text,
the parsing is a few hundred lines, and nothing needs to leave the machine.

**The trap:** this is the tool most likely to grow into a subtitle editor.
It should do four narrow jobs and stop.

### Video tools

Extract the subtitle tracks baked into an `.mkv`; trim; compress.

**The trap:** ffmpeg.wasm is roughly 25MB and slow on a phone. Shipping it
eagerly would punish every visitor to the hub for a tool most never open. It
has to load only when somebody opens that page, and the page has to say so
before the download starts.

### Comic file tools

Images into a `.cbz`; shrink an oversized volume; split a long webtoon strip
into pages.

**The shape that works:** a `.cbz` is a ZIP of images, so building and reading
one is well-trodden in the browser. Re-encoding to WebP through a canvas is
where the size saving comes from, and the browser does that natively — "best
compression algorithm" in practice means picking WebP or AVIF and a quality,
not writing a codec.

### Downloading a manga panel from a link

**This one cannot be done the way it was asked for.** A browser will not fetch
an image from another site and hand you the bytes; the same-origin policy
stops it, and routing it through our server is exactly the request-forgery
surface the safety tool is built to avoid. The version that works is
drop-the-image-in, like every other tool here.
