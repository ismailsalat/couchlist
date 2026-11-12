'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  spreadGroups,
  groupOfPage,
  classifyReaderLinks,
  type ClassifiedLinks,
  type ReaderSettings,
} from '@couchlist/shared';
import { useReaderSettings } from '@/lib/tools/use-reader-settings';
import { ReaderSettingsPanel } from './reader-settings-panel';
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

/*
 * Re-exported from the shared settings model so the component and the stored
 * settings cannot drift apart. 'horizontal' reads like a printed book turned
 * sideways; 'strip' is the long webtoon scroll.
 */
type Mode = ReaderSettings['mode'];
type Direction = ReaderSettings['direction'];

export function MangaReader() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [rejected, setRejected] = useState<Array<{ name: string; reason: string }>>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [showThumbs, setShowThumbs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [focus, setFocus] = useState(false);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  /*
   * Appearance lives in one persisted object rather than in loose useStates,
   * so a new control is one field rather than another piece of state to
   * remember to save, restore and validate.
   */
  const { settings, update, reset } = useReaderSettings();
  const { mode, direction, zoom } = settings;

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
      // Never steal a key from someone typing in the chapter list filter.
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName)) return;

      if (event.key === 'Escape') {
        if (focus) {
          setFocus(false);
          return;
        }
        setAutoScrolling(false);
        setOpenId(null);
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        setFocus((on) => !on);
        return;
      }
      if (event.key === ' ' && mode === 'strip') {
        event.preventDefault();
        setAutoScrolling((on) => !on);
        return;
      }
      if (mode === 'strip') return;

      // In a spread, one press moves a whole spread, not half of one.
      const groups = spreadGroups(total, settings);
      const step = (delta: number) =>
        setPage((current) => {
          const next = groupOfPage(current, groups) + delta;
          if (next < 0 || next >= groups.length) return current;
          return groups[next]![0]!;
        });

      const back = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      if (event.key === back || event.key === 'PageUp') step(-1);
      if (event.key === forward || event.key === 'PageDown') step(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter, mode, direction, total, settings, focus]);

  /* ---------------------------------------------------------- auto-scroll */

  /*
   * Driven by requestAnimationFrame with the real frame delta rather than a
   * fixed step per tick, so the speed means the same thing on a 60Hz and a
   * 120Hz screen. Capped at 50ms so returning to a backgrounded tab does not
   * jump the page halfway down the chapter.
   */
  useEffect(() => {
    if (!autoScrolling || mode !== 'strip' || !chapter) return;

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (last) {
        const seconds = Math.min(now - last, 50) / 1000;
        const before = window.scrollY;
        window.scrollBy(0, settings.autoScrollSpeed * seconds);
        // Stop at the end instead of grinding against the bottom forever.
        if (window.scrollY === before && before > 0) {
          setAutoScrolling(false);
          return;
        }
      }
      last = now;
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    const pause = () => {
      if (document.hidden) setAutoScrolling(false);
    };
    document.addEventListener('visibilitychange', pause);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', pause);
    };
  }, [autoScrolling, mode, chapter, settings.autoScrollSpeed]);

  /*
   * Auto-scroll is stopped where the change happens — in the mode switch and
   * in the back button — rather than in an effect watching for it. An effect
   * that calls setState synchronously runs a second render for something the
   * handler already knew, and React flags it for exactly that reason.
   */

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
        onLinkChapter={(linked) => {
          setChapters((current) => [...current, linked]);
          setOpenId(linked.id);
        }}
      />
    );
  }

  /*
   * Appearance is handed to CSS as custom properties rather than rebuilt into
   * class names, because four of these are free-moving numbers and one is a
   * colour. Tailwind cannot generate a class per value, and a filter rebuilt
   * on every slider frame would thrash the stylesheet.
   *
   * The colours are safe to interpolate because normalizeReaderSettings only
   * ever lets a plain hex literal through.
   */
  const shell: React.CSSProperties & Record<string, string> = {
    '--reader-width': `${settings.width}px`,
    '--reader-gap': `${settings.gap}px`,
    '--reader-margin': `${settings.margin}px`,
    '--reader-accent': settings.accent,
    '--reader-filter': `brightness(${settings.brightness}%) contrast(${settings.contrast}%)`,
    ...(settings.theme === 'custom' ? { '--reader-bg': settings.background } : {}),
  };

  return (
    <div
      data-reader-theme={settings.theme}
      style={shell}
      className={`cl-reader rounded-2xl border border-line bg-[var(--reader-bg)] ${
        focus ? 'cl-reader-focus' : ''
      }`}
    >
      <ReaderBar
        chapter={chapter}
        page={page}
        total={total}
        mode={mode}
        direction={direction}
        zoom={zoom}
        showThumbs={showThumbs}
        onBack={() => {
          setAutoScrolling(false);
          cache.clear();
          setOpenId(null);
        }}
        onMode={(next) => {
          if (next !== 'strip') setAutoScrolling(false);
          update({ mode: next });
        }}
        onDirection={(next) => update({ direction: next })}
        onZoom={(next) => update({ zoom: next })}
        focus={focus}
        onFocus={() => setFocus((on) => !on)}
        autoScrolling={autoScrolling}
        onAutoScroll={() => setAutoScrolling((on) => !on)}
        showSettings={showSettings}
        onSettings={() => setShowSettings((open) => !open)}
        onPage={setPage}
        onThumbs={() => setShowThumbs((open) => !open)}
      />

      {showSettings ? (
        <ReaderSettingsPanel
          settings={settings}
          onChange={update}
          onReset={reset}
          onClose={() => setShowSettings(false)}
        />
      ) : null}

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

      <div ref={stageRef}>
        {mode === 'strip' ? (
          <Strip chapter={chapter} total={total} cache={cache} zoom={zoom} onPage={setPage} />
        ) : mode === 'horizontal' ? (
          <Sideways
            chapter={chapter}
            total={total}
            cache={cache}
            zoom={zoom}
            direction={direction}
            onPage={setPage}
          />
        ) : (
          <Paged
            chapter={chapter}
            page={page}
            total={total}
            cache={cache}
            zoom={zoom}
            direction={direction}
            settings={settings}
            onPage={setPage}
          />
        )}
      </div>
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
  onLinkChapter,
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
  onLinkChapter: (chapter: Chapter) => void;
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

      <LinkImport onChapter={onLinkChapter} />

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
                  {/*
                    A linked chapter has no bytes on this device — the browser
                    renders each page straight from its own server — so there
                    is nothing to put in a .cbz. Hiding the button is clearer
                    than offering one that always fails.
                  */}
                  <button
                    type="button"
                    onClick={() => onExport(chapter)}
                    disabled={busy || PageCache.isRemote(chapter)}
                    title={
                      PageCache.isRemote(chapter)
                        ? 'Linked pages stay on their own server, so there is no file to save.'
                        : undefined
                    }
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
  focus,
  onFocus,
  autoScrolling,
  onAutoScroll,
  showSettings,
  onSettings,
  onPage,
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
  focus: boolean;
  onFocus: () => void;
  autoScrolling: boolean;
  onAutoScroll: () => void;
  showSettings: boolean;
  onSettings: () => void;
  onPage: (page: number) => void;
}) {
  return (
    <div className="cl-reader-bar sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface/95 p-3 backdrop-blur">
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
            { value: 'horizontal', label: 'Sideways' },
          ]}
          onChange={(value) => onMode(value as Mode)}
        />
        {mode === 'page' || mode === 'horizontal' ? (
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

        {mode === 'strip' ? (
          <button
            type="button"
            onClick={onAutoScroll}
            aria-pressed={autoScrolling}
            className={`cl-touch min-h-9 rounded-pill border px-3 text-[12.5px] font-semibold ${
              autoScrolling
                ? 'border-selected bg-selected text-selected-fg'
                : 'border-line text-muted hover:text-text'
            }`}
          >
            {autoScrolling ? 'Stop' : 'Auto-scroll'}
          </button>
        ) : null}

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

        <button
          type="button"
          onClick={onSettings}
          aria-pressed={showSettings}
          className={`cl-touch min-h-9 rounded-pill border px-3 text-[12.5px] font-semibold ${
            showSettings ? 'border-selected bg-selected text-selected-fg' : 'border-line text-muted hover:text-text'
          }`}
        >
          Customize
        </button>

        <button
          type="button"
          onClick={onFocus}
          aria-pressed={focus}
          title="Hide everything but the pages (F)"
          className={`cl-touch min-h-9 rounded-pill border px-3 text-[12.5px] font-semibold ${
            focus ? 'border-selected bg-selected text-selected-fg' : 'border-line text-muted hover:text-text'
          }`}
        >
          Focus
        </button>
      </div>

      {/*
        Full-width on its own line: a slider squeezed into the button row has
        almost no travel on a phone, which makes it useless for the one thing
        it is for — crossing a 200-page chapter quickly.
      */}
      {total > 1 ? (
        <label className="flex w-full min-w-0 items-center gap-2.5">
          <span className="sr-only">Jump to page</span>
          <input
            type="range"
            min={1}
            max={total}
            value={page + 1}
            onChange={(event) => onPage(Number(event.target.value) - 1)}
            className="w-full min-w-0 accent-[var(--reader-accent)]"
          />
          <span className="w-16 flex-none text-right text-[12px] tabular-nums text-muted">
            {page + 1}/{total}
          </span>
        </label>
      ) : null}
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
  fill,
  onVisible,
}: {
  chapter: Chapter;
  index: number;
  cache: PageCache;
  zoom: number;
  eager?: boolean;
  /** Size to the row's height rather than its width, for sideways reading. */
  fill?: boolean;
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
    <div ref={holder} className={`flex justify-center ${fill ? 'h-full' : ''}`}>
      {failed ? (
        <p className="py-10 text-[13px] text-danger-text">Page {index + 1} could not be read.</p>
      ) : url ? (
        /*
         * The brightness/contrast filter is applied to the page itself rather
         * than the whole reader, so the toolbar and controls stay legible
         * while somebody dims the art to read in the dark.
         */
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url}
          alt={`Page ${index + 1}`}
          loading="lazy"
          decoding="async"
          style={
            fill
              ? { height: '100%', width: 'auto', filter: 'var(--reader-filter)' }
              : { width: `${zoom}%`, filter: 'var(--reader-filter)' }
          }
          className={fill ? 'block max-w-none' : 'block h-auto max-w-full'}
        />
      ) : (
        <div
          className={`grid place-items-center text-[13px] text-muted ${
            fill ? 'h-full w-[60vw] max-w-[420px]' : 'h-[70vh] w-full'
          }`}
        >
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
    <div className="bg-[var(--reader-bg)]">
      <div className="cl-reader-column items-center">
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
  settings,
  onPage,
}: {
  chapter: Chapter;
  page: number;
  total: number;
  cache: PageCache;
  zoom: number;
  direction: Direction;
  settings: ReaderSettings;
  onPage: (index: number) => void;
}) {
  const groups = spreadGroups(total, settings);
  const current = groupOfPage(page, groups);
  const shown = groups[current] ?? [page];

  /*
   * Moving by group, not by page: with spreads on, a press has to advance
   * both pages or the two halves of a double-page spread drift apart.
   */
  const go = (delta: number) => {
    const next = current + delta;
    if (next < 0 || next >= groups.length) return;
    onPage(groups[next]![0]!);
  };
  // Reading right to left, the "next" page lives on the left of the screen.
  const back = () => go(-1);
  const forward = () => go(1);

  return (
    <div className="bg-[var(--reader-bg)]">
      <div className="relative cl-reader-column">
        {/*
          Right-to-left reverses which side each page of a spread sits on.
          The row is reversed rather than the image, so the art is never
          mirrored — only its placement changes.
        */}
        <div
          className={`flex items-start justify-center ${
            shown.length > 1 && direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'
          }`}
          style={{ gap: 'var(--reader-gap)' }}
        >
          {shown.map((index) => (
            <Page key={index} chapter={chapter} index={index} cache={cache} zoom={zoom} eager />
          ))}
        </div>

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

/**
 * Sideways reading: one long horizontal row, swiped or scrolled across.
 *
 * This is the shape a printed book has when you flip through it, and it suits
 * wide double-page art better than a vertical strip does. `flex-row-reverse`
 * handles right-to-left, so the pages sit in the right order without any
 * image being mirrored.
 *
 * Scroll snapping makes each page settle in place instead of stopping
 * halfway, which on a touchpad is the difference between reading and fighting.
 */
function Sideways({
  chapter,
  total,
  cache,
  zoom,
  direction,
  onPage,
}: {
  chapter: Chapter;
  total: number;
  cache: PageCache;
  zoom: number;
  direction: Direction;
  onPage: (index: number) => void;
}) {
  const indices = Array.from({ length: total }, (_, i) => i);

  return (
    <div
      className={`flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain bg-[var(--reader-bg)] ${
        direction === 'rtl' ? 'flex-row-reverse' : 'flex-row'
      }`}
      style={{ gap: 'var(--reader-gap)', padding: 'var(--reader-margin)' }}
    >
      {indices.map((index) => (
        <div
          key={index}
          className="h-[78vh] flex-none snap-center"
          onFocus={() => onPage(index)}
        >
          <Page
            chapter={chapter}
            index={index}
            cache={cache}
            zoom={zoom}
            eager={index < 3}
            fill
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Reading from pasted links.
 *
 * Tagged "under testing" on purpose. The honest limits are stated in the
 * panel rather than buried: a direct image link works because a browser will
 * load an <img> cross-origin, and a link to a chapter *page* does not,
 * because reading one means parsing another site's HTML — which the browser
 * refuses, and which Couchlist will not do on its server, since that would
 * make it a proxy for other people's comics.
 *
 * Lines that cannot be used are listed back with the reason instead of being
 * dropped, so a paste of thirty links that yields twenty pages says which ten
 * were skipped and why.
 */
function LinkImport({ onChapter }: { onChapter: (chapter: Chapter) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [assumeImage, setAssumeImage] = useState(false);
  const [result, setResult] = useState<ClassifiedLinks | null>(null);

  function read() {
    const classified = classifyReaderLinks(text, assumeImage);
    setResult(classified);
    if (classified.images.length === 0) return;

    onChapter({
      id: `link-${Date.now()}`,
      name:
        classified.images.length === 1
          ? 'Linked page'
          : `${classified.images.length} linked pages`,
      pages: classified.images.map((url) => ({ kind: 'remote' as const, url })),
      order: classified.images.map((_, index) => index),
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-line px-4 py-3 text-left text-[13px] text-muted hover:border-muted/50 hover:text-text"
      >
        <span className="font-semibold text-text">Read from a link</span>
        <span className="rounded-pill border border-[#f6ba7b]/35 bg-[#f6ba7b]/12 px-2 py-[1px] text-[11px] font-semibold text-[#f6ba7b]">
          Under testing
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label="Read from a link"
      className="mt-3 rounded-xl border border-line bg-bg/50 p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-[14px] font-bold">Read from a link</h3>
        <span className="rounded-pill border border-[#f6ba7b]/35 bg-[#f6ba7b]/12 px-2 py-[1px] text-[11px] font-semibold text-[#f6ba7b]">
          Under testing
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cl-touch cl-pill ml-auto rounded-pill border border-line px-3 py-1.5 text-[12.5px] font-semibold text-muted hover:text-text"
        >
          Close
        </button>
      </div>

      <p className="m-0 mt-2 max-w-[62ch] text-[12.5px] text-muted">
        Paste <strong className="text-text">direct image links</strong>, one per line, in reading
        order. A link to a chapter <em>page</em> cannot be read here — that needs the companion
        extension, because the page has to be opened in your own browser session.
      </p>

      <label className="mt-3 block">
        <span className="sr-only">Image links, one per line</span>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={'https://example.com/page-01.webp\nhttps://example.com/page-02.webp'}
          className="w-full min-w-0 rounded-xl border border-line bg-bg p-3 font-mono text-[12.5px] text-text placeholder:text-muted/60"
        />
      </label>

      <label className="mt-2 flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={assumeImage}
          onChange={(event) => setAssumeImage(event.target.checked)}
          className="mt-[3px] h-4 w-4 flex-none accent-[var(--reader-accent,#e4575f)]"
        />
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] font-semibold">These are all image links</span>
          <span className="text-[12px] text-muted/80">
            Tick this when the links have no .jpg or .webp on the end
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={read}
        disabled={!text.trim()}
        className="cl-touch mt-3 rounded-pill bg-selected px-4 py-2 text-[13px] font-semibold text-selected-fg disabled:opacity-50"
      >
        Read these
      </button>

      {result ? (
        <div className="mt-3 flex flex-col gap-1.5 text-[12.5px]">
          {result.images.length > 0 ? (
            <p className="m-0 text-[#8fc9c2]">
              {result.images.length} page{result.images.length === 1 ? '' : 's'} opened.
            </p>
          ) : (
            <p className="m-0 text-[#ffb0b0]">No usable image links in that list.</p>
          )}
          {result.needsExtension.length > 0 ? (
            <p className="m-0 text-[#f6ba7b]">
              {result.needsExtension.length} look like chapter pages, which need the extension.
            </p>
          ) : null}
          {result.rejected.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-muted">
                {result.rejected.length} could not be used
              </summary>
              <ul className="m-0 mt-1 list-none p-0 text-muted">
                {result.rejected.slice(0, 8).map((entry) => (
                  <li key={entry.raw} className="truncate">
                    {entry.raw} — {entry.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <p className="m-0 mt-3 text-[12px] text-muted/75">
        Linked pages are loaded straight from their own server by your browser. Couchlist never
        fetches, stores or proxies them, so they cannot be saved as a .cbz.
      </p>
    </section>
  );
}
