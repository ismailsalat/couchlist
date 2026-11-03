import 'server-only';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Taking a screenshot on demand, from the admin pages.
 *
 * A browser does not belong inside a web request — it is hundreds of
 * megabytes and several seconds — so this does not open one. It runs the same
 * capture program the weekly job runs, as a separate process that starts,
 * does one page, and exits, which means the memory is gone the moment it
 * finishes rather than sitting in the server for the rest of the day.
 *
 * Two guards make that safe to expose: only an administrator can reach it,
 * and only one capture runs at a time per server. The second matters more
 * than it looks — without it, ten impatient clicks are ten browsers.
 */

let running = false;

export type CaptureResult =
  | { ok: true }
  | { ok: false; reason: 'busy' | 'no-browser' | 'failed'; message: string };

/** Where the compiled capture program lives, relative to the running app. */
function scriptPath(): string | null {
  const candidates = [
    join(process.cwd(), 'packages/db/dist/scripts/capture-previews.js'),
    join(process.cwd(), '../../packages/db/dist/scripts/capture-previews.js'),
  ];
  return candidates.find((path) => existsSync(path)) ?? null;
}

export async function captureNow(sourceId: string): Promise<CaptureResult> {
  if (running) {
    return {
      ok: false,
      reason: 'busy',
      message: 'Another screenshot is being taken. Try again in a moment.',
    };
  }

  const script = scriptPath();
  if (!script) {
    return {
      ok: false,
      reason: 'no-browser',
      message: 'Screenshots are not set up on this server.',
    };
  }

  running = true;
  try {
    const { stdout, stderr } = await run(
      process.execPath,
      [script, '--source', sourceId, '--approved'],
      {
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
        env: process.env,
      },
    );

    const output = `${stdout}${stderr}`;
    if (output.includes('no_browser_installed')) {
      return {
        ok: false,
        reason: 'no-browser',
        message:
          'No browser is installed on this server, so screenshots cannot be taken here. Upload a picture instead.',
      };
    }
    if (!output.includes('captured ')) {
      return {
        ok: false,
        reason: 'failed',
        message:
          'The site did not give us a usable picture. It may be slow, blocking us, or showing nothing without scrolling.',
      };
    }

    return { ok: true };
  } catch (error) {
    const killed = (error as { killed?: boolean }).killed === true;
    return {
      ok: false,
      reason: 'failed',
      message: killed
        ? 'That site took too long to load. Upload a picture instead.'
        : 'That screenshot did not work. Upload a picture instead.',
    };
  } finally {
    running = false;
  }
}
