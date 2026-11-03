import { Download } from 'lucide-react';
import { IMPORT_CATEGORIES, IMPORT_DESCRIPTION_MAX, IMPORT_QUALITY_MAX } from '@couchlist/shared';
import { ImportForm } from '@/components/admin/import-form';

export const dynamic = 'force-dynamic';

/**
 * Bulk import and export.
 *
 * The rules are on the page rather than in a document somewhere, because the
 * person writing the file is standing here when they need them.
 */
export default function AdminImportPage() {
  return (
    <div className="flex flex-col gap-4">
      <ImportForm />

      <section className="rounded-card border-2 border-line bg-surface p-4">
        <h2 className="m-0 text-lg font-semibold">The rules</h2>

        <p className="m-0 mt-2 text-sm text-muted">
          JSON or CSV. A listing is identified by its <strong>domain</strong>, so importing a
          corrected file fixes what is there instead of duplicating it. Fields you include
          overwrite; fields you leave out are untouched. One bad row is skipped with a reason &mdash;
          it never stops the rest.
        </p>

        <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-bg p-3 text-xs text-text">
{`[
  {
    "domain": "example.com",
    "name": "Example",
    "description": "What it is, in a line or two.",
    "categories": ["Movies", "TV"],
    "hasLotsOfAds": false,
    "requiresAccount": false,
    "qualityLabel": "1080p"
  }
]`}
        </pre>

        <h3 className="m-0 mt-4 text-sm font-semibold">Fields</h3>
        <ul className="m-0 mt-2 list-disc space-y-1.5 pl-5 text-sm text-text">
          <li>
            <code>domain</code> &mdash; the only required field. A full{' '}
            <code>homepageUrl</code> works instead; if you give both they must agree.
          </li>
          <li>
            <code>name</code> &mdash; defaults to the domain when missing.
          </li>
          <li>
            <code>description</code> &mdash; up to {IMPORT_DESCRIPTION_MAX} characters.
          </li>
          <li>
            <code>categories</code> &mdash; any of {IMPORT_CATEGORIES.join(', ')}. A list, or one
            string separated by commas, pipes or semicolons. Naming any category states{' '}
            <em>all six</em>, so an import can take a category away as well as add one.
          </li>
          <li>
            <code>hasLotsOfAds</code>, <code>requiresAccount</code> &mdash; true/false, yes/no or
            1/0.
          </li>
          <li>
            <code>shouldAvoid</code> &mdash; only with an <code>avoidReason</code>. A red banner
            with no explanation is worse than no banner.
          </li>
          <li>
            <code>qualityLabel</code> &mdash; up to {IMPORT_QUALITY_MAX} characters, such as 4K or
            HQ scans.
          </li>
        </ul>

        <h3 className="m-0 mt-4 text-sm font-semibold">What gets rejected</h3>
        <ul className="m-0 mt-2 list-disc space-y-1.5 pl-5 text-sm text-text">
          <li>Anything that is not an ordinary http or https address.</li>
          <li>Private and internal addresses, by any spelling.</li>
          <li>A category word the directory does not have.</li>
          <li>A domain that appears twice in the same file &mdash; the first one wins.</li>
        </ul>

        <p className="m-0 mt-4 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-text">
          Everything new arrives <strong>hidden</strong>. Nothing imported is public until you
          publish it, so a bad row in a long file is a chore rather than an incident.
        </p>
      </section>

      <section className="rounded-card border-2 border-line bg-surface p-4">
        <h2 className="m-0 text-lg font-semibold">Export</h2>
        <p className="m-0 mt-2 text-sm text-muted">
          Every listing, in exactly the shape above. Edit it in a spreadsheet and import it back,
          or keep it as a backup that does not depend on the database being there.
        </p>
        <a
          href="/api/admin/export"
          className="cl-touch mt-3 inline-flex items-center gap-2 rounded-pill border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-text no-underline hover:bg-hover"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Download the directory
        </a>
      </section>
    </div>
  );
}
