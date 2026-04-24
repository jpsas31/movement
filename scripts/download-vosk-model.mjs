#!/usr/bin/env node
// Idempotent downloader for the Vosk Spanish model used by backend/main.py.
// Cross-platform: macOS, Linux, Windows. Safe to run repeatedly.
import { existsSync, mkdirSync, createWriteStream, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import https from 'node:https';

const MODEL_NAME = process.env.VOSK_MODEL_NAME ?? 'vosk-model-es-0.42';
const MODEL_URL =
  process.env.VOSK_MODEL_URL ?? `https://alphacephei.com/vosk/models/${MODEL_NAME}.zip`;
const MODELS_DIR = process.env.MODELS_DIR ?? 'backend/models';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(repoRoot);

const targetDir = join(MODELS_DIR, MODEL_NAME);
const sentinel = join(targetDir, 'conf', 'model.conf');

if (existsSync(targetDir) && existsSync(sentinel)) {
  console.log(`[vosk] model already present: ${targetDir}`);
  process.exit(0);
}

console.log(`[vosk] downloading ${MODEL_NAME} (~1.4 GB)...`);
mkdirSync(MODELS_DIR, { recursive: true });

const tmpZip = join(tmpdir(), `vosk-model-${process.pid}-${Date.now()}.zip`);

function download(url, dest, redirects = 5) {
  return new Promise((resolveP, rejectP) => {
    https
      .get(url, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          if (redirects <= 0) return rejectP(new Error('too many redirects'));
          const next = new URL(res.headers.location, url).toString();
          res.resume();
          return resolveP(download(next, dest, redirects - 1));
        }
        if (res.statusCode !== 200) {
          return rejectP(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const total = Number(res.headers['content-length'] ?? 0);
        let received = 0;
        let lastPct = -1;
        const file = createWriteStream(dest);
        res.on('data', (chunk) => {
          received += chunk.length;
          if (total) {
            const pct = Math.floor((received / total) * 100);
            if (pct !== lastPct && pct % 5 === 0) {
              process.stdout.write(
                `\r[vosk] ${pct}% (${(received / 1e6).toFixed(1)} MB)`,
              );
              lastPct = pct;
            }
          }
        });
        res.pipe(file);
        file.on('finish', () =>
          file.close(() => {
            if (total) process.stdout.write('\n');
            resolveP();
          }),
        );
        file.on('error', rejectP);
      })
      .on('error', rejectP);
  });
}

function extract(zip, outDir) {
  if (process.platform === 'win32') {
    // PowerShell Expand-Archive ships with Windows 10+.
    const psZip = zip.replace(/'/g, "''");
    const psOut = resolve(outDir).replace(/'/g, "''");
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -Path '${psZip}' -DestinationPath '${psOut}' -Force`,
      ],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error('Expand-Archive failed');
  } else {
    const result = spawnSync('unzip', ['-q', zip, '-d', outDir], {
      stdio: 'inherit',
    });
    if (result.status !== 0) throw new Error('unzip failed');
  }
}

try {
  await download(MODEL_URL, tmpZip);
  console.log(`[vosk] extracting to ${MODELS_DIR}...`);
  extract(tmpZip, MODELS_DIR);
  if (!existsSync(targetDir)) {
    console.error(`[vosk] extracted layout unexpected; expected ${targetDir}`);
    process.exit(1);
  }
  console.log(`[vosk] ready: ${targetDir}`);
} finally {
  try {
    rmSync(tmpZip, { force: true });
  } catch {
    /* ignore */
  }
}
