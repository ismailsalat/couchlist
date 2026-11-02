'use client';

import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { ICON_MAX_BYTES, ICON_MIME_TYPES } from '@couchlist/shared';

/**
 * Picks the site's icon for a suggestion.
 *
 * Checks size and type in the browser so the answer is immediate, but the
 * server checks again against the file's own magic bytes — what a browser
 * reports about a file proves nothing, and this control is not the one
 * standing between an upload and the database.
 *
 * The chosen file is read to a data URL and posted with the rest of the form,
 * so there is no half-finished upload to clean up if the form is abandoned.
 */
export function IconPicker({ name = 'icon' }: { name?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function clear() {
    setPreview(null);
    setFileName(null);
    setError(null);
    if (input.current) input.current.value = '';
  }

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return clear();

    setError(null);

    if (!ICON_MIME_TYPES.includes(file.type as (typeof ICON_MIME_TYPES)[number])) {
      setError('Use a PNG, JPEG or WebP image. SVG files are not accepted.');
      clear();
      return;
    }
    if (file.size > ICON_MAX_BYTES) {
      setError(`That image is ${Math.round(file.size / 1024)} KB. The limit is ${Math.floor(ICON_MAX_BYTES / 1024)} KB.`);
      clear();
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setError('That file could not be read.');
      clear();
    };
    reader.onload = () => {
      setPreview(typeof reader.result === 'string' ? reader.result : null);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }

  return (
    <fieldset className="m-0 rounded-card border-2 border-line bg-surface p-4">
      <legend className="px-1 text-sm font-bold text-text">
        Site icon <span className="font-normal text-muted">optional</span>
      </legend>
      <p className="m-0 mb-3 text-sm text-muted">
        A small square image of the site&apos;s logo makes it easy to spot in the list. PNG, JPEG
        or WebP, up to {Math.floor(ICON_MAX_BYTES / 1024)} KB.
      </p>

      {/* Carried with the form body, so there is no orphaned upload. */}
      <input type="hidden" name={name} value={preview ?? ''} />

      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden="true"
          className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border-2 border-line bg-bg text-muted"
        >
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-5 w-5" />
          )}
        </span>

        <label className="cl-touch inline-flex cursor-pointer items-center rounded-pill border-2 border-line bg-active px-3.5 py-2 text-sm font-semibold text-text hover:bg-hover">
          {preview ? 'Choose a different image' : 'Choose an image'}
          <input
            ref={input}
            type="file"
            accept={ICON_MIME_TYPES.join(',')}
            onChange={onPick}
            className="sr-only"
          />
        </label>

        {preview ? (
          <button
            type="button"
            onClick={clear}
            className="cl-touch inline-flex items-center gap-1 rounded-pill px-2.5 py-2 text-sm text-muted hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Remove
          </button>
        ) : null}
      </div>

      {fileName ? (
        <p className="m-0 mt-2 truncate text-xs text-muted">{fileName}</p>
      ) : null}
      {error ? (
        <p role="alert" className="m-0 mt-2 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
