// ─────────────────────────────────────────────────────────────────────────────
// bin/scaffold.js — pure template builders for the npx launcher host app.
//
// Cross-ref: bin/formatter.js (the bin entry) writes these templates into a
// throwaway temp dir, then runs `npm install` + the Vite dev server there.
// Cross-ref: src/main.tsx / index.html / vite.config.ts — the templates mirror
// the package's own app scaffolding, but import `FormatterDashboard` from the
// installed library barrel (src/index.ts → lib/index.js) instead of the
// workspace src.
//
// Kept 100% side-effect-free (string/object in → string/object out) so
// bin/scaffold.test.ts can assert exact output without touching the fs.
// ─────────────────────────────────────────────────────────────────────────────

// Host package.json — `packageSpec` is the `file:` dependency spec pointing at
// the package's own install location (the npx cache dir when run via npx).
// npm links file: deps (symlink on npm ≥ 7), so the library's own deps
// (@emotion, @presource, pdf-lib, pdfjs-dist, yaml) resolve from the npx
// cache's node_modules while react/vite come from the temp host install.
// Vite 5 + plugin-react 4: stable, Node 18+ compatible pair; the library only
// needs Vite's `?url` import (supported since Vite 3) for the pdf.js worker
// (cross-ref src/plugins/pdfReader/pdfjs.ts:24-26).
export const createHostPackageJson = ({ packageSpec }) => ({
    name: 'formatter-dashboard-host',
    private: true,
    type: 'module',
    dependencies: {
        '@scripting-space/formatter': packageSpec,
        // peerDependencies of the library (cross-ref package.json:39-42) —
        // React 18 pinned so @types/react matches
        react: '^18.2.0',
        'react-dom': '^18.2.0',
    },
    devDependencies: {
        '@types/react': '^18.2.0',
        '@vitejs/plugin-react': '^4.3.0',
        vite: '^5.4.0',
    },
});

// index.html — same shell as the package's own index.html, but the viewport
// lock CSS (cross-ref src/app.css:11-28) is inlined as a <style> tag because
// app.css is app scaffolding and is NOT part of the published lib/ export
// (cross-ref package.json "files": ["lib"]).
export const createIndexHtml = () => `<!doctype html>
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
`;

// src/main.tsx — mirrors the package's own entry (cross-ref src/main.tsx) but
// imports the public barrel export instead of the internal dashboards path.
export const createMainTsx = () => `import React from 'react';
import { createRoot } from 'react-dom/client';
import { FormatterDashboard } from '@scripting-space/formatter';

// Vite app entry — mounts the dashboard into the #root element from index.html
const container = document.getElementById('root') as HTMLElement;
createRoot(container).render(
    <React.StrictMode>
        <FormatterDashboard />
    </React.StrictMode>,
);
`;

// vite.config.mjs — mirrors vite.config.ts (react plugin + __APP_VERSION__
// define). The version constant is required by the dashboard footer
// (cross-ref src/dashboards/FormatterDashboard.tsx:864) and would render as
// `undefined` without the define. Plain object export (no defineConfig) so no
// vite import is needed in the host config.
export const createViteConfig = (version) => `import react from '@vitejs/plugin-react';

export default {
    plugins: [react()],
    define: {
        __APP_VERSION__: ${JSON.stringify(version)},
    },
};
`;
