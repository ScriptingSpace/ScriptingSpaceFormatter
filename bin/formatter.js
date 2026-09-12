// ─────────────────────────────────────────────────────────────────────────────
// bin/formatter.js — npx launcher for @scripting-space/formatter.
//
// `npx @scripting-space/formatter@1.0.9` → npm downloads the package into the
// npx cache → runs this file (mapped via package.json "bin") → this script:
//
//   1. locates the package install dir (this file's own directory)
//   2. scaffolds a throwaway Vite host app in the OS temp dir
//   3. `npm install`s the host (library wired in via a `file:` spec)
//   4. spawns the Vite dev server (compiles the dashboard on the fly)
//   5. opens the browser; everything runs until terminated (Ctrl+C / window
//      close), after which the temp dir is removed
//
// Nothing is installed into the user's project — the only persistent trace is
// the npx cache itself (clearable with `npx clear-npx-cache`).
//
// Plain JavaScript with zero imports from the library source: the bin must
// execute directly under Node before any install/compile happens.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from 'node:child_process';
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
    dirname,
    join,
    resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    createHostPackageJson,
    createIndexHtml,
    createMainTsx,
    createViteConfig,
} from './scaffold.js';

// ─── locate the downloaded package ───────────────────────────────────────────
// This file ships inside the package at bin/formatter.js, so the package root
// (with package.json / lib/) is always the directory above bin/. Works both
// under npx (npx cache install dir) and from a checkout (repo working dir).
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Read the installed package.json for the version string (footer display via
// the __APP_VERSION__ define) and the package name.
// Plain readFileSync — no top-level await needed, keeps the startup path sync.
const readPackageJson = () =>
    JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8'));

const { version } = readPackageJson();

// ─── resolve the file: dependency spec ───────────────────────────────────────
// `file:` specs must be absolute paths (npm resolves relative ones against the
// host package.json, which lives in the temp dir — wrong target). Forward
// slashes on all platforms: npm normalizes them internally, and backslashes
// would need escaping inside the JSON template.
const packageSpec = `file:${packageDir.split('\\').join('/')}`;

// ─── scaffold the temp host app ──────────────────────────────────────────────
// mkdtempSync gives a unique dir per run (e.g. …\tmp\formatter-XXXXXX) so two
// concurrent runs never collide. Templates come from scaffold.js — pure string
// builders shared with the unit tests.
const tempDir = mkdtempSync(join(tmpdir(), 'formatter-'));
mkdirSync(join(tempDir, 'src'), { recursive: true });
writeFileSync(join(tempDir, 'package.json'), JSON.stringify(createHostPackageJson({ packageSpec }), null, 4));
writeFileSync(join(tempDir, 'index.html'), createIndexHtml());
writeFileSync(join(tempDir, 'vite.config.mjs'), createViteConfig(version));
writeFileSync(join(tempDir, 'src', 'main.tsx'), createMainTsx());

// ─── npm install in the temp dir ─────────────────────────────────────────────
// Installs react/react-dom/vite/plugin-react into the temp host AND links the
// library itself (file: spec). The library's own dependencies resolve from the
// npx cache's node_modules through the symlink, so nothing is re-downloaded.
// --no-audit/--no-fund: quieter + faster; --loglevel=error keeps output clean.
const install = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: tempDir,
    stdio: 'inherit',
    shell: false,
});

// Any install failure (offline, peer conflict) aborts the whole launcher —
// without node_modules the dev server cannot start. cleanupAndExit is declared
// below via `const` (temporal dead zone) but is only ever invoked from async
// event callbacks, which always run after module evaluation completes.
install.on('close', (code) => {
    if (code !== 0) {
        console.error(`[formatter] npm install failed with exit code ${code}`);
        cleanupAndExit(code ?? 1);
        return;
    }
    startDevServer();
});

// ─── shared cleanup ──────────────────────────────────────────────────────────
// Removes the temp host dir. Called on install failure, dev-server failure and
// process termination (Ctrl+C / SIGTERM / npx teardown). rmSync force:true +
// maxRetries tolerates Windows file locks (vite dep-optimize cache).
const cleanupAndExit = (code) => {
    rmSync(tempDir, { force: true, recursive: true, maxRetries: 5 });
    process.exit(code);
};

// ─── vite dev server ─────────────────────────────────────────────────────────
// Runs until terminated. `shell: true` is required on Windows to execute
// node_modules/.bin/vite (a .cmd shim); on POSIX the .bin/vite symlink works
// with or without a shell. stdio inherit → vite's own startup banner + HMR
// logs stream straight through.
const startDevServer = () => {
    const viteBin = join(tempDir, 'node_modules', '.bin', 'vite');
    const vite = spawn(viteBin, ['--host', '--open'], {
        cwd: tempDir,
        stdio: 'inherit',
        shell: process.platform === 'win32',
    });

    // Vite picks a free port itself when 5173 is taken (no --strictPort:
    // aborting on a busy port would be worse than auto-increment).

    // Propagate termination to the vite child, then clean the temp dir.
    // process.on('SIGINT') keeps the default kill behavior suppressed so we
    // get a chance to clean up first.
    const shutdown = (signal) => {
        vite.kill(signal);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    vite.on('close', (code) => cleanupAndExit(code ?? 0));
    vite.on('error', (error) => {
        console.error(`[formatter] vite failed to start: ${error.message}`);
        cleanupAndExit(1);
    });
};

// npx may keep the parent process alive after the child dies — exit explicitly
// when the event loop drains (e.g. install close already handled above).
process.on('exit', () => {
    // Best-effort sync cleanup is guaranteed here even on hard exit paths.
    try {
        rmSync(tempDir, { force: true, recursive: true, maxRetries: 5 });
    } catch {
        // Temp dir is disposable — a leftover dir in %TEMP% is harmless.
    }
});
