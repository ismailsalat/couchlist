'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FRAMERATE_FIXES,
  TEXT_ENCODINGS,
  formatTimecode,
  garbledScore,
  parseSubtitles,
  removeAdverts,
  scale,
  serialise,
  shift,
  type Cue,
  type SubtitleFormat,
} from '@couchlist/shared';
import { SignalList, SignalRow, ToolResult } from './result';

/**
 * Fix subtitles that are out of sync.
 *
 * Everything happens in the page. The file is read as bytes so a track saved
 * in another encoding can be re-read correctly, which is the only way to
 * repair the mojibake you get from a Cyrillic or Japanese file opened as
 * UTF-8 — by then the browser has already destroyed the characters.
 */

const FORMATS: ReadonlyArray<{ value: SubtitleFormat; label: string }> = [
  { value: 'srt', label: '.srt' },
  { value: 'vtt', label: '.vtt' },
  { value: 'ass', label: '.ass' },
];

export function SubtitleFixer() {
  const [raw, setRaw] = useState<ArrayBuffer | null>(null);
  const [filename, setFilename] = useState('');
  const [encoding, setEncoding] = useState('utf-8');
  const [offsetMs, setOffsetMs] = useState(0);
  const [factor, setFactor] = useState(1);
  const [strip, setStrip] = useState(true);
  const [output, setOutput] = useState<SubtitleFormat>('srt');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const text = useMemo(() => {
    if (!raw) return '';
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(raw);
    } catch {
      return new TextDecoder('utf-8').decode(raw);
    }
  }, [raw, encoding]);

  const parsed = useMemo(() => (text ? parseSubtitles(text) : null), [text]);

  /** The encoding the text looks least broken in, offered as a hint. */
  const suggestion = useMemo(() => {
    if (!raw) return null;
    const current = garbledScore(text);
    if (current < 0.04) return null;

    let best: { encoding: string; label: string; score: number } | null = null;
    for (const option of TEXT_ENCODINGS) {
      try {
        const score = garbledScore(new TextDecoder(option.encoding).decode(raw));
        if (!best || score < best.score) best = { ...option, score };
      } catch {
        /* the browser does not have to support every encoding */
      }
    }
    return best && best.encoding !== encoding && best.score < current * 0.6 ? best : null;
  }, [raw, text, encoding]);

  const result = useMemo(() => {
    if (!parsed) return null;
    let cues: Cue[] = parsed.cues;
    let removed = 0;
    if (strip) ({ cues, removed } = removeAdverts(cues));
    if (factor !== 1) cues = scale(cues, factor);
    if (offsetMs !== 0) cues = shift(cues, offsetMs);
    return { cues, removed };
  }, [parsed, strip, factor, offsetMs]);

  const load = useCallback(async (file: File) => {
    setError(null);
    if (file.size > 8 * 1024 * 1024) {
      setError('That file is far larger than any subtitle track. Is it the right one?');
      return;
    }
    setFilename(file.name);
    setRaw(await file.arrayBuffer());
    setOffsetMs(0);
    setFactor(1);
  }, []);

  function download() {
    if (!result) return;
    const body = serialise(result.cues, output);
    const base = filename.replace(/\.[^.]+$/u, '') || 'subtitles';
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${base}.fixed.${output}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div data-palette="pink" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="m-0 text-[18px] font-bold">Fix subtitles</h2>
      <p className="mb-4 mt-1 max-w-[62ch] text-[13.5px] text-muted">
        Subtitles a few seconds out? Nudge them until they match. It also converts between formats
        and strips the advert lines rippers bake in. Nothing is uploaded.
      </p>

      <div
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files?.[0];
          if (file) void load(file);
        }}
        onClick={() => inputRef.current?.click()}
        className="cursor-pointer rounded-xl border border-dashed border-line p-5 text-center text-[13.5px] text-muted hover:border-accent hover:text-text"
      >
        {filename ? (
          <>
            <span className="font-semibold text-text">{filename}</span>
            <span className="mt-1 block text-[12.5px]">Drop another to replace it</span>
          </>
        ) : (
          'Drop a .srt, .vtt or .ass here, or click to pick one'
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".srt,.vtt,.ass,.ssa,text/plain"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void load(file);
          }}
        />
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-[13.5px] text-danger-text">
          {error}
        </p>
      ) : null}

      {parsed && result ? (
        <>
          {suggestion ? (
            <div className="mt-4 rounded-xl border border-warn-line bg-warn-bg p-3.5">
              <p className="m-0 text-[13.5px] text-warn-text">
                This looks garbled. It was probably saved as {suggestion.label}.
              </p>
              <button
                type="button"
                onClick={() => setEncoding(suggestion.encoding)}
                className="cl-touch mt-2 min-h-9 rounded-pill border border-warn-line px-3.5 text-[12.5px] font-semibold text-warn-text"
              >
                Read it as {suggestion.label}
              </button>
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-4">
            <label className="block">
              <span className="flex items-baseline justify-between text-[13.5px] font-semibold">
                Timing
                <span className="tabular-nums text-muted">
                  {offsetMs === 0 ? 'unchanged' : `${offsetMs > 0 ? '+' : ''}${(offsetMs / 1000).toFixed(1)}s`}
                </span>
              </span>
              <input
                type="range"
                min={-30000}
                max={30000}
                step={100}
                value={offsetMs}
                onChange={(event) => setOffsetMs(Number(event.target.value))}
                className="mt-2 w-full accent-[#cb3449]"
              />
              <span className="mt-1 block text-[12.5px] text-muted">
                Drag left if the subtitles arrive too late, right if too early.
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              {[-1000, -100, 100, 1000].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => setOffsetMs((current) => current + step)}
                  className="cl-touch min-h-9 rounded-pill border border-line px-3 text-[12.5px] font-semibold text-muted hover:text-text"
                >
                  {step > 0 ? '+' : ''}
                  {step / 1000}s
                </button>
              ))}
              <button
                type="button"
                onClick={() => setOffsetMs(0)}
                className="cl-touch min-h-9 rounded-pill border border-line px-3 text-[12.5px] font-semibold text-muted hover:text-text"
              >
                Reset
              </button>
            </div>

            <label className="block text-[13.5px]">
              <span className="font-semibold">Drifts further out as it goes?</span>
              <select
                value={factor}
                onChange={(event) => setFactor(Number(event.target.value))}
                className="mt-1.5 block min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-[13.5px] text-text"
              >
                <option value={1}>No, the timing is steady</option>
                {FRAMERATE_FIXES.map((fix) => (
                  <option key={fix.label} value={fix.factor}>
                    {fix.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-start gap-2.5 text-[13.5px]">
              <input
                type="checkbox"
                checked={strip}
                onChange={(event) => setStrip(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#cb3449]"
              />
              <span>
                Remove advert lines
                <span className="block text-[12.5px] text-muted">
                  The &ldquo;subtitles by&rdquo; and website credits, not dialogue.
                </span>
              </span>
            </label>

            <label className="block text-[13.5px]">
              <span className="font-semibold">Save as</span>
              <div className="mt-1.5 flex gap-2">
                {FORMATS.map((format) => (
                  <button
                    key={format.value}
                    type="button"
                    onClick={() => setOutput(format.value)}
                    className={`cl-touch min-h-10 flex-1 rounded-xl border px-3 text-[13.5px] font-semibold ${
                      output === format.value
                        ? 'border-selected bg-selected text-selected-fg'
                        : 'border-line text-muted hover:text-text'
                    }`}
                  >
                    {format.label}
                  </button>
                ))}
              </div>
            </label>

            <button
              type="button"
              onClick={download}
              disabled={result.cues.length === 0}
              className="cl-touch min-h-12 rounded-xl bg-selected text-[15px] font-bold text-selected-fg hover:bg-selected-hover disabled:opacity-50"
            >
              Download the fixed file
            </button>
          </div>

          <ToolResult
            tone={result.cues.length > 0 ? 'good' : 'warn'}
            title={
              result.cues.length > 0
                ? `${result.cues.length} lines ready`
                : 'Nothing readable in that file'
            }
            footer={
              <SignalList label="What changed">
                <SignalRow
                  tone={offsetMs === 0 ? 'off' : 'good'}
                  name="Timing"
                  detail={
                    offsetMs === 0
                      ? 'Unchanged'
                      : `Moved ${offsetMs > 0 ? 'later' : 'earlier'} by ${Math.abs(offsetMs / 1000).toFixed(1)}s`
                  }
                />
                <SignalRow
                  tone={factor === 1 ? 'off' : 'good'}
                  name="Speed"
                  detail={factor === 1 ? 'Unchanged' : 'Stretched for the framerate'}
                />
                <SignalRow
                  tone={result.removed > 0 ? 'good' : 'off'}
                  name="Advert lines"
                  detail={result.removed > 0 ? `${result.removed} removed` : 'None found'}
                />
                {parsed.skipped > 0 ? (
                  <SignalRow
                    tone="warn"
                    name="Unreadable entries"
                    detail={`${parsed.skipped} skipped`}
                  />
                ) : null}
              </SignalList>
            }
          >
            <p className="m-0">
              First line now shows at{' '}
              <strong className="text-pal-text">
                {result.cues[0] ? formatTimecode(result.cues[0].start, 'srt') : '—'}
              </strong>
              . Play the video, see where the first line should land, and drag until they agree.
            </p>
            {result.cues[0] ? (
              <p className="m-0 mt-2 text-[13px] text-muted/85">&ldquo;{result.cues[0].lines.join(' ')}&rdquo;</p>
            ) : null}
          </ToolResult>
        </>
      ) : null}
    </div>
  );
}
