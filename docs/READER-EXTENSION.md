# The reader extension

Sends a chapter you already have open to your Couchlist reader.

## What it is

Six files, about 10 KB, and no background worker. The popup reads the tab you
are looking at, collects image URLs and chapter links, and opens your reader
with them. That is the whole thing.

It was deliberately kept this small. An earlier template did the same job with
a service worker, stored sessions, per-image network rules and base64 image
transfer through the extension; every one of those was a thing that could
break, hold memory, or need explaining. Here the reader loads the images
itself, straight from their own server, exactly as a browser normally would.

| File | Job |
| --- | --- |
| `manifest.json` | Permissions and the popup |
| `popup.html/.css/.js` | The button, the site setting, the handover |
| `collect.js` | Runs in your tab, returns image and link URLs |
| `icon128.png` | Toolbar icon |

## How a chapter gets across

The popup opens `…/tools/comics#chapter=<json>`. A URL fragment is never sent
to a server, so the chapter passes between two tabs in your own browser and
Couchlist never receives it.

Because a fragment can be crafted by anyone, the reader trusts none of it.
`parseHandover` re-checks every page link with the same rules a pasted link
gets — public http(s) only, no private or loopback addresses, no `data:`, no
`javascript:` — bounds every string, caps the page count, and drops
duplicates. A handover that survives none of that is reported, not partly
applied. See `tests/unit/handover.test.ts`.

The fragment is cleared from the address bar once read, so a refresh does not
silently re-import.

## Permissions

`activeTab`, `scripting`, `storage`, and **optional** host access. No site
access is requested at install time. When you press the button, Chrome asks
about that one site, from your click — which is also the only way Chrome will
grant it. You can revoke it at any time in the browser's own settings.

It does not sign in, get past logins, paywalls or CAPTCHAs, and it never
fetches anything in the background.

## Browser support

Chrome, Edge, Brave and Opera on desktop. **Not** Firefox (different
extension APIs), and **not** Safari or any phone browser — they do not support
this kind of extension. The reader itself works everywhere, including phones;
only the import needs the extension.

## Installing

Built by `npm run build:extension` into
`apps/web/public/couchlist-reader-extension.zip`, which runs as part of
`npm run build`, so the download is never older than the code.

Users: unzip, open `chrome://extensions`, turn on Developer mode, Load
unpacked, choose the folder. Because it is not from the Chrome Web Store it
will not auto-update.

## Source support — nothing is verified yet

| Source | Rule | Checked against the live site |
| --- | --- | --- |
| MangaKatana | `#imgs img` | **No** |
| ZazaManga | `img.wp-manga-chapter-img` | **No** |
| AsuraScans | `img[alt^="Page "]` | **No** |
| WeebCentral | image sections, page labels | **No** |
| MangaFire | reader containers, page labels | **No** |
| Everything else | common containers, then image size | **No** |

These rules were written against the structure these sites are documented to
use. None has been run against the live site from here, so none is promised.
**No compatibility is claimed, and no success rate is claimed.** That is why
the feature ships marked *under testing*, and why it should not be promoted
to Ready until real numbers exist for the top sources.

When the size-based fallback is used, the chapter is flagged as guessed so the
reader can warn that the page order may be wrong and unrelated images may have
come along.

## What it cannot read

Chapters drawn onto a `<canvas>`, scrambled images, and pages whose image URLs
only work with the site's own cookies. These are reported as "no chapter
images found" with an explanation, rather than shown as broken pages.

## Chapter navigation

Handled by `packages/shared/src/tools/chapter-links.ts`, ported from the
desktop template's rules.

**Nothing is ever constructed by adding one to a number in a URL.**
`/chapter/9555322` is a database row ID, and `50.5` may be followed by `50.6`,
`51`, or an unnumbered bonus. MangaFire and WeebCentral are excluded from
number parsing outright.

Destinations come from, in order: a previous/next link the source published,
then the collected chapter list. The safeguard that makes this work is the
**family** — host plus the path with the chapter number blanked — so a
"you might also like" card in the sidebar can never be mistaken for the next
chapter.

When neither yields an answer the reader says *"We could not find the next
chapter. That does not mean the series has ended"* and offers somewhere to
paste the link. A missing link is never reported as the end of a series, and
a collected chapter list is always marked as possibly incomplete.

## Why the archive is written in plain Node

The first version of `scripts/build-extension.mjs` shelled out to `zip`. That
works on a developer's machine and fails in the deploy image, which has no
such binary — the build died with `spawn zip ENOENT` after passing locally.

The rewrite builds the archive with `node:zlib` and a hand-written ZIP
directory, so it depends on nothing but Node. The replacement then shipped a
mistyped CRC-32 polynomial (`0xeddb8832` for `0xedb88320`) and produced an
archive that looked fine and that every tool refused to open.

`tests/unit/build-extension.test.ts` pins both: it runs the real script with
an **empty PATH**, so any reach for a binary fails the test, and reads the
result back with Couchlist's own archive reader, so a corrupt archive fails
here rather than in somebody's browser.

Entries carry a fixed timestamp, so identical source always produces an
identical archive and "did the extension actually change?" can be answered by
comparing hashes. The zip itself is gitignored — it is generated by the
build, never committed.

## Build commands — both paths must work

The web app is built two different ways depending on who is asking, and both
have to produce the same thing:

- `npm run build` at the root
- `npm run build --workspace=@couchlist/web`, which is what the deploy host
  was configured to run

The second one used to fail outright on a clean checkout — `next build` alone
never builds `@couchlist/shared` or `@couchlist/db`, so the web app could not
resolve them, and it never ran `build:extension`, so the download this page
offers would have 404'd.

So `apps/web` now has a `prebuild` that calls the root's `build:deps`, which
packages the extension and builds `shared` and `db` in order. The root
`build` is simply the web build, and its dependencies come along through the
same hook. There is one definition of what a web build needs, and it does not
matter which command starts it.

### Watch paths

If the deploy host filters pushes by path, the list has to cover every input
to the build, not just `apps/web`. A change limited to `scripts/` or
`packages/` is a change to what gets deployed, and a host watching only
`/apps/web/**` will silently skip it — reporting "no deployment needed"
rather than failing, which is considerably harder to notice.

Minimum watched paths:

```
apps/web/**
packages/**
scripts/**
package.json
package-lock.json
railway.json
```

## Why the images were broken, and why the worker exists

The first build of this extension had no background worker. The reader
received image URLs and loaded them with ordinary `<img>` tags, which is
simpler and does not work: nearly every manga CDN refuses a request whose
Referer is not its own site. The reader showed a column of broken pages while
the extension itself was working perfectly — 78 pages and 238 chapters
collected correctly.

Two things are needed to get a page, and only a background worker can do
both:

1. **Fetch cross-origin without CORS.** A content script cannot. Since Chrome
   85 its requests are subject to the page's CORS rules, and these CDNs send
   no `Access-Control-Allow-Origin`.
2. **Set a Referer.** `fetch` options cannot override it; it takes a
   `declarativeNetRequest` header rule.

So pages go: reader → `bridge.js` (content script on the reader page) →
background worker → fetch with the source's Referer → data URL back. One page
at a time, on demand, so a 200-page chapter never sits in memory at once.

The header rule is as narrow as the API allows — one host, our own extension
as initiator, `xmlhttprequest` only — and is removed in a `finally`, so a
failed fetch cannot leave it behind.

`tests/e2e/extension.spec.ts` loads the real extension into real Chromium and
points it at a server that behaves like those CDNs: 403 unless the Referer is
its own. It asserts the browser's own fetch fails, that the extension
succeeds, and that the server actually saw the spoofed Referer. A unit test
cannot cover this — the mechanism is Chrome's, and the thing worth proving is
that Chrome applies the rule.

### What the reader shows when a page fails

Not "broken image". The worker distinguishes a 403 refusal, a response that is
HTML rather than an image (you are signed out), an empty body, and a timeout.
The reader prints that sentence under the page number with a **Try this page
again** button, so one transient failure does not cost the whole chapter.
