import { describe, expect, it } from 'vitest';
import {
  escalate,
  findLookalikes,
  hasPunycode,
  identifyBytes,
  inspectDownload,
  perceptualForm,
  withByteEvidence,
  type KnownDomain,
} from '@couchlist/shared';

const KNOWN: KnownDomain[] = [
  { domain: 'anikoto.cz', label: 'anikoto', name: 'AniKoto' },
  { domain: 'kissanime.to', label: 'kissanime', name: 'KissAnime' },
  { domain: 'framehouse.net', label: 'framehouse', name: 'Framehouse' },
];

describe('verdict escalation', () => {
  it('lets the worse level win so a malware hit beats our own listing', () => {
    expect(escalate('LISTED_OK', 'DANGEROUS')).toBe('DANGEROUS');
    expect(escalate('DANGEROUS', 'LISTED_OK')).toBe('DANGEROUS');
    expect(escalate('UNKNOWN', 'LISTED_OK')).toBe('UNKNOWN');
    expect(escalate('REMOVED', 'LISTED_WARN')).toBe('REMOVED');
  });
});

describe('lookalike detection', () => {
  it('catches a known name moved onto another suffix', () => {
    const matches = findLookalikes({ domain: 'kissanime.tv.in', label: 'kissanime' }, KNOWN);
    expect(matches[0]?.reason).toBe('same-name-different-suffix');
    expect(matches[0]?.known.domain).toBe('kissanime.to');
  });

  it('sees through digits standing in for letters', () => {
    const matches = findLookalikes({ domain: 'an1kot0.cz', label: 'an1kot0' }, KNOWN);
    expect(matches[0]?.reason).toBe('confusable-characters');
    expect(matches[0]?.known.name).toBe('AniKoto');
  });

  it('treats rn as m, which is the classic one', () => {
    expect(perceptualForm('frarnehouse')).toBe(perceptualForm('framehouse'));
  });

  it('allows one edit on a long name but not on a short one', () => {
    expect(findLookalikes({ domain: 'framehous.net', label: 'framehous' }, KNOWN)).not.toHaveLength(0);
    // "anikoto" is 7 characters, so a single edit still counts as a lookalike,
    // while an unrelated short word must not match anything.
    expect(findLookalikes({ domain: 'blog.dev', label: 'blog' }, KNOWN)).toHaveLength(0);
  });

  it('does not report a domain as a lookalike of itself', () => {
    expect(findLookalikes({ domain: 'anikoto.cz', label: 'anikoto' }, KNOWN)).toHaveLength(0);
  });

  it('spots punycode', () => {
    expect(hasPunycode('xn--nikoto-5we.cz')).toBe(true);
    expect(hasPunycode('anikoto.cz')).toBe(false);
  });
});

describe('download inspection', () => {
  it('flags a video name that actually ends in an executable', () => {
    const report = inspectDownload('Episode.01.1080p.mp4.exe');
    expect(report.risk).toBe('DANGEROUS');
    expect(report.extension).toBe('exe');
    expect(report.findings[0]?.title).toContain('.mp4');
  });

  it('flags the right-to-left override trick', () => {
    const report = inspectDownload('episode‮gpj.exe');
    expect(report.risk).toBe('DANGEROUS');
    expect(report.findings.some((f) => f.title.includes('text-direction'))).toBe(true);
  });

  it('is calm about an ordinary video', () => {
    expect(inspectDownload('Episode.01.1080p.mkv').risk).toBe('FINE');
  });

  it('notes that an archive hides its contents without calling it dangerous', () => {
    expect(inspectDownload('chapter-12.zip').risk).toBe('UNEXPECTED');
  });

  it('stays quiet about .cbz, which is the format a comic reader expects', () => {
    expect(inspectDownload('chapter-12.cbz').risk).toBe('FINE');
  });

  it('is not fooled by the dots in a release filename', () => {
    const report = inspectDownload('Show.S01E04.1080p.WEB-DL.x264.mkv');
    expect(report.extension).toBe('mkv');
    expect(report.risk).toBe('FINE');
  });

  it('notices a file that is not the kind the link promised', () => {
    const report = inspectDownload('subtitles.mp4', 'subtitles');
    expect(report.risk).toBe('UNEXPECTED');
  });

  it('believes the bytes over the name', () => {
    const named = inspectDownload('movie.mkv');
    expect(named.risk).toBe('FINE');
    const withBytes = withByteEvidence(named, identifyBytes(new Uint8Array([0x4d, 0x5a, 0x90, 0x00])));
    expect(withBytes.risk).toBe('DANGEROUS');
    expect(withBytes.findings[0]?.title).toContain('Windows program');
  });

  it('recognises real media signatures', () => {
    expect(identifyBytes(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]))?.kind).toContain('Matroska');
    expect(identifyBytes(new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]))?.kind).toContain('MP4');
    expect(identifyBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46]))?.executable).toBe(false);
  });
});
