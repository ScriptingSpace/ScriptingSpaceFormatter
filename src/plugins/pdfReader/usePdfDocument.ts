import { useEffect } from 'react';
import { useStateHook } from '@presource/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
// Reuses the shared data-URL → bytes decoder (exportFilesToPdf.ts) instead of
// duplicating the base64 logic — same helper the Export PDF button uses
import { decodeDataUrl } from '../exportPdf/exportFilesToPdf';
import { configurePdfWorker, getDocument } from './pdfjs';

// ─── PDF document loading hook ───────────────────────────────────────────────
// Loads a PDFDocumentProxy from a data URL (the shape readTextFile stores for
// kind 'pdf'). Pure state machine: loading → ready | error.

export type PdfDocumentState = {
    status: 'loading' | 'ready' | 'error';
    doc: PDFDocumentProxy | null;
    // Total page count — available as soon as the document resolves
    numPages: number;
    // Human-readable failure reason for the error state
    error: string | null;
};

const INITIAL_STATE: PdfDocumentState = {
    status: 'loading',
    doc: null,
    numPages: 0,
    error: null,
};

// Formats any thrown value into a short message for the error UI
const describeError = (error: unknown): string =>
    error instanceof Error && error.message ? error.message : 'The PDF could not be opened.';

export const usePdfDocument = (dataUrl: string): PdfDocumentState => {
    const state = useStateHook<PdfDocumentState>(INITIAL_STATE);

    useEffect(() => {
        // Cancellation flag: state writes after unmount / data-URL change are
        // suppressed. The loaded document is destroyed on teardown so pdf.js
        // frees its worker resources when the viewer closes.
        let cancelled = false;
        let loaded: PDFDocumentProxy | null = null;

        const run = async () => {
            try {
                await configurePdfWorker();
                // Decode fresh per load — pdf.js DETACHES the buffer it is
                // handed (transfers it to the worker), so reusing one decoded
                // array across loads would break the second open
                const data = decodeDataUrl(dataUrl);
                const task = getDocument({ data });
                loaded = await task.promise;
                if (cancelled) return;
                state({ status: 'ready', doc: loaded, numPages: loaded.numPages, error: null });
            } catch (error) {
                if (cancelled) return;
                state({ status: 'error', doc: null, numPages: 0, error: describeError(error) });
            }
        };
        void run();

        return () => {
            cancelled = true;
            // destroy() terminates the document's worker resources; guarded —
            // a still-loading task has no document to destroy
            loaded?.destroy();
        };
        // `state` is a stable handle (useStateHook contract) — the data URL is
        // the only real dependency: a re-drop/re-select reloads the document
    }, [dataUrl]);

    return state();
};
