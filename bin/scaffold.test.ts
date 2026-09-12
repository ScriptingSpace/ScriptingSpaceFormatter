// ─────────────────────────────────────────────────────────────────────────────
// bin/scaffold.test.ts — unit tests for the pure template builders used by the
// npx launcher (bin/formatter.js).
//
// Every assertion is exact-output: the templates are deterministic strings /
// objects, so the expected values are hard-coded below. If a template changes
// intentionally, update these snapshots deliberately.
//
// Run: npx vitest run bin/scaffold.test.ts
// ─────────────────────────────────────────────────────────────────────────────

import { describe, expect, it } from 'vitest';

import {
    createHostPackageJson,
    createIndexHtml,
    createMainTsx,
    createViteConfig,
} from './scaffold.js';

describe('createHostPackageJson', () => {
    it('builds the host package manifest with the given file: spec', () => {
        // Exact object assertion — the manifest drives npm install in the temp
        // host, so every field matters (name, private, type, dep versions)
        expect(
            createHostPackageJson({ packageSpec: 'file:/tmp/formatter' }),
        ).toEqual({
            name: 'formatter-dashboard-host',
            private: true,
            type: 'module',
            dependencies: {
                '@scripting-space/formatter': 'file:/tmp/formatter',
                react: '^18.2.0',
                'react-dom': '^18.2.0',
            },
            devDependencies: {
                '@types/react': '^18.2.0',
                '@vitejs/plugin-react': '^4.3.0',
                vite: '^5.4.0',
            },
        });
    });

    it('passes the package spec through verbatim', () => {
        // The spec is produced by bin/formatter.js (file:<absolute path> with
        // forward slashes); the builder must not mutate it
        const spec = 'file:D:/Projects/typescript/noobscript/distribution/ScriptingSpaceFormatter';
        expect(
            createHostPackageJson({ packageSpec: spec }).dependencies[
                '@scripting-space/formatter'
            ],
        ).toBe(spec);
    });
});

describe('createIndexHtml', () => {
    it('emits the exact host HTML shell with inlined viewport-lock CSS', () => {
        // Mirrors src/app.css (html/body/#root lock + dark body theme) because
        // app.css is app scaffolding and never ships in lib/
        expect(createIndexHtml()).toBe(`<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Formatter Dashboard</title>
        <style>
            html,
            body,
            #root {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
            }
            body {
                background: #0f172a;
                color: #e2e8f0;
                font-family: system-ui, -apple-system, 'Segoe UI', Roboto,
                    'Helvetica Neue', Arial, sans-serif;
                -webkit-font-smoothing: antialiased;
                text-rendering: optimizeLegibility;
            }
        </style>
    </head>
    <body>
        <div id="root"></div>
        <script type="module" src="/src/main.tsx"></script>
    </body>
</html>
`);
    });
});

describe('createMainTsx', () => {
    it('emits the exact host entry importing the public barrel export', () => {
        // Import must come from '@scripting-space/formatter' (the published
        // barrel → lib/index.js), not the internal dashboards path used by
        // the package's own src/main.tsx
        expect(createMainTsx()).toBe(`import React from 'react';
import { createRoot } from 'react-dom/client';
import { FormatterDashboard } from '@scripting-space/formatter';

// Vite app entry — mounts the dashboard into the #root element from index.html
const container = document.getElementById('root') as HTMLElement;
createRoot(container).render(
    <React.StrictMode>
        <FormatterDashboard />
    </React.StrictMode>,
);
`);
    });
});

describe('createViteConfig', () => {
    it('embeds the exact version literal into the __APP_VERSION__ define', () => {
        // JSON.stringify produces a double-quoted literal — the dashboard
        // footer reads __APP_VERSION__ (cross-ref
        // src/dashboards/FormatterDashboard.tsx:864) and would render
        // `undefined` without it
        expect(createViteConfig('1.0.9')).toBe(`import react from '@vitejs/plugin-react';

export default {
    plugins: [react()],
    define: {
        __APP_VERSION__: "1.0.9",
    },
};
`);
    });

    it('JSON-escapes the version string', () => {
        // Edge case: a version containing a quote must survive the round-trip
        // through the generated .mjs file
        expect(createViteConfig('1.0.0"hack')).toContain(
            '__APP_VERSION__: "1.0.0\\"hack"',
        );
    });
});
