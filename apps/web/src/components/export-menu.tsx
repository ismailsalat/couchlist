'use client';

import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';

/**
 * Picking a format for the saved-list export.
 *
 * Plain links rather than a fetch: the browser's own download handling is
 * better than anything rebuilt here, and the links still work if the script
 * never runs — the menu simply starts open in that case.
 */

const FORMATS = [
  { value: 'csv', label: 'Spreadsheet', hint: 'CSV, opens in Excel or Sheets' },
  { value: 'txt', label: 'Plain text', hint: 'TXT, paste anywhere' },
  { value: 'md', label: 'Markdown', hint: 'MD, for notes apps' },
  { value: 'json', label: 'JSON', hint: 'For another program to read' },
] as const;

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="cl-touch cl-pill inline-flex items-center gap-2 rounded-pill border-2 border-line bg-surface px-3.5 py-2 text-sm font-semibold text-text hover:border-accent hover:bg-accent-soft hover:text-accent"
      >
        <Download aria-hidden="true" className="h-4 w-4" />
        Export my saved links
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-card border-2 border-line bg-surface shadow-pop"
        >
          {FORMATS.map((format) => (
            <a
              key={format.value}
              role="menuitem"
              href={`/api/saved/export?format=${format.value}`}
              onClick={() => setOpen(false)}
              className="block border-b border-line px-3.5 py-2.5 no-underline last:border-b-0 hover:bg-hover"
            >
              <span className="block text-sm font-semibold text-text">{format.label}</span>
              <span className="block text-xs text-muted">{format.hint}</span>
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}
