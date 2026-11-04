# Test sheet for the tools

Paste these in, never open them. Several are live phishing hosts taken from
the blocklists this site already holds; the point is that the checker
recognises them, not that anybody visits.

Expected outcomes are what the tool *should* say. If one disagrees, that is a
bug worth reporting rather than a site that has changed.

---

## Check a link

### Red — flagged by Google Safe Browsing

Google's own test URLs. They are **path-specific**: paste the whole address,
because the bare domain is deliberately not flagged and will look like a
broken key.

    http://testsafebrowsing.appspot.com/apiv4/ANY_PLATFORM/MALWARE/URL/
    http://testsafebrowsing.appspot.com/apiv4/ANY_PLATFORM/SOCIAL_ENGINEERING/URL/
    http://testsafebrowsing.appspot.com/apiv4/ANY_PLATFORM/UNWANTED_SOFTWARE/URL/
    http://malware.testing.google.test/testing/malware/

→ **Flagged as dangerous**, Google Safe Browsing in red.

### Red — on the phishing blocklist

    empowergrrowth.com
    agdr-certificacion.com
    iwalletbrowsers.com
    com-tracking-helpzq.cc
    bybitcnapp.com
    cloudeadmin.com

→ **Flagged as dangerous**, Phishing.Database in red.

Lists change weekly, so one of these may drop off. Pull fresh ones any time:

```sql
select domain from blocked_domains where list = 'Phishing.Database'
order by random() limit 10;
```

### Grey — on ad and tracker lists only

    doubleclick.net
    google-analytics.com
    s1184.t.eloqua.com
    vap3sfo1.lijit.com
    allstate.sc.omtrdc.net

→ **Not listed**, with StevenBlack hosts as a grey row reading "On ad and
tracker lists · common, not dangerous". It must **not** go red. If it does,
the ad lists are being treated as danger and the tool will cry wolf on half
the web.

### Red — a name borrowed from something you list

Take any domain from your own Discover page and mangle it. If you list
`example.com`, try:

    example.tv.in          same name, different ending
    example.net            same name, different ending
    examp1e.com            digit standing in for a letter
    exarnple.com           rn reading as m

→ **Looks like a site we list — it is not that site**, in red, naming the real
one.

### Amber and green — your own listings

Paste real domains from Discover.

- A healthy listing → **Listed on Couchlist**, green.
- One with the heavy-ads flag → **Listed, expect heavy ads**, amber.
- One failing its link checks → **Listed, but not answering**, amber.
- One you removed → **Removed from Couchlist**, red.

### Grey — nothing known

    some-domain-nobody-has-heard-of-9471.com
    thisisnotarealsite-xyz.example

→ **Not listed**, grey, and the words "not the same as it being safe". It must
never say the site is safe.

### Refused — not an address, or a private one

    not a domain at all
    http://127.0.0.1:3000/
    http://192.168.1.1/
    http://169.254.169.254/latest/meta-data/
    http://[::1]/

→ A red message under the box. The last one is the cloud metadata endpoint:
if that ever returns a verdict instead of a refusal, stop and fix it, because
the server is willing to look inside its own network.

### Shapes that should still work

    HTTPS://Example.COM/Some/Path?x=1    uppercase, scheme, path and query
    www.example.com                      www stripped
    example.com.                         trailing dot
    example.co.uk                        two-part public suffix
    xn--80ak6aa92e.com                   punycode → warns about the script

---

## Fix subtitles

Make a file with this in it and save it as `test.srt`:

    1
    00:00:20,000 --> 00:00:24,400
    Subtitles by someone

    2
    00:00:24,600 --> 00:00:27,800
    Good morning.

→ **1 line ready**, 1 advert line removed, the dialogue kept. Drag the slider
and watch the first timecode move with it. Download it and check the file
opens in VLC.

Then try a real track from a film you have, with the player running: nudge
until the words land with the mouths.

Also worth trying:

- a `.vtt` and an `.ass` — both should read, and convert to `.srt`
- a subtitle file in Russian or Japanese saved as something other than UTF-8
  → it should notice and offer to re-read it
- a file that is not a subtitle at all → **Nothing readable in that file**

## Make a .cbz

Drop a folder of chapter images in. Expect:

- sorted the way a person would expect — `page2` before `page10`
- a `chapter.cbz` that opens in any comic reader, pages in order
- a very tall webtoon strip marked **long strip**, cut into pages on the gaps
  between panels rather than through them
- dropping a `.txt` → refused with a message

Open the finished file in a real reader. That is the only test that counts.

## Download safety check

| Paste this | Expect |
|---|---|
| `Episode.01.1080p.mp4.exe` | **Do not open this** — pretends to be .mp4 |
| `invoice‮gpj.exe` | **Do not open this** — hidden text-direction character |
| `Show.S01E04.1080p.WEB-DL.x264.mkv` | **Looks like what it says** |
| `chapter-12.cbz` | **Looks like what it says** |
| `chapter-12.zip` | Archive note — fine, but it hides its contents |
| `setup.exe` | Worth a closer look — runs a program |
| `movie.tar.gz.exe` | Several extensions stacked up |
| `README` | No extension |

Then drop in a real file. Rename an `.mkv` to `.mp4` — the name check passes
and the byte check catches it.

---

## Ad blocker check

Run it with your blocker on → both tests blocked, green.

Turn the blocker off, or open a private window where it is disabled, and run
again → both not blocked, red. Anything in between is amber.

---

## Live status

With the weekly job never run, every source reads **not checked yet** and the
counts show it. That is correct, not a bug: unchecked is its own state and is
never counted as working.

After the job runs, down sources sort to the top.
