/**
 * Exporting a saved list.
 *
 * Four formats, one shape of data. Each one is built here rather than in the
 * route so the escaping can be read in one place and tested without a server.
 *
 * Everything in a row was typed by somebody: a source name came from a
 * contributor, a note came from the account that owns it. So every format
 * escapes for its own destination, and none of them assume the text is tame.
 */

export const EXPORT_FORMATS = ['csv', 'txt', 'md', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface SavedExportRow {
  name: string;
  homepageUrl: string;
  domain: string;
  categories: string[];
  savedAt: Date;
  note: string | null;
}

export interface ExportFile {
  body: string;
  contentType: string;
  filename: string;
}

/** Narrows an untrusted query value to a format this knows how to build. */
export function parseExportFormat(value: unknown): ExportFormat {
  return EXPORT_FORMATS.includes(value as ExportFormat) ? (value as ExportFormat) : 'csv';
}

const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Strips characters that would let one field pretend to be another.
 *
 * A newline inside a name turns one line of a text export into two, and a
 * carriage return can hide everything before it in a terminal.
 */
function oneLine(value: string | null | undefined): string {
  // eslint-disable-next-line no-control-regex
  return (value ?? '').replace(/[\u0000-\u001f\u007f]+/gu, ' ').trim();
}

/* ---------------------------------- csv ---------------------------------- */

/**
 * A spreadsheet treats a cell beginning =, +, - or @ as a formula, and some
 * of those formulas fetch a URL. Prefixing an apostrophe makes it text again.
 */
function csvCell(value: string | null): string {
  const text = value ?? '';
  const safe = /^[=+\-@\t\r]/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/gu, '""')}"`;
}

function toCsv(rows: SavedExportRow[]): string {
  const header = ['Name', 'Website', 'Domain', 'Categories', 'Saved on', 'My note'];
  const lines = [
    header.map(csvCell).join(','),
    ...rows.map((row) =>
      [
        csvCell(row.name),
        csvCell(row.homepageUrl),
        csvCell(row.domain),
        csvCell(row.categories.join(' / ')),
        csvCell(day(row.savedAt)),
        csvCell(row.note),
      ].join(','),
    ),
  ];
  // The byte order mark is what makes Excel read it as UTF-8.
  return `﻿${lines.join('\r\n')}\r\n`;
}

/* ---------------------------------- txt ---------------------------------- */

function toText(rows: SavedExportRow[]): string {
  if (rows.length === 0) return 'Couchlist saved sources\n\nNothing saved yet.\n';

  const blocks = rows.map((row) => {
    const lines = [
      oneLine(row.name),
      `  ${oneLine(row.homepageUrl)}`,
      `  ${row.categories.length > 0 ? row.categories.join(', ') : 'No categories'} · saved ${day(row.savedAt)}`,
    ];
    const note = oneLine(row.note);
    if (note) lines.push(`  Note: ${note}`);
    return lines.join('\n');
  });

  return [
    'Couchlist saved sources',
    `${rows.length} ${rows.length === 1 ? 'source' : 'sources'}`,
    '',
    blocks.join('\n\n'),
    '',
  ].join('\n');
}

/* ------------------------------- markdown -------------------------------- */

/**
 * In Markdown a `]` closes a link early, so a name containing one could put
 * the rest of itself outside the link and next to a URL of its choosing.
 * Escaping the structural characters keeps the text as text.
 */
function mdText(value: string | null | undefined): string {
  return oneLine(value).replace(/([\\`*_{}[\]()#+\-!|<>])/gu, '\\$1');
}

function toMarkdown(rows: SavedExportRow[]): string {
  const out = ['# Couchlist saved sources', ''];
  if (rows.length === 0) {
    out.push('Nothing saved yet.', '');
    return out.join('\n');
  }

  out.push(`${rows.length} ${rows.length === 1 ? 'source' : 'sources'}.`, '');
  for (const row of rows) {
    // The URL goes in angle brackets: that is the form that survives a
    // parenthesis or a space without breaking the link.
    out.push(`- **[${mdText(row.name)}](<${oneLine(row.homepageUrl)}>)**`);
    const facts = [
      row.categories.length > 0 ? mdText(row.categories.join(', ')) : null,
      `saved ${day(row.savedAt)}`,
    ].filter(Boolean);
    out.push(`  ${facts.join(' · ')}`);
    const note = mdText(row.note);
    if (note) out.push(`  Note: ${note}`);
  }
  out.push('');
  return out.join('\n');
}

/* --------------------------------- json ---------------------------------- */

function toJson(rows: SavedExportRow[]): string {
  return `${JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: rows.length,
      sources: rows.map((row) => ({
        name: row.name,
        url: row.homepageUrl,
        domain: row.domain,
        categories: row.categories,
        savedAt: row.savedAt.toISOString(),
        note: row.note,
      })),
    },
    null,
    2,
  )}\n`;
}

/* --------------------------------- build --------------------------------- */

export function buildSavedExport(format: ExportFormat, rows: SavedExportRow[]): ExportFile {
  switch (format) {
    case 'txt':
      return {
        body: toText(rows),
        contentType: 'text/plain; charset=utf-8',
        filename: 'couchlist-saved-sources.txt',
      };
    case 'md':
      return {
        body: toMarkdown(rows),
        contentType: 'text/markdown; charset=utf-8',
        filename: 'couchlist-saved-sources.md',
      };
    case 'json':
      return {
        body: toJson(rows),
        contentType: 'application/json; charset=utf-8',
        filename: 'couchlist-saved-sources.json',
      };
    case 'csv':
    default:
      return {
        body: toCsv(rows),
        contentType: 'text/csv; charset=utf-8',
        filename: 'couchlist-saved-sources.csv',
      };
  }
}

/**
 * Headers for a personal export.
 *
 * `nosniff` matters more than usual here: the body is full of text somebody
 * else wrote, and without it a browser may decide a .txt download full of
 * tags is really HTML and run it on this origin.
 */
export function exportResponseHeaders(file: ExportFile): Record<string, string> {
  return {
    'content-type': file.contentType,
    'content-disposition': `attachment; filename="${file.filename}"`,
    'x-content-type-options': 'nosniff',
    // A personal export must never be held by a shared proxy.
    'cache-control': 'private, no-store',
  };
}
