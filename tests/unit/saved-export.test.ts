import { describe, expect, it } from 'vitest';
import {
  buildSavedExport,
  exportResponseHeaders,
  parseExportFormat,
  type SavedExportRow,
} from '@couchlist/shared';

/**
 * Every field in an export was typed by somebody. These tests are mostly
 * about what happens when that somebody was not being nice: a name that looks
 * like a spreadsheet formula, a note containing a newline, a title that tries
 * to escape a Markdown link.
 */

const row = (overrides: Partial<SavedExportRow> = {}): SavedExportRow => ({
  name: 'Framehouse',
  homepageUrl: 'https://framehouse.example/',
  domain: 'framehouse.example',
  categories: ['Movies', 'TV'],
  savedAt: new Date('2026-03-04T10:00:00Z'),
  note: 'Good for documentaries',
  ...overrides,
});

describe('choosing a format', () => {
  it('takes the four it knows', () => {
    for (const value of ['csv', 'txt', 'md', 'json']) {
      expect(parseExportFormat(value)).toBe(value);
    }
  });

  it('falls back to csv rather than failing a download', () => {
    for (const value of [undefined, null, '', 'xlsx', 'CSV', 42, {}]) {
      expect(parseExportFormat(value)).toBe('csv');
    }
  });
});

describe('the four exports', () => {
  it('each carry the data, with the right type and filename', () => {
    const rows = [row()];
    for (const [format, type, extension] of [
      ['csv', 'text/csv', '.csv'],
      ['txt', 'text/plain', '.txt'],
      ['md', 'text/markdown', '.md'],
      ['json', 'application/json', '.json'],
    ] as const) {
      const file = buildSavedExport(format, rows);
      expect(file.contentType).toContain(type);
      expect(file.filename.endsWith(extension)).toBe(true);
      expect(file.body).toContain('Framehouse');
      expect(file.body).toContain('framehouse.example');
    }
  });

  it('say so plainly when there is nothing saved', () => {
    expect(buildSavedExport('txt', []).body).toContain('Nothing saved yet');
    expect(buildSavedExport('md', []).body).toContain('Nothing saved yet');
    expect(JSON.parse(buildSavedExport('json', []).body).count).toBe(0);
    // CSV keeps its header row, which is what a spreadsheet expects.
    expect(buildSavedExport('csv', []).body).toContain('Name');
  });

  it('produce JSON that parses back to the same values', () => {
    const parsed = JSON.parse(buildSavedExport('json', [row()]).body);
    expect(parsed.count).toBe(1);
    expect(parsed.sources[0]).toMatchObject({
      name: 'Framehouse',
      url: 'https://framehouse.example/',
      categories: ['Movies', 'TV'],
      note: 'Good for documentaries',
    });
  });
});

describe('fields that are trying something', () => {
  it('stops a spreadsheet treating a name as a formula', () => {
    const body = buildSavedExport('csv', [row({ name: '=HYPERLINK("http://evil.example")' })]).body;
    // Quoted and prefixed, so the cell is text rather than a live formula.
    expect(body).toContain('"\'=HYPERLINK');
    expect(body).not.toContain(',=HYPERLINK');
  });

  it('keeps a quote inside a CSV cell from ending it', () => {
    const body = buildSavedExport('csv', [row({ note: 'She said "watch this"' })]).body;
    expect(body).toContain('"She said ""watch this"""');
  });

  it('keeps one row on one line in the text export', () => {
    const body = buildSavedExport('txt', [
      row({ name: 'Real Name\nFake Name', note: 'line one\r\nline two' }),
    ]).body;
    // The injected newline is gone, so the name still occupies exactly one
    // line and cannot pose as a second entry.
    expect(body).toContain('Real Name Fake Name');
    expect(body.split('\n').some((line) => line.trim() === 'Fake Name')).toBe(false);
    expect(body).toContain('line one line two');
    expect(body.split('\n').some((line) => line.trim() === 'line two')).toBe(false);
  });

  it('stops a name breaking out of a Markdown link', () => {
    const body = buildSavedExport('md', [
      row({ name: 'Nice](http://evil.example) [Click here' }),
    ]).body;
    expect(body).not.toContain('](http://evil.example)');
    expect(body).toContain('\\]');
  });

  it('wraps the URL so a parenthesis cannot end the link early', () => {
    const body = buildSavedExport('md', [
      row({ homepageUrl: 'https://example.com/a(b)c' }),
    ]).body;
    expect(body).toContain('(<https://example.com/a(b)c>)');
  });

  it('escapes a note through JSON rather than pasting it in', () => {
    const body = buildSavedExport('json', [row({ note: '</script><script>alert(1)' })]).body;
    expect(() => JSON.parse(body)).not.toThrow();
    expect(JSON.parse(body).sources[0].note).toBe('</script><script>alert(1)');
  });
});

describe('export response headers', () => {
  it('download rather than render, and never sniff the type', () => {
    const headers = exportResponseHeaders(buildSavedExport('txt', [row()]));
    expect(headers['content-disposition']).toContain('attachment');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });

  it('keep a personal list out of shared caches', () => {
    const headers = exportResponseHeaders(buildSavedExport('csv', [row()]));
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['cache-control']).toContain('private');
  });
});
