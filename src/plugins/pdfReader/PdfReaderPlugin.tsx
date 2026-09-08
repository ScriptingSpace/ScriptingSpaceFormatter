import { styledComponent } from '@presource/react';
import type { DashboardPlugin } from '../core';
import { PdfViewer } from './PdfViewer';

// ─── PDF READER PLUGIN ───────────────────────────────────────────────────────
// Content hook: renders the full PDF reader (pdf.js canvas viewer with page
// navigation, zoom / fit-width, rotation, text search and download) whenever
// a file whose kind is 'pdf' is selected on the sidebar. Other kinds yield
// null so the remaining content plugins take over — exactly one kind matches
// per file, so the default sequence renders directly (no tabs).

// Fallback notice — mirrors the BinaryPlugin notice styling. Defensive only:
// readTextFile guarantees kind 'pdf' files carry a data URL, but a consumer
// crafting a session by hand could pass anything.
const PdfNotice = styledComponent('div', {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center' as const,
    padding: 32,
});

export const pdfReaderPlugin: DashboardPlugin = {
    id: 'pdf',
    label: 'PDF',
    renderFile: (file) => {
        if (file.kind !== 'pdf') return null;
        // A data URL is required to decode the document — anything else gets
        // the notice instead of a broken viewer
        return file.content.startsWith('data:') ? (
            <PdfViewer name={file.name} content={file.content} />
        ) : (
            <PdfNotice data-testid="file-content-pdf-notice">
                {file.name} cannot be previewed — the PDF content is unavailable.
            </PdfNotice>
        );
    },
};
