import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { requireUserOrLogin } from '@/lib/auth/require-page-user';
import { savedCountFor } from '@/lib/directory/page-data';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Reader extension',
  description: 'Send a chapter you already have open to your Couchlist reader.',
  robots: { index: false },
};

/**
 * The reader extension: what it is, what it cannot do, and how to install it.
 *
 * Signed-in only, which is a distribution choice rather than a security one —
 * the extension itself needs no account to work. The reader is open to
 * everyone; this page is not.
 *
 * Everything on it is deliberately plain about limits. The extension reads
 * pages a person already has open, in their own browser, with permission they
 * grant one site at a time. It is not a downloader, it does not get past
 * logins, and no source has been verified live yet.
 */
export default async function ReaderExtensionPage() {
  const user = await requireUserOrLogin('/tools/reader-extension');
  const savedCount = await savedCountFor(user);

  return (
    <>
      <SiteHeader user={user} savedCount={savedCount} active="guides" />
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6">
        <Link
          href="/guides"
          className="text-[13px] font-semibold text-muted underline underline-offset-[3px] hover:text-text"
        >
          ← All tools and guides
        </Link>

        <div data-palette="purple" className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="m-0 text-[20px] font-bold">Reader extension</h1>
            <span className="rounded-pill border border-[#f6ba7b]/35 bg-[#f6ba7b]/12 px-2 py-[2px] text-[11.5px] font-semibold text-[#f6ba7b]">
              Under testing
            </span>
          </div>

          <p className="mb-0 mt-2 max-w-[62ch] text-[13.5px] text-muted">
            Open a chapter the way you normally would, click the Couchlist button, and the pages
            open in your Couchlist reader — no advertising, your own settings, your own reading
            position. The chapter is passed between the two tabs in your browser and is never sent
            to Couchlist.
          </p>

          <a
            href="/couchlist-reader-extension.zip"
            download
            className="cl-touch mt-4 inline-flex items-center rounded-pill bg-selected px-4 py-2.5 text-[13.5px] font-semibold text-selected-fg no-underline hover:bg-selected-hover"
          >
            Download the extension
          </a>
          <p className="m-0 mt-2 text-[12px] text-muted/80">
            Chrome, Edge, Brave and Opera on desktop. Not Firefox, and not Safari or any phone
            browser — they do not support this kind of extension.
          </p>
        </div>

        <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="m-0 text-[16px] font-bold">Installing it</h2>
          <ol className="mb-0 mt-3 flex list-decimal flex-col gap-2 pl-5 text-[13.5px] text-muted">
            <li>Download the file above and unzip it somewhere you will keep it.</li>
            <li>
              Open <code className="rounded bg-bg px-1.5 py-0.5 text-[12.5px]">chrome://extensions</code>{' '}
              (or <code className="rounded bg-bg px-1.5 py-0.5 text-[12.5px]">edge://extensions</code>).
            </li>
            <li>Turn on <strong className="text-text">Developer mode</strong>, top right.</li>
            <li>
              Click <strong className="text-text">Load unpacked</strong> and choose the unzipped
              folder.
            </li>
            <li>Pin it so the button is easy to reach, then open a chapter and click it.</li>
          </ol>
          <p className="m-0 mt-3 max-w-[62ch] text-[12.5px] text-muted/80">
            Because it is installed this way rather than from the Chrome Web Store, it will not
            update itself — come back here when a new version is posted. Chrome may also remind you
            that Developer mode is on.
          </p>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="m-0 text-[16px] font-bold">What it will not do</h2>
          <ul className="mb-0 mt-3 flex list-disc flex-col gap-2 pl-5 text-[13.5px] text-muted">
            <li>
              It never asks for access to every website. You grant one site at a time, from your own
              click, and you can revoke it in Chrome whenever you like.
            </li>
            <li>
              It does not sign you in, get past a login or a paywall, or answer a CAPTCHA. If a page
              needs you to be signed in, sign in as normal and send the chapter again.
            </li>
            <li>
              It does not download anything in the background, and it does not send Couchlist the
              pages, the addresses or anything about what you read.
            </li>
            <li>
              It cannot read a chapter drawn onto a canvas, or one whose images are scrambled. It
              tells you that instead of showing a broken page.
            </li>
          </ul>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-surface p-5">
          <h2 className="m-0 text-[16px] font-bold">Which sources work</h2>
          <p className="mb-0 mt-2 max-w-[62ch] text-[13.5px] text-muted">
            Honest answer: <strong className="text-text">we do not know yet.</strong> The reading
            rules below were written against the structure these sites use, but none of them has
            been checked against the live site, so none is promised to work. That is why the whole
            thing is marked under testing.
          </p>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2 pr-3 font-semibold">Source</th>
                  <th className="py-2 pr-3 font-semibold">Reading rule</th>
                  <th className="py-2 font-semibold">Checked live</th>
                </tr>
              </thead>
              <tbody className="text-muted">
                {[
                  ['MangaKatana', 'Specific'],
                  ['ZazaManga', 'Specific'],
                  ['AsuraScans', 'Specific'],
                  ['WeebCentral', 'Specific'],
                  ['MangaFire', 'Specific'],
                  ['Anything else', 'General fallback'],
                ].map(([name, rule]) => (
                  <tr key={name} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-semibold text-text">{name}</td>
                    <td className="py-2 pr-3">{rule}</td>
                    <td className="py-2 text-[#f6ba7b]">Not yet</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="m-0 mt-3 max-w-[62ch] text-[12.5px] text-muted/80">
            When a chapter cannot be read, the reader says which part failed — the page, the images,
            or the chapter list — rather than blaming the site. If the general fallback is used, it
            warns you that the page order may be wrong.
          </p>
        </section>
      </main>
    </>
  );
}
