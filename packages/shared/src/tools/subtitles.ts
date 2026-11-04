/**
 * Subtitle repair, as pure functions.
 *
 * Subtitles being a few seconds out is the commonest thing that ruins a
 * watch, and the usual remedy is uploading the file to an advert-choked site.
 * All of this is text manipulation, so it belongs in the page: nothing is
 * uploaded and there is no service to go down.
 *
 * Kept free of DOM and file APIs so the whole thing is testable, which
 * matters more here than anywhere else in the tools — an off-by-one in a
 * timecode is invisible until somebody watches an episode with it.
 */

export const SUBTITLE_FORMATS = ['srt', 'vtt', 'ass'] as const;
export type SubtitleFormat = (typeof SUBTITLE_FORMATS)[number];

export interface Cue {
  /** Milliseconds from the start of the video. */
  start: number;
  end: number;
  /** Lines of text, already stripped of the format's own markup. */
  lines: string[];
}

export interface ParsedSubtitles {
  format: SubtitleFormat;
  cues: Cue[];
  /** Lines we could not make sense of, kept so nothing is silently lost. */
  skipped: number;
}

/* ---------------------------------------------------------------- parsing */

/** `00:01:02,345` and `0:01:02.34` both mean the same thing. */
export function parseTimecode(value: string): number | null {
  const match = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/u.exec(value.trim());
  if (!match) return null;

  const [, hours, minutes, seconds, fraction] = match;
  // ASS writes centiseconds, SRT and VTT write milliseconds. Pad rather than
  // assume: "34" is 340ms, not 34ms.
  const ms = Number(fraction!.padEnd(3, '0'));

  return (
    Number(hours ?? 0) * 3_600_000 + Number(minutes) * 60_000 + Number(seconds) * 1_000 + ms
  );
}

export function formatTimecode(ms: number, format: SubtitleFormat): string {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1_000);
  const millis = safe % 1_000;

  const pad = (value: number, width = 2) => String(value).padStart(width, '0');

  if (format === 'ass') {
    // ASS uses one-digit hours and centiseconds.
    return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(Math.floor(millis / 10))}`;
  }
  const separator = format === 'vtt' ? '.' : ',';
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}${separator}${pad(millis, 3)}`;
}

/** What kind of file is this? Decided by content, not by the name. */
export function detectFormat(text: string): SubtitleFormat {
  if (/^﻿?WEBVTT/u.test(text)) return 'vtt';
  if (/^\s*\[Script Info\]/mu.test(text) || /^Dialogue:/mu.test(text)) return 'ass';
  return 'srt';
}

function parseTimedBlocks(text: string): { cues: Cue[]; skipped: number } {
  const cues: Cue[] = [];
  let skipped = 0;

  // One cue per blank-line-separated block, which both SRT and VTT use.
  for (const block of text.replace(/\r\n?/gu, '\n').split(/\n{2,}/u)) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;

    const arrowAt = lines.findIndex((line) => line.includes('-->'));
    if (arrowAt === -1) {
      // A WEBVTT header or a NOTE block, not a cue.
      if (!/^﻿?WEBVTT|^NOTE\b|^STYLE\b|^REGION\b/u.test(lines[0]!)) skipped += 1;
      continue;
    }

    const [rawStart, rawEnd] = lines[arrowAt]!.split('-->');
    // VTT allows cue settings after the end time: "00:02.000 line:0 align:start".
    const start = parseTimecode((rawStart ?? '').trim());
    const end = parseTimecode((rawEnd ?? '').trim().split(/\s+/u)[0] ?? '');
    if (start === null || end === null) {
      skipped += 1;
      continue;
    }

    const body = lines.slice(arrowAt + 1);
    if (body.length === 0) continue;
    cues.push({ start, end, lines: body });
  }

  return { cues, skipped };
}

function parseAss(text: string): { cues: Cue[]; skipped: number } {
  const cues: Cue[] = [];
  let skipped = 0;
  let startIndex = 1;
  let endIndex = 2;
  let textIndex = 9;

  for (const raw of text.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = raw.trim();

    if (line.startsWith('Format:') && /start/iu.test(line)) {
      // The field order is declared per file and is not always the default.
      const fields = line.slice(7).split(',').map((field) => field.trim().toLowerCase());
      startIndex = fields.indexOf('start');
      endIndex = fields.indexOf('end');
      textIndex = fields.indexOf('text');
      continue;
    }

    if (!line.startsWith('Dialogue:')) continue;

    // Text is last and may itself contain commas, so split only as far as needed.
    const parts = line.slice(9).split(',');
    const start = parseTimecode(parts[startIndex] ?? '');
    const end = parseTimecode(parts[endIndex] ?? '');
    if (start === null || end === null) {
      skipped += 1;
      continue;
    }

    const body = parts.slice(textIndex).join(',');
    const cleaned = body
      .replace(/\{[^}]*\}/gu, '') // override tags: {\an8}, {\pos(..)}
      .replace(/\\N|\\n/gu, '\n')
      .trim();
    if (cleaned.length === 0) continue;

    cues.push({ start, end, lines: cleaned.split('\n') });
  }

  return { cues, skipped };
}

export function parseSubtitles(text: string): ParsedSubtitles {
  const format = detectFormat(text);
  const { cues, skipped } = format === 'ass' ? parseAss(text) : parseTimedBlocks(text);
  cues.sort((a, b) => a.start - b.start);
  return { format, cues, skipped };
}

/* ------------------------------------------------------------- transforms */

/** Move every cue by a number of milliseconds. Negative moves them earlier. */
export function shift(cues: readonly Cue[], ms: number): Cue[] {
  return cues.map((cue) => ({
    ...cue,
    start: Math.max(0, cue.start + ms),
    end: Math.max(0, cue.end + ms),
  }));
}

/**
 * Stretch or compress the whole track.
 *
 * This is the fix for subtitles that start right and drift: the file was
 * timed against a different framerate. 25 → 23.976 is the common pair.
 */
export function scale(cues: readonly Cue[], factor: number): Cue[] {
  if (!Number.isFinite(factor) || factor <= 0) return [...cues];
  return cues.map((cue) => ({
    ...cue,
    start: Math.max(0, Math.round(cue.start * factor)),
    end: Math.max(0, Math.round(cue.end * factor)),
  }));
}

/** Common framerate pairs, as a ratio to multiply by. */
export const FRAMERATE_FIXES: ReadonlyArray<{ label: string; factor: number }> = [
  { label: '25 → 23.976 (PAL to film)', factor: 25 / 23.976 },
  { label: '23.976 → 25 (film to PAL)', factor: 23.976 / 25 },
  { label: '30 → 29.97', factor: 30 / 29.97 },
  { label: '29.97 → 30', factor: 29.97 / 30 },
];

/**
 * Phrases that mark a cue as an advert rather than dialogue.
 *
 * Rippers bake a credit line into the first and last cues, and sometimes
 * every few minutes. Matching is deliberately conservative: a false positive
 * deletes a line of the film, which is worse than leaving an advert in.
 */
const ADVERT_PATTERNS: readonly RegExp[] = [
  /\b(?:sub(?:title)?s?|translat(?:ed|ion)|encoded|ripped|synced?|corrected|timed)\s+by\b/iu,
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}/iu,
  /\b[a-z0-9-]+\.(?:com|net|org|tv|to|io|me|co|info|ru|xyz)\b.*\b(?:watch|download|free|stream|movies?|series)\b/iu,
  /\b(?:watch|download)\s+(?:free\s+)?(?:movies?|series|anime)\s+(?:at|on)\b/iu,
  /\badvertise\s+your\s+product\b/iu,
  /\bopensubtitles\b|\baddic7ed\b|\bsubscene\b/iu,
  /\bjoin\s+(?:us\s+)?(?:on\s+)?discord\b/iu,
];

export function looksLikeAdvert(text: string): boolean {
  return ADVERT_PATTERNS.some((pattern) => pattern.test(text));
}

/** Drop cues that are adverts rather than dialogue. */
export function removeAdverts(cues: readonly Cue[]): { cues: Cue[]; removed: number } {
  const kept = cues.filter((cue) => !looksLikeAdvert(cue.lines.join(' ')));
  return { cues: kept, removed: cues.length - kept.length };
}

/* ----------------------------------------------------------- serialisation */

function stripTags(line: string): string {
  return line.replace(/<\/?[a-z][^>]*>/giu, '');
}

export function serialise(cues: readonly Cue[], format: SubtitleFormat): string {
  if (format === 'vtt') {
    const body = cues
      .map(
        (cue) =>
          `${formatTimecode(cue.start, 'vtt')} --> ${formatTimecode(cue.end, 'vtt')}\n${cue.lines.join('\n')}`,
      )
      .join('\n\n');
    return `WEBVTT\n\n${body}\n`;
  }

  if (format === 'ass') {
    const header =
      '[Script Info]\nScriptType: v4.00+\n\n' +
      '[V4+ Styles]\n' +
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n' +
      'Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1\n\n' +
      '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
    const body = cues
      .map(
        (cue) =>
          `Dialogue: 0,${formatTimecode(cue.start, 'ass')},${formatTimecode(cue.end, 'ass')},Default,,0,0,0,,${cue.lines
            .map(stripTags)
            .join('\\N')}`,
      )
      .join('\n');
    return `${header}${body}\n`;
  }

  return (
    cues
      .map(
        (cue, index) =>
          `${index + 1}\n${formatTimecode(cue.start, 'srt')} --> ${formatTimecode(cue.end, 'srt')}\n${cue.lines.join('\n')}`,
      )
      .join('\n\n') + '\n'
  );
}

/**
 * Repair garbled text.
 *
 * A file written as Windows-1251 or Shift-JIS and read as UTF-8 comes out as
 * mojibake. The browser hands us the already-wrong string, so this re-reads
 * the original bytes under a different encoding. The caller supplies those
 * bytes; picking the encoding is a human decision and the UI offers a few.
 */
export const TEXT_ENCODINGS: ReadonlyArray<{ label: string; encoding: string }> = [
  { label: 'Unicode (UTF-8)', encoding: 'utf-8' },
  { label: 'Western European', encoding: 'windows-1252' },
  { label: 'Cyrillic', encoding: 'windows-1251' },
  { label: 'Japanese', encoding: 'shift_jis' },
  { label: 'Korean', encoding: 'euc-kr' },
  { label: 'Chinese (Simplified)', encoding: 'gbk' },
  { label: 'Chinese (Traditional)', encoding: 'big5' },
  { label: 'Central European', encoding: 'windows-1250' },
  { label: 'Turkish', encoding: 'windows-1254' },
  { label: 'Arabic', encoding: 'windows-1256' },
];

/**
 * A rough score for "does this look like readable text".
 *
 * Counts the replacement character and the Latin-1 punctuation runs that
 * mojibake produces. Lower is better. Used only to *suggest* an encoding; the
 * person still chooses.
 */
export function garbledScore(text: string): number {
  const sample = text.slice(0, 4_000);
  if (sample.length === 0) return 0;

  let bad = 0;
  for (const char of sample) {
    const code = char.codePointAt(0)!;
    if (char === '�') bad += 3;
    // The à Ã Ð ÑÐ soup that UTF-8-read-as-Latin-1 produces.
    else if (code >= 0x80 && code <= 0xbf) bad += 2;
    else if (code >= 0xc0 && code <= 0xff) bad += 1;
  }
  return bad / sample.length;
}
