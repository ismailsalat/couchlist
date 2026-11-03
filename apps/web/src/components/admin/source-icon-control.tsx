'use client';

import { useRef, useState } from 'react';
import { Download, ImagePlus, Trash2 } from 'lucide-react';
import { ICON_MAX_BYTES, ICON_MIME_TYPES, PREVIEW_MAX_BYTES } from '@couchlist/shared';

/**
 * The icon on a listing, from a moderator's side.
 *
 * Three ways to get one: upload a file, ask the site for its own, or remove
 * what is there. Fetching is the one that matters when fifty listings arrive
 * from an import at once, because nobody hand-picks fifty icons and a
 * directory of grey squares is the result.
 *
 * The preview updates by cache-busting the icon URL rather than by holding
 * bytes in the browser, so what you see afterwards is what the server
 * actually stored.
 */
export function SourceIconControl({
  sourceId,
  hasIcon,
  kind = 'icon',
}: {
  sourceId: string;
  hasIcon: boolean;
  /** The small square beside the name, or the picture of the whole site. */
  kind?: 'icon' | 'preview';
}) {
  const isPreview = kind === 'preview';
  const endpoint = isPreview
    ? `/api/admin/sources/${sourceId}/preview`
    : `/api/admin/sources/${sourceId}/icon`;
  const publicUrl = isPreview
    ? `/api/sources/${sourceId}/preview`
    : `/api/sources/${sourceId}/icon`;
  const maxBytes = isPreview ? PREVIEW_MAX_BYTES : ICON_MAX_BYTES;
  const field = isPreview ? 'image' : 'icon';
  const input = useRef<HTMLInputElement>(null);
  const [present, setPresent] = useState(hasIcon);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function send(body: unknown, workingNote: string) {
    setBusy(true);
    setError(null);
    setNote(workingNote);
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: { message?: string }; from?: string };
      if (!response.ok) {
        setError(payload.error?.message ?? 'That did not work.');
        setNote(null);
        return;
      }
      setPresent(true);
      setVersion((value) => value + 1);
      setNote(payload.from ? `Taken from ${payload.from}` : 'Icon saved.');
    } catch {
      setError('That did not work.');
      setNote(null);
    } finally {
      setBusy(false);
    }
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Checked here for an immediate answer, and again on the server against
    // the file's own leading bytes, which is the check that counts.
    if (!ICON_MIME_TYPES.includes(file.type as (typeof ICON_MIME_TYPES)[number])) {
      setError('Use a PNG, JPEG or WebP image. SVG files are not accepted.');
      return;
    }
    if (file.size > maxBytes) {
      setError(
        `That image is ${Math.round(file.size / 1024)} KB. The limit is ${Math.floor(maxBytes / 1024)} KB.`,
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => void send({ [field]: String(reader.result) }, 'Uploading…');
    reader.onerror = () => setError('That file could not be read.');
    reader.readAsDataURL(file);
    if (input.current) input.current.value = '';
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      if (!response.ok) {
        setError('That did not work.');
        return;
      }
      setPresent(false);
      setNote('Icon removed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:col-span-2">
      <span className="mb-1 block text-sm text-muted">
        {isPreview ? 'Preview picture' : 'Icon'}
      </span>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-grid shrink-0 place-items-center overflow-hidden border-2 border-category-line bg-category-bg ${
            isPreview ? 'h-20 w-36 rounded-lg' : 'h-12 w-12 rounded-[14px]'
          }`}
        >
          {present ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={`${publicUrl}?v=${version}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <ImagePlus aria-hidden="true" className="h-5 w-5 text-muted" />
          )}
        </span>

        <input
          ref={input}
          type="file"
          accept={ICON_MIME_TYPES.join(',')}
          onChange={onPick}
          className="hidden"
          id={`${kind}-${sourceId}`}
        />
        <label
          htmlFor={`${kind}-${sourceId}`}
          className="cl-touch inline-flex cursor-pointer items-center gap-2 rounded-pill border border-line bg-surface px-3 py-2 text-sm text-text hover:bg-hover"
        >
          <ImagePlus aria-hidden="true" className="h-4 w-4" />
          {present ? 'Replace' : 'Upload'}
        </label>

        <button
          type="button"
          disabled={busy}
          onClick={() => void send({ fetchFromSite: true }, 'Asking the site…')}
          title={
            isPreview
              ? "Uses the share picture the site publishes in its own HTML. Not a screenshot."
              : undefined
          }
          className="cl-touch inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-2 text-sm text-text hover:bg-hover disabled:opacity-60"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Fetch from site
        </button>

        {present ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="cl-touch inline-flex items-center gap-2 rounded-pill border border-danger-line bg-danger-bg px-3 py-2 text-sm text-danger-text hover:opacity-90 disabled:opacity-60"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Remove
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="m-0 mt-2 text-sm text-accent">
          {error}
        </p>
      ) : null}
      {note && !error ? (
        <p role="status" className="m-0 mt-2 break-all text-xs text-muted">
          {note}
        </p>
      ) : null}
    </div>
  );
}
