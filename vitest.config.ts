import { defineConfig } from 'vitest/config';

// Matches the vitest setup used by every sibling distribution package
// (scribble, template, comfy-dashboard): jsdom + globals + src glob.
// No setupFiles needed — this package does not mount CodeMirror, so the
// ResizeObserver / layout-geometry polyfills used by Scribble are not required.
export default defineConfig({
    test: {
        environment: 'jsdom',
        globals: true,
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        passWithNoTests: true,
    },
});
