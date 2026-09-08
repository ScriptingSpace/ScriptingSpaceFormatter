import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import type { DashboardPlugin } from '../core';
import { formatterFileStore } from '../../functions';
import { downloadFilesPdf } from './exportFilesToPdf';

// RIGHT side of the header — triggers the pdf-lib export of the SELECTED
// sidebar files into one downloaded PDF (exportFilesToPdf.ts). Clicking it
// with NOTHING selected shows an inline error instead of exporting (there is
// no whole-session fallback — an unintended blank/full export was worse than
// an explicit error). Disabled state is prop-driven: the function value
// receives all non-theme props, including the standard `disabled` button
// attribute (cross-reference: presource/react styled-component.tsx phase 2 —
// function values are called with `rest`, which contains HTML attributes).
const ExportPdfButton = styledComponent<{ disabled: boolean }>(
    'button',
    {
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: 8,
        border: '1px solid #3b82f6',
        background: ({ disabled }) => (disabled ? '#16233b' : '#2563eb'),
        color: ({ disabled }) => (disabled ? '#64748b' : '#ffffff'),
        cursor: ({ disabled }) => (disabled ? 'not-allowed' : 'pointer'),
        flexShrink: 0,
    },
// Cast matches the FileSidebar EntryClose pattern — the element only needs
// standard button attributes (type/onClick/disabled/data-testid)
) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// Header-right wrapper — holds the inline error message LEFT of the export
// button so both fit on one row inside the header slot
const ExportPdfArea = styledComponent('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
});

// Inline error text — red on the dark shell so it reads as a failure, not
// as regular header copy
const ExportError = styledComponent('span', {
    fontSize: 12,
    fontWeight: 600,
    color: '#f87171',
});

// Self-contained header control: reads the shared file session itself (it
// renders inside the FormatterFileProvider) and owns the export-in-progress
// and error states, so the dashboard shell stays a dumb executor.
const ExportPdfControl = () => {
    // Capture the shared store during render — calling the accessor inside
    // an event handler would be an invalid hook call
    const store = formatterFileStore();

    // True while the pdf-lib export is running — guards against double
    // clicks and swaps the button label to an in-progress state
    const exporting = useStateHook(false);
    // Last validation error message (null = no error). Displayed ONLY while
    // the selection is still empty — the moment the user selects a file the
    // error disappears without needing an explicit dismiss.
    const error = useStateHook<string | null>(null);

    // Multi-select export: converts ONLY the SELECTED sidebar files (in
    // selection order) into ONE PDF and triggers the browser download
    // automatically. With nothing selected it sets the error message and
    // exports NOTHING (no whole-session fallback). No-op while an export is
    // already running.
    const handleExportPdf = () => {
        if (exporting()) return;
        const selected = store.activeFileIds
            .map((name) => store.files.find((entry) => entry.name === name))
            .filter((entry): entry is (typeof store.files)[number] => Boolean(entry));
        if (selected.length === 0) {
            // Covers both "no files at all" and "files loaded but none
            // selected" — the fix targets the selected files only
            error('No files selected — select files in the sidebar to export.');
            return;
        }
        error(null);
        exporting(true);
        downloadFilesPdf(selected).finally(() => exporting(false));
    };

    return (
        <ExportPdfArea>
            {/* Error renders only while the selection is still empty —
                selecting a file clears it automatically */}
            {error() !== null && store.activeFileIds.length === 0 ? (
                <ExportError data-testid="export-pdf-error">{error()}</ExportError>
            ) : null}
            <ExportPdfButton
                type="button"
                onClick={handleExportPdf}
                disabled={exporting()}
                data-testid="export-pdf-button"
            >
                {exporting() ? 'Exporting…' : 'Export PDF'}
            </ExportPdfButton>
        </ExportPdfArea>
    );
};

// EXPORT PDF PLUGIN — assigns the Export PDF action button into the header
// slot. It renders no file content (no renderFile), so it never contributes
// a content tab.
export const exportPdfPlugin: DashboardPlugin = {
    id: 'export-pdf',
    slots: {
        header: <ExportPdfControl />,
    },
};
