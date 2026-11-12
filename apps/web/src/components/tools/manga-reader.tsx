'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildCbz, pageName } from '@couchlist/shared';
import {
  PageCache,
  chapterPageCount,
  importFiles,
  loadProgress,
  pageBytes,
  saveProgress,
  type Chapter,
} from '@/lib/tools/manga-library';

/**
 * An ad-free reader for things you already have.
 *
 * Couchlist points at sites; this is for the files. Import chapters as .cbz,
 * .zip or loose images, from a computer or a phone, and read them with no
 * advertising, no account and nothing uploaded.
 *
 * Two constraints shape the whole thing:
 *
 *   - **Nothing leaves the device.** Files are read in the page. There is no
 *     endpoint to send them to, which is also why there is no size limit
 *     beyond what the machine can hold.
 *   - **Pages decode on demand.** A long import is hundreds of megabytes.
 *     Decoding every page up front freezes the tab and gets the page killed
 *     on a phone, so a small window around where you are reading is all that
 *     is ever held.
 */

type Mode = 'strip' | 'page';
type Direction = 'ltr' | 'rtl';

export function MangaReader() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [rejected, setRejected] = useState<Array<{ name: string; reason: string }>>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<Mode>('strip');
  const [direction, setDirection] = useState<Direction>('ltr');
  const [zoom, setZoom] = useState(100);
  const [showThumbs, setShowThumbs] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const cache = useMemo(() => new PageCache(), []);
  useEffect(() => () => cache.clear(), [cache]);

  const chapter = chapters.find((entry) => entry.id === openId) ?? null;
  const total = chapter ? chapterPageCount(chapter) : 0;

  /* ----------------------------------------------------------- importing */

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setBusy(true);
    try {
      const result = await importFiles(Array.from(files));
      setRejected(result.rejected);
      setChapters((current) => {
        const merged = [...current, ...result.chapters];
        merged.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        return merged;
      });
    } finally {
      setBusy(false);
    }
  }, []);

  /* ------------------------------------------------------------ progress */

  /*
   * Progress is restored when a chapter is opened, not in an effect watching
   * which chapter is open. Opening is an event and already knows which
   * chapter it means, so an effect would only be re-deriving that from state
   * and cascading a second render to do it.
   */
  const open = useCallback(
    (id: string) => {
      const target = chapters.find((entry) => entry.id === id);
      if (!target) return;
      const saved = loadProgress()[target.name] ?? 0;
      cache.clear();
      setPage(saved > 0 && saved < chapterPageCount(target) ? saved : 0);
      setOpenId(id);
    },
    [chapters, cache],
  );

  useEffect(() => {
    if (chapter && total > 0) saveProgress(chapter.name, page);
  }, [chapter, page, total]);

  /* ------------------------------------------------------------ keyboard */

  useEffect(() => {
    if (!chapter) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenId(null);
      if (mode !== 'page') return;
      const back = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      if (event.key === back) setPage((p) => Math.max(0, p - 1));
      if (event.key === forward) setPage((p) => Math.min(total - 1, p + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, mode, direction, total]);

  /* -------------------------------------------------------------- export */

  async function exportChapter(target: Chapter) {
    setBusy(true);
    try {
      const count = chapterPageCount(target);
      const pages = [];
      for (let index = 0; index < count; index += 1) {
        const bytes = await pageBytes(target, index);
        pages.push({ name: pageName(index, count, extensionOf(bytes)), bytes });
      }
      const archive = buildCbz(pages);
      const url = URL.createObjectURL(new Blob([archive as BlobPart], { type: 'application/vnd.comicbook+zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${target.name || 'chapter'}.cbz`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  function movePage(from: number, to: number) {
    if (!chapter || to < 0 || to >= total) return;
    setChapters((current) =>
      current.map((entry) => {
        if (entry.id !== chapter.id) return entry;
        const order = [...entry.order];
        const [moved] = order.splice(from, 1);
        order.splice(to, 0, moved!);
        return { ...entry, order };
      }),
    );
    cache.clear();
    setPage(to);
  }

  /* ---------------------------------------------------------------- view */

  if (!chapter) {
    return (
      <Library
        chapters={chapters}
        rejected={rejected}
        busy={busy}
        inputRef={inputRef}
        onPick={(files) => void addFiles(files)}
        onOpen={open}
        onExport={(target) => void exportChapter(target)}
        onRemove={(id) => {
          setChapters((current) => current.filter((entry) => entry.id !== id));
          cache.clear();
        }}
        onClear={() => {
          setChapters([]);
          setRejected([]);
          cache.clear();
        }}
      />
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <ReaderBar
        chapter={chapter}
        page={page}
        total={total}
        mode={mode}
        direction={direction}
        zoom={zoom}
        showThumbs={showThumbs}
        onBack={() => {
          cache.clear();
          setOpenId(null);
        }}
        onMode={setMode}
        onDirection={setDirection}
        onZoom={setZoom}
        onThumbs={() => setShowThumbs((open) => !open)}
      />

      {showThumbs ? (
        <Thumbnails
          chapter={chapter}
          cache={cache}
          current={page}
          onGo={(index) => {
            setPage(index);
            setShowThumbs(false);
          }}
          onMove={movePage}
        />
      ) : null}

      {mode === 'strip' ? (
        <Strip chapter={chapter} total={total} cache={cache} zoom={zoom} onPage={setPage} />
      ) : (
        <Paged
          chapter={chapter}
          page={page}
          total={total}
          cache={cache}
          zoom={zoom}
          direction={direction}
          onPage={setPage}
        />
      )}
    </div>
  );
}

function extensionOf(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  if (bytes[8] === 0x57 && bytes[9] === 0x45) return 'webp';
  return 'jpg';
}

/* ------------------------------------------------------------- library */

function Library({
  chapters,
  rejected,
  busy,
  inputRef,
  onPick,
  onOpen,
  onExport,
  onRemove,
  onClear,
}: {
  chapters: Chapter[];
  rejected: Array<{ name: string; reason: string }>;
  busy: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (files: FileList | File[]) => void;
  onOpen: (id: string) => void;
  onExport: (chapter: Chapter) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const progress = typeof window === 'undefined' ? {} : loadProgress();

  return (
    <div data-palette="teal" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="m-0 text-[18px] font-bold">Read manga and manhwa</h2>
      <p className="mb-4 mt-1 max-w-[62ch] text-[13.5px] text-muted">
        Bring your own chapters — .cbz, .zip or loose images — and read them with no advertising and
        no account. Nothing is uploaded; the files stay on your device and are read in this page.
      </p>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (event.dataTransfer.files?.length) onPick(event.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border border-dashed p-6 text-center text-[13.5px] transition ${
          dragging ? 'border-accent bg-hover text-text' : 'border-line text-muted'
        }`}
      >
        {busy ? (
          'Reading…'
        ) : (
          <>
            <span className="font-semibold text-text">Add chapters</span>
            <span className="mt-1 block text-[12.5px]">
              Tap to pick from your phone or computer, or drop files here
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".cbz,.zip,image/*,application/zip,application/vnd.comicbook+zip"
          className="hidden"
          onChange={(event) => {
            if (event.target.files?.length) onPick(event.target.files);
            event.target.value = '';
          }}
        />
      </div>

      {rejected.length > 0 ? (
        <ul className="m-0 mt-3 list-none p-0 text-[12.5px] text-warn-text">
          {rejected.slice(0, 5).map((entry) => (
            <li key={entry.name}>
              {entry.name} — {entry.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {chapters.length > 0 ? (
        <>
          <div className="mt-5 flex items-baseline gap-3">
            <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted/70">
              {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
            </h3>
            <button
              type="button"
              onClick={onClear}
              className="ml-auto text-[12.5px] font-semibold text-muted underline underline-offset-[3px] hover:text-text"
            >
              Remove all
            </button>
          </div>

          <ul className="m-0 mt-2 flex list-none flex-col p-0">
            {chapters.map((chapter) => {
              const count = chapterPageCount(chapter);
              const at = progress[chapter.name] ?? 0;
              return (
                <li key={chapter.id} className="flex items-center gap-3 border-t border-line py-3">
                  <button
                    type="button"
                    onClick={() => onOpen(chapter.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate text-[14px] font-semibold">{chapter.name}</span>
                    <span className="mt-0.5 block text-[12.5px] text-muted">
                      {count} {count === 1 ? 'page' : 'pages'}
                      {at > 0 && at < count - 1 ? ` · you were on page ${at + 1}` : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onExport(chapter)}
                    disabled={busy}
                    className="cl-touch min-h-9 rounded-pill border border-line px-3 text-[12.5px] font-semibold text-muted hover:text-text disabled:opacity-50"
                  >
                    Save .cbz
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(chapter.id)}
                    aria-label={`Remove ${chapter.name}`}
                    className="cl-touch min-h-9 rounded-pill border border-line px-3 text-[12.5px] text-muted hover:text-danger-text"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- chrome */

function ReaderBar({
  chapter,
  page,
  total,
  mode,
  direction,
  zoom,
  showThumbs,
  onBack,
  onMode,
  onDirection,
  onZoom,
  onThumbs,
}: {
  chapter: Chapter;
  page: number;
  total: number;
  mode: Mode;
  direction: Direction;
  zoom: number;
  showThumbs: boolean;
  onBack: () => void;
  onMode: (mode: Mode) => void;
  onDirection: (direction: Direction) => void;
  onZoom: (zoom: number) => void;
  onThumbs: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface/95 p-3 backdrop-blur">
      <button
        type="button"
        onClick={onBack}
        className="cl-touch min-h-9 rounded-pill border border-line px-3 text-[12.5px] font-semibold text-muted hover:text-text"
      >
        ← Chapters
      </button>

      <span className="min-w-0 truncate text-[13.5px] font-semibold">{chapter.name}</span>
      <span className="text-[12.5px] tabular-nums text-muted">
        {page + 1} / {total}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Segmented
          value={mode}
          options={[
            { value: 'strip', label: 'Scroll' },
            { value: 'page', label: 'Pages' },
          ]}
          onChange={(value) => onMode(value as Mode)}
        />
        {mode === 'page' ? (
          <Segmented
            value={direction}
            options={[
              { value: 'ltr', label: 'L→R' },
              { value: 'rtl', label: 'R→L' },
            ]}
            onChange={(value) => onDirection(value as Direction)}
          />
        ) : null}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onZoom(Math.max(40, zoom - 20))}
            aria-label="Zoom out"
            className="cl-touch grid h-9 w-9 place-items-center rounded-pill border border-line text-muted hover:text-text"
          >
            −
          </button>
          <span className="w-12 text-center text-[12.5px] tabular-nums text-muted">{zoom}%</span>
          <button
            type="button"
            onClick={() => onZoom(Math.min(300, zoom + 20))}
            aria-label="Zoom in"
            className="cl-touch grid h-9 w-9 place-items-center rounded-pill border border-line text-muted hover:text-text"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={onThumbs}
          aria-pressed={showThumbs}
          className={`cl-touch min-h-9 rounded-pill border px-3 text-[12.5px] font-semibold ${
            showThumbs ? 'border-selected bg-selected text-selected-fg' : 'border-line text-muted hover:text-text'
          }`}
        >
          Thumbnails
        </button>
      </div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-pill border border-line">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`cl-touch min-h-9 px-3 text-[12.5px] font-semibold ${
            value === option.value ? 'bg-selected text-selected-fg' : 'text-muted hover:text-text'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- pages */

/** One page, decoded when it is near the viewport and not before. */
function Page({
  chapter,
  index,
  cache,
  zoom,
  eager,
  onVisible,
}: {
  chapter: Chapter;
  index: number;
  cache: PageCache;
  zoom: number;
  eager?: boolean;
  onVisible?: (index: number) => void;
}) {
  const [url, setUrl] = useState<string | undefined>(() => cache.peek(chapter.id, index));
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const node = holder.current;
    if (!node) return;

    const load = () => {
      cache
        .get(chapter, index)
        .then((next) => {
          if (alive) setUrl(next);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    };

    if (eager) {
      load();
      return () => {
        alive = false;
      };
    }

    // 1.5 screens of warning, so a page is ready before it is wanted.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          load();
          if (entry.intersectionRatio > 0.5) onVisible?.(index);
        }
      },
      { rootMargin: '150% 0px', threshold: [0, 0.5] },
    );
    observer.observe(node);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [chapter, index, cache, eager, onVisible]);

  return (
    <div ref={holder} className="flex justify-center">
      {failed ? (
        <p className="py-10 text-[13px] text-danger-text">Page {index + 1} could not be read.</p>
      ) : url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt={`Page ${index + 1}`}
          loading="lazy"
          decoding="async"
          style={{ width: `${zoom}%` }}
          className="block h-auto max-w-full"
        />
      ) : (
        <div className="grid h-[70vh] w-full place-items-center text-[13px] text-muted">
          Page {index + 1}
        </div>
      )}
    </div>
  );
}

function Strip({
  chapter,
  total,
  cache,
  zoom,
  onPage,
}: {
  chapter: Chapter;
  total: number;
  cache: PageCache;
  zoom: number;
  onPage: (index: number) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1 bg-bg p-2">
      {Array.from({ length: total }, (_, index) => (
        <Page
          key={`${chapter.id}-${index}`}
          chapter={chapter}
          index={index}
          cache={cache}
          zoom={zoom}
          eager={index === 0}
          onVisible={onPage}
        />
      ))}
    </div>
  );
}

function Paged({
  chapter,
  page,
  total,
  cache,
  zoom,
  direction,
  onPage,
}: {
  chapter: Chapter;
  page: number;
  total: number;
  cache: PageCache;
  zoom: number;
  direction: Direction;
  onPage: (index: number) => void;
}) {
  // Reading right to left, the "next" page lives on the left of the screen.
  const back = () => onPage(Math.max(0, page - 1));
  const forward = () => onPage(Math.min(total - 1, page + 1));

  return (
    <div className="bg-bg">
      <div className="relative">
        <Page chapter={chapter} index={page} cache={cache} zoom={zoom} eager />

        <button
          type="button"
          onClick={direction === 'rtl' ? forward : back}
          aria-label={direction === 'rtl' ? 'Next page' : 'Previous page'}
          className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize"
        />
        <button
          type="button"
          onClick={direction === 'rtl' ? back : forward}
          aria-label={direction === 'rtl' ? 'Previous page' : 'Next page'}
          className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize"
        />
      </div>

      <div className="flex items-center gap-3 border-t border-line p-3">
        <button
          type="button"
          onClick={back}
          disabled={page === 0}
          className="cl-touch min-h-10 rounded-pill border border-line px-4 text-[13px] font-semibold text-muted disabled:opacity-40"
        >
          {direction === 'rtl' ? 'Next' : 'Previous'}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={page}
          onChange={(event) => onPage(Number(event.target.value))}
          aria-label="Page"
          className="flex-1 accent-[#cb3449]"
          style={{ direction: direction === 'rtl' ? 'rtl' : 'ltr' }}
        />
        <button
          type="button"
          onClick={forward}
          disabled={page >= total - 1}
          className="cl-touch min-h-10 rounded-pill border border-line px-4 text-[13px] font-semibold text-muted disabled:opacity-40"
        >
          {direction === 'rtl' ? 'Previous' : 'Next'}
        </button>
      </div>
    </div>
  );
}

function Thumbnails({
  chapter,
  cache,
  current,
  onGo,
  onMove,
}: {
  chapter: Chapter;
  cache: PageCache;
  current: number;
  onGo: (index: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const total = chapterPageCount(chapter);

  return (
    <div className="max-h-72 overflow-y-auto border-b border-line bg-bg p-3">
      <p className="m-0 mb-2 text-[12px] text-muted">
        Tap a page to jump to it. Use the arrows to reorder — the new order is what gets saved.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-2">
        {Array.from({ length: total }, (_, index) => (
          <div
            key={`${chapter.id}-thumb-${index}`}
            className={`rounded-lg border p-1 ${index === current ? 'border-selected' : 'border-line'}`}
          >
            <button type="button" onClick={() => onGo(index)} className="block w-full">
              <Thumb chapter={chapter} index={index} cache={cache} />
              <span className="mt-1 block text-center text-[11px] tabular-nums text-muted">
                {index + 1}
              </span>
            </button>
            <div className="mt-1 flex gap-1">
              <button
                type="button"
                onClick={() => onMove(index, index - 1)}
                disabled={index === 0}
                aria-label={`Move page ${index + 1} earlier`}
                className="flex-1 rounded border border-line py-0.5 text-[11px] text-muted disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => onMove(index, index + 1)}
                disabled={index === total - 1}
                aria-label={`Move page ${index + 1} later`}
                className="flex-1 rounded border border-line py-0.5 text-[11px] text-muted disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Thumb({ chapter, index, cache }: { chapter: Chapter; index: number; cache: PageCache }) {
  const [url, setUrl] = useState<string | undefined>(() => cache.peek(chapter.id, index));
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    const node = holder.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        cache
          .get(chapter, index)
          .then((next) => alive && setUrl(next))
          .catch(() => undefined);
      },
      { rootMargin: '200px' },
    );
    observer.observe(node);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [chapter, index, cache]);

  return (
    <div ref={holder} className="grid h-24 place-items-center overflow-hidden rounded bg-surface">
      {url ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt="" className="h-24 w-full object-cover" loading="lazy" decoding="async" />
      ) : null}
    </div>
  );
}
