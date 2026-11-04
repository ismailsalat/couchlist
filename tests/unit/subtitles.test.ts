import { describe, expect, it } from 'vitest';
import {
  detectFormat,
  formatTimecode,
  garbledScore,
  looksLikeAdvert,
  parseSubtitles,
  parseTimecode,
  removeAdverts,
  scale,
  serialise,
  shift,
} from '@couchlist/shared';

const SRT = `1
00:00:20,000 --> 00:00:24,400
Subtitles by the community

2
00:00:24,600 --> 00:00:27,800
It is a beautiful morning.
Shall we go?

3
00:01:02,345 --> 00:01:04,000
Visit www.freemovies-example.com
`;

const VTT = `WEBVTT

NOTE this is a comment

00:00:20.000 --> 00:00:24.400 line:0 align:start
Hello there

00:01:00.000 --> 00:01:02.500
Second line
`;

const ASS = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:20.00,0:00:24.40,Default,,0,0,0,,{\\an8}Hello, there
Dialogue: 0,0:01:00.00,0:01:02.50,Default,,0,0,0,,First line\\NSecond line
`;

describe('timecodes', () => {
  it('reads every shape these formats use', () => {
    expect(parseTimecode('00:00:20,000')).toBe(20_000);
    expect(parseTimecode('00:00:20.000')).toBe(20_000);
    expect(parseTimecode('0:01:02.34')).toBe(62_340);
    expect(parseTimecode('1:00:00,000')).toBe(3_600_000);
    expect(parseTimecode('not a time')).toBeNull();
  });

  it('treats a two-digit fraction as centiseconds, not milliseconds', () => {
    // ASS writes 0:00:01.05 meaning 50ms. Reading it as 5ms would drift.
    expect(parseTimecode('0:00:01.05')).toBe(1_050);
  });

  it('writes each format back in its own shape', () => {
    expect(formatTimecode(62_345, 'srt')).toBe('00:01:02,345');
    expect(formatTimecode(62_345, 'vtt')).toBe('00:01:02.345');
    expect(formatTimecode(62_345, 'ass')).toBe('0:01:02.34');
  });

  it('survives a round trip', () => {
    for (const ms of [0, 1, 999, 1_000, 61_234, 3_600_000, 7_322_100]) {
      expect(parseTimecode(formatTimecode(ms, 'srt'))).toBe(ms);
    }
  });
});

describe('parsing', () => {
  it('knows what it is looking at', () => {
    expect(detectFormat(SRT)).toBe('srt');
    expect(detectFormat(VTT)).toBe('vtt');
    expect(detectFormat(ASS)).toBe('ass');
  });

  it('reads SRT', () => {
    const parsed = parseSubtitles(SRT);
    expect(parsed.cues).toHaveLength(3);
    expect(parsed.cues[1]?.lines).toEqual(['It is a beautiful morning.', 'Shall we go?']);
  });

  it('skips VTT headers and notes without counting them as broken', () => {
    const parsed = parseSubtitles(VTT);
    expect(parsed.cues).toHaveLength(2);
    expect(parsed.skipped).toBe(0);
  });

  it('ignores VTT cue settings after the end time', () => {
    expect(parseSubtitles(VTT).cues[0]?.end).toBe(24_400);
  });

  it('reads ASS, drops its override tags and splits on \\N', () => {
    const parsed = parseSubtitles(ASS);
    expect(parsed.cues).toHaveLength(2);
    expect(parsed.cues[0]?.lines).toEqual(['Hello, there']);
    expect(parsed.cues[1]?.lines).toEqual(['First line', 'Second line']);
  });

  it('keeps commas in ASS dialogue text', () => {
    // Text is the last field and may contain commas; splitting naively eats it.
    expect(parseSubtitles(ASS).cues[0]?.lines[0]).toContain(',');
  });
});

describe('transforms', () => {
  it('shifts without going negative', () => {
    const cues = parseSubtitles(SRT).cues;
    expect(shift(cues, 2_000)[0]?.start).toBe(22_000);
    expect(shift(cues, -1_000_000)[0]?.start).toBe(0);
  });

  it('stretches for a framerate mismatch', () => {
    const cues = [{ start: 0, end: 1_000, lines: ['x'] }];
    const stretched = scale(cues, 25 / 23.976);
    expect(stretched[0]?.end).toBe(1_043);
  });

  it('refuses a nonsense factor rather than destroying the file', () => {
    const cues = [{ start: 100, end: 200, lines: ['x'] }];
    expect(scale(cues, 0)).toEqual(cues);
    expect(scale(cues, Number.NaN)).toEqual(cues);
  });
});

describe('advert removal', () => {
  it('catches the usual credit and link lines', () => {
    expect(looksLikeAdvert('Subtitles by the community')).toBe(true);
    expect(looksLikeAdvert('Visit www.freemovies-example.com')).toBe(true);
    expect(looksLikeAdvert('Synced by someone')).toBe(true);
    expect(looksLikeAdvert('Join us on Discord')).toBe(true);
  });

  it('leaves ordinary dialogue alone, including lines that mention films', () => {
    expect(looksLikeAdvert('It is a beautiful morning.')).toBe(false);
    expect(looksLikeAdvert('I watch movies every night.')).toBe(false);
    expect(looksLikeAdvert('He was downloaded into the machine.')).toBe(false);
    expect(looksLikeAdvert('Subtitle this for me, would you?')).toBe(false);
  });

  it('removes only the advert cues', () => {
    const { cues, removed } = removeAdverts(parseSubtitles(SRT).cues);
    expect(removed).toBe(2);
    expect(cues).toHaveLength(1);
    expect(cues[0]?.lines[0]).toContain('beautiful morning');
  });
});

describe('serialising', () => {
  it('writes SRT that parses back to the same thing', () => {
    const original = parseSubtitles(SRT).cues;
    const again = parseSubtitles(serialise(original, 'srt')).cues;
    expect(again).toEqual(original);
  });

  it('converts SRT to VTT and back without losing timing', () => {
    const original = parseSubtitles(SRT).cues;
    const asVtt = serialise(original, 'vtt');
    expect(asVtt.startsWith('WEBVTT')).toBe(true);
    expect(parseSubtitles(asVtt).cues.map((c) => c.start)).toEqual(original.map((c) => c.start));
  });

  it('converts to ASS and back, within centisecond precision', () => {
    const original = parseSubtitles(SRT).cues;
    const back = parseSubtitles(serialise(original, 'ass')).cues;
    back.forEach((cue, index) => {
      expect(Math.abs(cue.start - original[index]!.start)).toBeLessThanOrEqual(10);
    });
  });

  it('renumbers SRT entries after cues are removed', () => {
    const { cues } = removeAdverts(parseSubtitles(SRT).cues);
    expect(serialise(cues, 'srt').startsWith('1\n')).toBe(true);
  });
});

describe('garbled text scoring', () => {
  it('scores readable text lower than mojibake', () => {
    expect(garbledScore('It is a beautiful morning.')).toBeLessThan(
      garbledScore('ÐŸÑ€Ð¸Ð²ÐµÑ‚ ÐºÐ°Ðº Ð´ÐµÐ»Ð°'),
    );
  });

  it('treats the replacement character as strong evidence', () => {
    expect(garbledScore('���')).toBeGreaterThan(1);
  });
});
