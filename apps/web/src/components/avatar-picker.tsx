'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { ICON_MAX_BYTES, ICON_MIME_TYPES } from '@couchlist/shared';
import { Avatar } from './ui/avatar';

/**
 * Chooses the signed-in account's profile picture.
 *
 * Unlike the suggestion form's icon picker, this one uploads straight away:
 * there is no surrounding form to submit it with, and a picture is a small
 * self-contained change the person expects to see take effect.
 *
 * Size and type are checked here for an immediate answer, but the server
 * checks again against the file's own leading bytes. What a browser says
 * about a file proves nothing, and this control is not what stands between
 * an upload and the database.
 */
export function AvatarPicker({
  userId,
  displayName,
  hasAvatar,
}: {
  userId: string;
  displayName: string | null;
  hasAvatar: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);

  const showing = hasAvatar && !removed;

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ICON_MIME_TYPES.includes(file.type as (typeof ICON_MIME_TYPES)[number])) {
      setError('Use a PNG, JPEG or WebP image. SVG files are not accepted.');
      if (input.current) input.current.value = '';
      return;
    }
    if (file.size > ICON_MAX_BYTES) {
      setError(
        `That image is ${Math.round(file.size / 1024)} KB. The limit is ${Math.floor(ICON_MAX_BYTES / 1024)} KB.`,
      );
      if (input.current) input.current.value = '';
      return;
    }

    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('That file could not be read.'));
      reader.readAsDataURL(file);
    }).catch((readError: Error) => {
      setError(readError.message);
      return null;
    });
    if (!image) return;

    setBusy(true);
    const response = await fetch('/api/account/avatar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ image }),
    });
    setBusy(false);
    if (input.current) input.current.value = '';

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(body?.error?.message ?? 'That picture could not be saved.');
      return;
    }

    setPreview(image);
    setRemoved(false);
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    const response = await fetch('/api/account/avatar', { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) {
      setError('That picture could not be removed.');
      return;
    }
    setPreview(null);
    setRemoved(true);
    router.refresh();
  }

  return (
    <div>
      <p className="m-0 mb-2 text-sm text-muted">
        Shown beside your name on contributions you choose to credit. PNG, JPEG or WebP, up to{' '}
        {Math.floor(ICON_MAX_BYTES / 1024)} KB.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {preview ? (
          <span className="inline-grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-category-line bg-category-bg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="h-full w-full object-cover" />
          </span>
        ) : (
          <Avatar
            userId={userId}
            displayName={displayName}
            hasAvatar={showing}
            size="lg"
          />
        )}

        <input
          ref={input}
          type="file"
          accept={ICON_MIME_TYPES.join(',')}
          onChange={onPick}
          className="sr-only"
          id="avatar-file"
        />
        <label
          htmlFor="avatar-file"
          className="cl-touch inline-flex cursor-pointer items-center gap-2 rounded-pill border border-line bg-bg px-3.5 py-2 text-sm font-semibold text-text hover:bg-hover"
        >
          <ImagePlus className="h-4 w-4" aria-hidden="true" />
          {showing || preview ? 'Change picture' : 'Choose a picture'}
        </label>

        {showing || preview ? (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="cl-touch rounded-pill border border-line bg-bg px-3.5 py-2 text-sm text-muted hover:bg-hover hover:text-text disabled:opacity-60"
          >
            Remove
          </button>
        ) : null}

        {busy ? <span className="text-sm text-muted">Saving…</span> : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="m-0 mt-2.5 rounded-field border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm text-warn-text"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
