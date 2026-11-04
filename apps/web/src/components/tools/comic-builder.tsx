'use client';

import { useCallback, useRef, useState } from 'react';
import { buildCbz, chooseCuts, imageExtension, pageName, type ComicPage } from '@couchlist/shared';
import { SignalList, SignalRow, ToolResult } from './result';

/**
 * Build a .cbz from loose chapter images.
 *
 * Two jobs a manga or manhwa reader has constantly: a chapter that arrived as
 * fifty separate files, and a webtoon that arrived as one image eight
 * thousand pixels tall. Both end as a single file their reader opens.
 *
 * All of it happens in the page. The images never leave the machine, which is
 * both the privacy property and the only way this works without a server
 * willing to accept hundreds of megabytes of uploads.
 */

interface Loaded {
  name: string;
  bytes: Uint8Array;
  extension: string;
  /** Set for a strip tall enough to be worth cutting. */
  tall?: { width: number; height: number };
}

/** Above this ratio an image is a scrolling strip, not a page. */
const STRIP_RATIO = 2.6;
/** The height of one page cut from a strip, relative to its width. */
const PAGE_RATIO = 1.45;

export function ComicBuilder() {
  const [files, setFiles] = useState<Loaded[]>([]);
  const [split, setSplit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState<{ pages: number; bytes: number; cut: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (list: FileList) => {
    setError(null);
    setBuilt(null);

    const accepted: Loaded[] = [];
    for (const file of Array.from(list)) {
      if (!file.type.startsWith('image/')) continue;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extension = imageExtension(bytes);
      if (!extension) continue;

      const size = await measure(file);
      accepted.push({
        name: file.name,
        bytes,
        extension,
        tall: size && size.height / size.width >= STRIP_RATIO ? size : undefined,
      });
    }

    if (accepted.length === 0) {
      setError('None of those were images we can read. JPEG, PNG, WebP, AVIF and GIF all work.');
      return;
    }

    // Readers go by filename, and so does the person who named them.
    accepted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    setFiles(accepted);
  }, []);

  async function build() {
    setBusy(true);
    setError(null);
    try {
      const pages: ComicPage[] = [];
      let cut = 0;

      for (const file of files) {
        if (split && file.tall) {
          const parts = await sliceStrip(file);
          cut += parts.length - 1;
          for (const part of parts) pages.push({ name: 'pending', bytes: part });
        } else {
          pages.push({ name: 'pending', bytes: file.bytes });
        }
      }

      // Named once the final count is known, so the padding is right.
      const named = pages.map((page, index) => ({
        bytes: page.bytes,
        name: pageName(index, pages.length, extensionFor(page.bytes)),
      }));

      const archive = buildCbz(named);
      download(archive);
      setBuilt({ pages: named.length, bytes: archive.length, cut });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  function download(archive: Uint8Array) {
    const blob = new Blob([archive as BlobPart], { type: 'application/vnd.comicbook+zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'chapter.cbz';
    link.click();
    URL.revokeObjectURL(url);
  }

  const strips = files.filter((file) => file.tall).length;

  return (
    <div data-palette="teal" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="m-0 text-[18px] font-bold">Make a .cbz</h2>
      <p className="mb-4 mt-1 max-w-[62ch] text-[13.5px] text-muted">
        Drop a chapter&apos;s images in and get one file your reader opens, with the pages in the
        right order. Long webtoon strips get cut into readable pages. Nothing is uploaded.
      </p>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files?.length) void load(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-xl border border-dashed border-line p-6 text-center text-[13.5px] text-muted hover:border-accent hover:text-text"
      >
        {files.length > 0 ? (
          <>
            <span className="font-semibold text-text">{files.length} images</span>
            <span className="mt-1 block text-[12.5px]">Drop more to start again</span>
          </>
        ) : (
          'Drop the chapter images here, or click to pick them'
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) void load(event.target.files);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13.5px] text-danger-text">
          {error}
        </p>
      ) : null}

      {files.length > 0 ? (
        <>
          <ul className="mt-4 flex max-h-44 list-none flex-col overflow-y-auto p-0">
            {files.slice(0, 40).map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 border-t border-line py-2 text-[13px] first:border-t-0"
              >
                <span className="w-9 flex-none tabular-nums text-muted/70">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                {file.tall ? (
                  <span className="flex-none rounded-pill border border-pal-line px-2 py-[2px] text-[11px] text-pal-text">
                    long strip
                  </span>
                ) : null}
              </li>
            ))}
            {files.length > 40 ? (
              <li className="border-t border-line py-2 text-[12.5px] text-muted">
                and {files.length - 40} more
              </li>
            ) : null}
          </ul>

          {strips > 0 ? (
            <label className="mt-4 flex items-start gap-2.5 text-[13.5px]">
              <input
                type="checkbox"
                checked={split}
                onChange={(event) => setSplit(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#cb3449]"
              />
              <span>
                Cut the {strips === 1 ? 'long strip' : `${strips} long strips`} into pages
                <span className="block text-[12.5px] text-muted">
                  Cuts on gaps between panels where it can, so a speech bubble is not sliced in half.
                </span>
              </span>
            </label>
          ) : null}

          <button
            type="button"
            onClick={build}
            disabled={busy}
            className="cl-touch mt-4 min-h-12 w-full rounded-xl bg-selected text-[15px] font-bold text-selected-fg hover:bg-selected-hover disabled:opacity-50"
          >
            {busy ? 'Building…' : 'Build the .cbz'}
          </button>
        </>
      ) : null}

      {built ? (
        <ToolResult
          tone="good"
          title="Your chapter is downloading"
          footer={
            <SignalList label="What went in">
              <SignalRow tone="good" name="Pages" detail={String(built.pages)} />
              <SignalRow
                tone={built.cut > 0 ? 'good' : 'off'}
                name="Strips cut"
                detail={built.cut > 0 ? `${built.cut} extra pages` : 'None needed'}
              />
              <SignalRow
                tone="good"
                name="File size"
                detail={`${(built.bytes / 1_048_576).toFixed(1)} MB`}
              />
            </SignalList>
          }
        >
          <p className="m-0">
            Saved as <strong className="text-pal-text">chapter.cbz</strong>. Rename it to the chapter
            and open it in any comic reader.
          </p>
        </ToolResult>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- image work */

function extensionFor(bytes: Uint8Array): string {
  return imageExtension(bytes) ?? 'jpg';
}

function measure(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

/**
 * Cut a long strip into pages.
 *
 * Finds the rows that are nearly one flat colour — the gutters between panels —
 * and prefers those as cut points, so a page break lands in a gap rather than
 * through somebody's face.
 */
async function sliceStrip(file: Loaded): Promise<Uint8Array[]> {
  const blob = new Blob([file.bytes as BlobPart]);
  const bitmap = await createImageBitmap(blob);

  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return [file.bytes];
  context.drawImage(bitmap, 0, 0);

  const gutters = findGutters(context, bitmap.width, bitmap.height);
  const target = Math.round(bitmap.width * PAGE_RATIO);
  const cuts = chooseCuts(bitmap.height, target, gutters);
  if (cuts.length === 0) {
    bitmap.close();
    return [file.bytes];
  }

  const boundaries = [0, ...cuts, bitmap.height];
  const parts: Uint8Array[] = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const top = boundaries[index]!;
    const height = boundaries[index + 1]! - top;

    const page = document.createElement('canvas');
    page.width = bitmap.width;
    page.height = height;
    page.getContext('2d')?.drawImage(bitmap, 0, top, bitmap.width, height, 0, 0, bitmap.width, height);

    const encoded = await new Promise<Blob | null>((resolve) =>
      page.toBlob(resolve, 'image/jpeg', 0.92),
    );
    if (encoded) parts.push(new Uint8Array(await encoded.arrayBuffer()));
  }

  bitmap.close();
  return parts.length > 0 ? parts : [file.bytes];
}

/** Rows that are close to a single flat colour, sampled rather than exhaustive. */
function findGutters(context: CanvasRenderingContext2D, width: number, height: number): number[] {
  const step = 4;
  const sampleWidth = Math.min(width, 160);
  const gutters: number[] = [];

  for (let y = 0; y < height; y += step) {
    const row = context.getImageData(0, y, sampleWidth, 1).data;
    const first = [row[0]!, row[1]!, row[2]!];
    let flat = true;

    for (let x = 4; x < row.length; x += 16) {
      if (
        Math.abs(row[x]! - first[0]!) > 12 ||
        Math.abs(row[x + 1]! - first[1]!) > 12 ||
        Math.abs(row[x + 2]! - first[2]!) > 12
      ) {
        flat = false;
        break;
      }
    }
    if (flat) gutters.push(y);
  }

  return gutters;
}
