import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

// ─── pdf.js access layer ─────────────────────────────────────────────────────
// Single module that owns every direct pdfjs-dist interaction. Isolating it
// here means tests can `vi.mock('pdfjs-dist', …)` once and the rest of the
// plugin (viewer, plugin definition, hooks) stays pdfjs-free.

// Re-exported so the viewer/hook never import 'pdfjs-dist' themselves.
export { getDocument, GlobalWorkerOptions };

// Resolves the pdf.js worker source. The `?url` import is resolved at Vite
// build time to a hashed asset URL (vite/client's ambient `*?url` module
// declaration keeps `tsc --noEmit` and `tsconfig.build.json` happy).
//
// Lazy + guarded on purpose:
// - called only when a PDF is actually opened (no worker fetch for apps that
//   never use the PDF plugin)
// - a bundler without `?url` support throws on the dynamic import → swallowed,
//   and pdf.js falls back to its main-thread "fake worker" mode
export const configurePdfWorker = async (): Promise<void> => {
    // Already configured (or a previous run succeeded) → no-op
    if (GlobalWorkerOptions.workerSrc) return;
    try {
        const { default: workerUrl } = await import(
            'pdfjs-dist/build/pdf.worker.min.mjs?url'
        );
        GlobalWorkerOptions.workerSrc = workerUrl;
    } catch {
        // Fake-worker fallback: pdf.js runs on the main thread. Slower, but
        // every feature keeps working.
    }
};
