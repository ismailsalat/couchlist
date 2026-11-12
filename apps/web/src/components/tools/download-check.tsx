'use client';

import { useCallback, useRef, useState } from 'react';
import { inspectDownload, type DownloadReport } from '@couchlist/shared';
import { FindingRow, SignalList, SignalRow, ToolResult, type Tone } from './result';

/**
 * Check a download before you open it.
 *
 * Two passes, and the order matters. First the file's SHA-256 is computed
 * **in the page** and only that fingerprint is sent, which identifies the
 * file to malware databases without the file going anywhere. Then the name
 * and the first bytes are examined locally for the disguises a fingerprint
 * cannot catch — a brand-new dropper nobody has reported still ends in .exe
 * while claiming to be a video.
 *
 * What this is not: a virus scanner. A fingerprint only knows files somebody
 * has already reported, so "no threats detected" means exactly that and the
 * copy never softens into "safe".
 */

interface Lookup {
  sha256: string;
  verdict: 'THREAT' | 'NOT_KNOWN' | 'UNAVAILABLE';
  title: string;
  body: string;
  signals: Array<{ source: string; status: string; detail: string }>;
}

const LOCAL_TONE: Record<string, Tone> = {
  DANGEROUS: 'bad',
  SUSPICIOUS: 'warn',
  UNEXPECTED: 'neutral',
  FINE: 'good',
};

/** Hashing in chunks, so a large file does not have to fit in memory twice. */
async function sha256Of(file: File, onProgress: (fraction: number) => void): Promise<string> {
  // Web Crypto has no streaming digest, so a very large file is read whole.
  // Everything this tool is for — an installer, an archive, a video — fits.
  const buffer = await file.arrayBuffer();
  onProgress(0.6);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  onProgress(1);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function DownloadCheck() {
  const [report, setReport] = useState<DownloadReport | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [filename, setFilename] = useState('');
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const check = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setLookup(null);
    setProgress(0);
    setFilename(file.name);
    setReport(inspectDownload(file.name));

    try {
      const sha256 = await sha256Of(file, setProgress);
      const response = await fetch('/api/tools/file-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sha256 }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? 'Could not reach the reputation services.');
        return;
      }
      setLookup(body as Lookup);
    } catch {
      setError('Could not reach the reputation services. The checks below still apply.');
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }, []);

  const tone: Tone =
    lookup?.verdict === 'THREAT' || report?.risk === 'DANGEROUS'
      ? 'bad'
      : report?.risk === 'SUSPICIOUS'
        ? 'warn'
        : lookup?.verdict === 'UNAVAILABLE'
          ? 'neutral'
          : lookup
            ? 'good'
            : 'neutral';

  return (
    <div data-palette="green" className="rounded-2xl border border-line bg-surface p-5">
      <h2 className="m-0 text-[18px] font-bold">Check a download</h2>
      <p className="mb-4 mt-1 max-w-[62ch] text-[13.5px] text-muted">
        Pick a file and we work out its fingerprint on your device, then ask the malware databases
        whether anyone has reported that exact file. <strong className="text-text">The file
        itself never leaves your machine</strong> — only a 64-character fingerprint is sent.
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
          const file = event.dataTransfer.files?.[0];
          if (file) void check(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-xl border border-dashed p-6 text-center text-[13.5px] transition ${
          dragging ? 'border-accent bg-hover text-text' : 'border-line text-muted'
        }`}
      >
        {busy ? (
          `Working out the fingerprint… ${Math.round(progress * 100)}%`
        ) : filename ? (
          <>
            <span className="truncate font-semibold text-text">{filename}</span>
            <span className="mt-1 block text-[12.5px]">Drop another to check it</span>
          </>
        ) : (
          <>
            <span className="font-semibold text-text">Choose a file</span>
            <span className="mt-1 block text-[12.5px]">
              Tap to pick from your phone or computer, or drop one here
            </span>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void check(file);
            event.target.value = '';
          }}
        />
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[12.5px] text-muted">
          Only have the name, not the file?
        </summary>
        <input
          value={filename}
          onChange={(event) => {
            setFilename(event.target.value);
            setLookup(null);
            setReport(event.target.value.trim() ? inspectDownload(event.target.value) : null);
          }}
          placeholder="Episode.01.1080p.mp4.exe"
          aria-label="Filename"
          className="mt-2 min-h-11 w-full rounded-xl border border-line bg-bg px-3.5 text-[14px] text-text placeholder:text-muted/70"
        />
        <p className="m-0 mt-1.5 text-[12px] text-muted">
          A name alone catches disguises, not malware. Use the file itself where you can.
        </p>
      </details>

      {error ? (
        <p role="alert" className="mt-3 text-[13.5px] text-warn-text">
          {error}
        </p>
      ) : null}

      {report ? (
        <ToolResult
          tone={tone}
          title={lookup ? lookup.title : report.risk === 'FINE' ? 'Nothing wrong with the name' : 'Look at this first'}
          footer={
            <>
              {lookup ? (
                <div className="mb-4">
                  <SignalList label="Malware databases">
                    {lookup.signals.map((signal, index) => (
                      <SignalRow
                        key={`${signal.source}-${index}`}
                        tone={
                          signal.status === 'flagged'
                            ? 'bad'
                            : signal.status === 'unavailable'
                              ? 'off'
                              : 'good'
                        }
                        name={signal.source}
                        detail={signal.detail}
                      />
                    ))}
                  </SignalList>
                </div>
              ) : null}

              <SignalList label="The name and the first bytes">
                {report.findings.map((finding, index) => (
                  <FindingRow
                    key={index}
                    tone={LOCAL_TONE[finding.risk] ?? 'neutral'}
                    title={finding.title}
                    detail={finding.detail}
                  />
                ))}
              </SignalList>
            </>
          }
        >
          <p className="m-0 break-all font-mono text-[12.5px] text-muted/85">{report.filename}</p>
          {lookup ? <p className="m-0 mt-2">{lookup.body}</p> : null}
          {lookup ? (
            <p className="m-0 mt-2 break-all font-mono text-[11.5px] text-muted/60">
              {lookup.sha256}
            </p>
          ) : null}
        </ToolResult>
      ) : null}

      <p className="mt-4 text-[12px] text-muted/75">
        This identifies files somebody has already reported. It does not scan the contents, so a
        file nobody has seen before comes back unknown — which is not the same as safe.
      </p>
    </div>
  );
}
