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
