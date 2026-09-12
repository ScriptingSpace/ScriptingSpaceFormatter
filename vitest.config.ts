import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Matches the vitest setup used by every sibling distribution package
// (scribble, template, comfy-dashboard): jsdom + globals + src glob.
// No setupFiles needed — this package does not mount CodeMirror, so the
// ResizeObserver / layout-geometry polyfills used by Scribble are not required.

// Same define as vite.config.ts: vitest.config.ts takes precedence over
// vite.config.ts, so without this the __APP_VERSION__ constant (footer
// version display) would be undefined inside tests.
const pkg = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string };

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.{test,spec}.{ts,tsx}', 'bin/**/*.test.{ts,tsx}'],
        passWithNoTests: true,
    },
});
