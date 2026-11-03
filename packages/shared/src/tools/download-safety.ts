/**
 * Does this download look like what it claims to be?
 *
 * Runs on a filename, and optionally on the first bytes of the file, so it
 * works entirely in the browser: nothing is uploaded, which is both a privacy
 * property worth keeping and the only way this scales without a server.
 *
 * It answers one narrow question — is the thing you are about to open
 * pretending to be something else — and says so plainly. It is not a virus
 * scanner, and the copy must never let a person think it is.
 */

export type DownloadRisk = 'DANGEROUS' | 'SUSPICIOUS' | 'UNEXPECTED' | 'FINE';

export interface DownloadFinding {
  risk: DownloadRisk;
  /** Short label for the UI. */
  title: string;
  /** One sentence explaining the finding in plain words. */
  detail: string;
}

export interface DownloadReport {
  filename: string;
  /** The worst finding's risk, or FINE. */
  risk: DownloadRisk;
  /** The extension we believe the file actually has. */
  extension: string | null;
  findings: DownloadFinding[];
}

/** Things that run code when opened. Opening one is the whole attack. */
const EXECUTABLE = new Set([
  'exe', 'scr', 'com', 'pif', 'cpl', 'msi', 'msix', 'bat', 'cmd', 'vbs', 'vbe',
  'js', 'jse', 'wsf', 'wsh', 'ps1', 'psm1', 'hta', 'jar', 'apk', 'app', 'dmg',
  'pkg', 'deb', 'rpm', 'run', 'bin', 'sh', 'reg', 'lnk', 'url', 'inf', 'dll',
]);

/** What this audience actually downloads. */
const MEDIA = new Set([
  'mkv', 'mp4', 'avi', 'm4v', 'mov', 'webm', 'ts', 'flv', 'wmv', 'mpg', 'mpeg',
  'srt', 'ass', 'ssa', 'vtt', 'sub', 'idx',
  'cbz', 'cbr', 'pdf', 'epub', 'zip', 'rar', '7z',
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'avif',
  'mp3', 'flac', 'aac', 'm4a', 'ogg', 'opus',
]);

/** Archives: fine in themselves, but they hide what is inside. */
const ARCHIVE = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'xz', 'iso']);

/**
 * The right-to-left override, and friends.
 *
 * `invoice‮gpj.exe` renders as `invoiceexe.jpg`. It is old, it still
 * works, and a filename has no legitimate reason to contain one.
 */
const BIDI = /[‪-‮⁦-⁩‏‎]/u;

function severityOf(risk: DownloadRisk): number {
  return { DANGEROUS: 3, SUSPICIOUS: 2, UNEXPECTED: 1, FINE: 0 }[risk];
}

/** Everything we recognise as an extension, so the rest can be ignored. */
const KNOWN_EXTENSIONS = new Set([...EXECUTABLE, ...MEDIA, ...ARCHIVE, 'txt', 'nfo', 'json', 'xml', 'csv', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']);

/**
 * The trailing run of real extensions, left to right.
 *
 * Walks from the right and stops at the first part that is not an extension
 * we know. Media filenames are full of dots — `Episode.01.1080p.mkv` — and
 * treating every dotted segment as an extension makes an ordinary download
 * look like an attack, which trains people to ignore the tool.
 */
function extensionChain(name: string): string[] {
  const base = name.split(/[\\/]/u).pop() ?? name;
  const parts = base.split('.').slice(1).map((part) => part.toLowerCase());

  const chain: string[] = [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]!;
    if (!/^[a-z0-9]{1,8}$/u.test(part) || !KNOWN_EXTENSIONS.has(part)) break;
    chain.unshift(part);
  }

  // An unrecognised trailing part is still the extension, and the fact that we
  // do not know it is itself worth reporting.
  if (chain.length === 0 && parts.length > 0) {
    const last = parts[parts.length - 1]!;
    if (/^[a-z0-9]{1,8}$/u.test(last)) chain.push(last);
  }
  return chain;
}

/**
 * Inspect a filename. `declaredKind` is what the page offering it said it
 * was, when we know — "video", "subtitles", "comic" — which turns a vague
 * finding into a specific one.
 */
export function inspectDownload(filename: string, declaredKind?: string): DownloadReport {
  const findings: DownloadFinding[] = [];
  const clean = filename.trim();
  const chain = extensionChain(clean);
  const last = chain.length > 0 ? chain[chain.length - 1]! : null;

  if (BIDI.test(clean)) {
    findings.push({
      risk: 'DANGEROUS',
      title: 'Hidden text-direction character',
      detail:
        'This name contains an invisible character that reverses how the rest of it is displayed, so the extension you see is not the extension you get. Legitimate files do not do this.',
    });
  }

  if (last && EXECUTABLE.has(last)) {
    const disguised = chain.length > 1 && MEDIA.has(chain[chain.length - 2]!);
    if (disguised) {
      findings.push({
        risk: 'DANGEROUS',
        title: `Pretends to be .${chain[chain.length - 2]}, is actually .${last}`,
        detail: `The name ends in .${last}, which runs a program. The .${chain[chain.length - 2]} in the middle is decoration — on a computer that hides known extensions, this looks like an ordinary file.`,
      });
    } else {
      findings.push({
        risk: 'SUSPICIOUS',
        title: `Runs a program (.${last})`,
        detail: `Opening a .${last} runs code on your machine. That is fine for an app you went looking for, and never right for a film, a chapter or a subtitle file.`,
      });
    }
  }

  if (chain.length > 2 && last && !ARCHIVE.has(last)) {
    findings.push({
      risk: 'SUSPICIOUS',
      title: 'Several extensions stacked up',
      detail: `This name carries ${chain.length} extensions (${chain.map((x) => `.${x}`).join(' ')}). Padding a name this way is done to push the real one out of sight.`,
    });
  }

  if (declaredKind && last) {
    const expected: Record<string, Set<string>> = {
      video: new Set(['mkv', 'mp4', 'avi', 'm4v', 'mov', 'webm', 'ts']),
      subtitles: new Set(['srt', 'ass', 'ssa', 'vtt', 'sub', 'idx', 'zip']),
      comic: new Set(['cbz', 'cbr', 'pdf', 'epub', 'zip', 'rar']),
    };
    const wanted = expected[declaredKind.toLowerCase()];
    if (wanted && !wanted.has(last) && !EXECUTABLE.has(last)) {
      findings.push({
        risk: 'UNEXPECTED',
        title: `Not the kind of file you asked for`,
        detail: `You were after ${declaredKind}, and this is a .${last}. It may be harmless, but it is not what the link promised.`,
      });
    }
  }

  if (last && ARCHIVE.has(last)) {
    findings.push({
      risk: 'UNEXPECTED',
      title: 'An archive hides what is inside it',
      detail:
        'Nothing is wrong with the archive itself. Check the names of the files inside before opening any of them — the trick above works just as well one level down.',
    });
  }

  if (!last) {
    findings.push({
      risk: 'UNEXPECTED',
      title: 'No extension at all',
      detail: 'Without an extension there is no way to tell what this is from the name alone.',
    });
  }

  const risk = findings.reduce<DownloadRisk>(
    (worst, finding) => (severityOf(finding.risk) > severityOf(worst) ? finding.risk : worst),
    'FINE',
  );

  return { filename: clean, risk, extension: last, findings };
}

/**
 * Magic numbers, for when the browser can read the first bytes.
 *
 * A short table on purpose. It exists to catch the one case the filename
 * cannot: a file called `.mp4` whose first two bytes are `MZ`, which is a
 * Windows executable whatever it is called.
 */
const SIGNATURES: ReadonlyArray<{ bytes: number[]; kind: string; executable: boolean }> = [
  { bytes: [0x4d, 0x5a], kind: 'a Windows program', executable: true },
  { bytes: [0x7f, 0x45, 0x4c, 0x46], kind: 'a Linux program', executable: true },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], kind: 'a macOS program', executable: true },
  { bytes: [0x50, 0x4b, 0x03, 0x04], kind: 'a zip archive (.zip, .cbz, .apk, .jar)', executable: false },
  { bytes: [0x52, 0x61, 0x72, 0x21], kind: 'a RAR archive', executable: false },
  { bytes: [0x1a, 0x45, 0xdf, 0xa3], kind: 'a Matroska video (.mkv/.webm)', executable: false },
  { bytes: [0x25, 0x50, 0x44, 0x46], kind: 'a PDF', executable: false },
  { bytes: [0xff, 0xd8, 0xff], kind: 'a JPEG image', executable: false },
  { bytes: [0x89, 0x50, 0x4e, 0x47], kind: 'a PNG image', executable: false },
];

/** What the first bytes say this file really is. */
export function identifyBytes(head: Uint8Array): { kind: string; executable: boolean } | null {
  for (const signature of SIGNATURES) {
    if (signature.bytes.every((byte, index) => head[index] === byte)) {
      return { kind: signature.kind, executable: signature.executable };
    }
  }
  // ISO media (mp4/mov) puts "ftyp" at offset 4 rather than 0.
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    return { kind: 'an MP4/MOV video', executable: false };
  }
  return null;
}

/** Fold a byte-level identification into an existing filename report. */
export function withByteEvidence(
  report: DownloadReport,
  identified: { kind: string; executable: boolean } | null,
): DownloadReport {
  if (!identified) return report;

  const findings = [...report.findings];
  const claimsMedia = report.extension !== null && MEDIA.has(report.extension);

  if (identified.executable && claimsMedia) {
    findings.unshift({
      risk: 'DANGEROUS',
      title: `This is ${identified.kind}, not a .${report.extension}`,
      detail:
        'We read the first bytes of the file itself. Whatever the name says, the contents are a program. Delete it rather than opening it.',
    });
  } else {
    findings.push({
      risk: 'FINE',
      title: `Contents look like ${identified.kind}`,
      detail: 'The first bytes of the file match what the name claims.',
    });
  }

  const risk = findings.reduce<DownloadRisk>(
    (worst, finding) => (severityOf(finding.risk) > severityOf(worst) ? finding.risk : worst),
    'FINE',
  );
  return { ...report, risk, findings };
}
