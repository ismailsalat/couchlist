'use client';

import { useCallback, useRef, useState } from 'react';
import { FindingRow, SignalList, ToolResult, type Tone } from './result';
import {
  identifyBytes,
  inspectDownload,
  withByteEvidence,
  type DownloadReport,
  type DownloadRisk,
} from '@couchlist/shared';

/**
 * Download safety check.
 *
 * Works on a filename alone, and on the first bytes of a file when you drop
 * one in. The file is never uploaded: it is read in the page and only the
 * first sixteen bytes are looked at, which is enough to tell a Windows
 * executable from a Matroska video and not enough to be worth sending
 * anywhere.
 */

const RISK: Record<DownloadRisk, { tone: Tone; word: string }> = {
  DANGEROUS: { tone: 'bad', word: 'Do not open this' },
  SUSPICIOUS: { tone: 'warn', word: 'Worth a closer look' },
  UNEXPECTED: { tone: 'neutral', word: 'Probably fine' },
  FINE: { tone: 'good', word: 'Looks like what it says' },
};

const HEAD_BYTES = 16;

export function DownloadCheck() {
  const [report, setReport] = useState<DownloadReport | null>(null);
  const [name, setName] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const checkName = useCallback((value: string) => {
    const trimmed = value.trim();
    setReport(trimmed ? inspectDownload(trimmed) : null);
  }, []);

  const checkFile = useCallback(async (file: File) => {
    setName(file.name);
    const base = inspectDownload(file.name);
    try {
      const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
      setReport(withByteEvidence(base, identifyBytes(head)));
    } catch {
      // Some files the browser will not hand over. The name check stands alone.
      setReport(base);
    }
  }, []);

  const shown = report ? RISK[report.risk] : null;

  return (
    <div data-palette="green" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="m-0 text-[18px] font-bold">Download safety check</h2>
      <p className="mb-4 mt-1 max-w-[60ch] text-[13.5px] text-muted">
        Paste a filename, or drop the file in to have its first bytes read too. Nothing is uploaded —
        the check happens on your own machine.
      </p>

      <input
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          checkName(event.target.value);
        }}
        placeholder="Episode.01.1080p.mp4.exe"
        autoComplete="off"
        spellCheck={false}
        aria-label="Filename"
        className="min-h-11 w-full rounded-xl border border-line bg-bg px-3.5 text-[15px] text-text placeholder:text-muted/70"
      />

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void checkFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`mt-2.5 cursor-pointer rounded-xl border border-dashed p-4 text-center text-[13px] transition ${
          dragging ? 'border-accent bg-hover text-text' : 'border-line text-muted'
        }`}
      >
        Drop a file here, or click to pick one. It stays on your device.
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void checkFile(file);
          }}
        />
      </div>

      {report && shown ? (
        <ToolResult
          tone={shown.tone}
          title={shown.word}
          footer={
            <SignalList label="What the name and bytes say">
              {report.findings.map((finding, index) => (
                <FindingRow
                  key={index}
                  tone={RISK[finding.risk].tone}
                  title={finding.title}
                  detail={finding.detail}
                />
              ))}
            </SignalList>
          }
        >
          <p className="m-0 break-all font-mono text-[13px] text-muted/85">{report.filename}</p>
        </ToolResult>
      ) : null}

    </div>
  );
}
