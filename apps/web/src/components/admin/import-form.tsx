'use client';

import { useRef, useState } from 'react';
import { FileUp, Play, Upload } from 'lucide-react';

type Report = {
  applied: boolean;
  rows: number;
  create: number;
  update: number;
  duplicates: number;
  invalid: Array<{ index: number; reason: string; raw: string }>;
  newDomains: string[];
  created?: number;
  updated?: number;
  failed?: Array<{ domain: string; reason: string }>;
};

/**
 * Importing a file, in two deliberate steps.
 *
 * Checking first is not a nicety here. A file assembled from a forum thread
 * has typos, dead domains and three spellings of the same site in it, and the
 * difference between finding that out now and finding it out afterwards is
 * whether the fix is "press cancel" or "work out which forty listings to
 * undo".
 */
export function ImportForm() {
  const picker = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(apply: boolean) {
    if (!text.trim()) {
      setError('There is nothing to import yet.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, apply }),
      });
      const payload = (await response.json()) as Report & { error?: { message?: string } };
      if (!response.ok) {
        setError(payload.error?.message ?? 'That import did not run.');
        return;
      }
      setReport(payload);
    } catch {
      setError('That import did not run.');
    } finally {
      setBusy(false);
    }
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
      setFileName(file.name);
      setReport(null);
      setError(null);
    };
    reader.onerror = () => setError('That file could not be read.');
    reader.readAsText(file);
    if (picker.current) picker.current.value = '';
  }

  const checked = report && !report.applied;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border-2 border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={picker}
            type="file"
            accept=".json,.csv,application/json,text/csv,text/plain"
            onChange={onPick}
            className="hidden"
            id="import-file"
          />
          <label
            htmlFor="import-file"
            className="cl-touch inline-flex cursor-pointer items-center gap-2 rounded-pill bg-selected px-4 py-2.5 text-sm font-semibold text-selected-fg hover:bg-selected-hover"
          >
            <FileUp aria-hidden="true" className="h-4 w-4" />
            Choose a file
          </label>
          {fileName ? <span className="text-sm text-muted">{fileName}</span> : null}
        </div>

        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-muted">Or paste it here</span>
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setReport(null);
            }}
            rows={8}
            spellCheck={false}
            placeholder={'[\n  { "domain": "example.com", "name": "Example", "categories": ["Movies"] }\n]'}
            className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-text"
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => void send(false)}
            className="cl-touch inline-flex items-center gap-2 rounded-pill border border-line bg-bg px-4 py-2.5 text-sm font-semibold text-text hover:bg-hover disabled:opacity-60"
          >
            <Play aria-hidden="true" className="h-4 w-4" />
            {busy ? 'Checking…' : 'Check it first'}
          </button>

          <button
            type="button"
            disabled={busy || !checked}
            onClick={() => void send(true)}
            title={checked ? undefined : 'Check the file first'}
            className="cl-touch inline-flex items-center gap-2 rounded-pill bg-selected px-4 py-2.5 text-sm font-semibold text-selected-fg hover:bg-selected-hover disabled:opacity-50"
          >
            <Upload aria-hidden="true" className="h-4 w-4" />
            Import {checked ? `${report.create + report.update} ${report.create + report.update === 1 ? 'row' : 'rows'}` : ''}
          </button>
        </div>

        {error ? (
          <p role="alert" className="m-0 mt-3 text-sm text-accent">
            {error}
          </p>
        ) : null}
      </div>

      {report ? <ImportReport report={report} /> : null}
    </div>
  );
}

function ImportReport({ report }: { report: Report }) {
  return (
    <div className="rounded-card border-2 border-line bg-surface p-4">
      <h2 className="m-0 text-lg font-semibold">
        {report.applied ? 'Imported' : 'What this would do'}
      </h2>

      <dl className="m-0 mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label={report.applied ? 'Added' : 'New listings'} value={report.applied ? (report.created ?? 0) : report.create} />
        <Figure label="Updated" value={report.applied ? (report.updated ?? 0) : report.update} />
        <Figure label="Repeats in the file" value={report.duplicates} />
        <Figure label="Rejected" value={report.invalid.length} tone={report.invalid.length > 0 ? 'bad' : undefined} />
      </dl>

      {report.applied ? (
        <p className="m-0 mt-3 rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-sm text-warn-text">
          Everything new is hidden until you publish it. Open Sources to look through them.
        </p>
      ) : null}

      {!report.applied && report.newDomains.length > 0 ? (
        <div className="mt-3">
          <p className="m-0 text-sm text-muted">Would be added:</p>
          <p className="m-0 mt-1 break-words text-sm text-text">
            {report.newDomains.join(', ')}
            {report.create > report.newDomains.length
              ? ` …and ${report.create - report.newDomains.length} more`
              : ''}
          </p>
        </div>
      ) : null}

      {report.invalid.length > 0 ? (
        <div className="mt-4">
          <p className="m-0 text-sm font-semibold text-danger-text">
            Rejected rows &mdash; these are skipped, the rest still import
          </p>
          <ul className="m-0 mt-2 list-none space-y-2 p-0">
            {report.invalid.slice(0, 50).map((row) => (
              <li key={`${row.index}-${row.reason}`} className="rounded-lg border border-line bg-bg p-2.5">
                <p className="m-0 text-sm text-danger-text">
                  Row {row.index + 1}: {row.reason}
                </p>
                <p className="m-0 mt-1 break-all text-xs text-muted">{row.raw}</p>
              </li>
            ))}
          </ul>
          {report.invalid.length > 50 ? (
            <p className="m-0 mt-2 text-sm text-muted">
              …and {report.invalid.length - 50} more.
            </p>
          ) : null}
        </div>
      ) : null}

      {report.failed && report.failed.length > 0 ? (
        <div className="mt-4">
          <p className="m-0 text-sm font-semibold text-danger-text">Could not be written</p>
          <ul className="m-0 mt-2 list-none space-y-1 p-0 text-sm text-muted">
            {report.failed.map((row) => (
              <li key={row.domain}>
                {row.domain} &mdash; {row.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border border-line bg-bg p-3">
      <dt className="m-0 text-xs text-muted">{label}</dt>
      <dd
        className={`m-0 mt-0.5 text-2xl font-bold tabular-nums ${
          tone === 'bad' && value > 0 ? 'text-danger-text' : 'text-text'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
