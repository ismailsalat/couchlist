/**
 * Package the extension into the zip the website serves.
 *
 * Built from source rather than committed as a binary, so the downloadable
 * file cannot drift away from the code that was reviewed. Run by the web
 * build, so a deploy always ships the current version.
 */
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'extension');
const target = path.join(root, 'apps/web/public/couchlist-reader-extension.zip');

const manifest = JSON.parse(await readFile(path.join(source, 'manifest.json'), 'utf8'));
const files = (await readdir(source)).sort();

await mkdir(path.dirname(target), { recursive: true });
await rm(target, { force: true });

// `zip` is in the build image; -X drops extra attributes so the archive is
// byte-identical between builds of the same source.
await run('zip', ['-q', '-X', '-r', target, ...files], { cwd: source });

const written = createWriteStream(path.join(root, 'apps/web/public/.extension-version'));
written.end(`${manifest.version}\n`);

process.stdout.write(
  `Extension ${manifest.version} packaged: ${files.length} files -> ${path.relative(root, target)}\n`,
);
