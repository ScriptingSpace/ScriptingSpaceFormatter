import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import type { DashboardPlugin } from '../core';
import { formatterFileStore } from '../../functions';
import { downloadFilesPdf } from './exportFilesToPdf';

// RIGHT side of the header — triggers the pdf-lib export of every sidebar
// file into one downloaded PDF (exportFilesToPdf.ts). Disabled state is
// prop-driven: the function value receives all non-theme props, including
// the standard `disabled` button attribute (cross-reference: presource/react
// styled-component.tsx phase 2 — function values are called with `rest`,
// which contains HTML attributes).
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

// Self-contained header control: reads the shared file session itself (it
// renders inside the FormatterFileProvider) and owns the export-in-progress
// state, so the dashboard shell stays a dumb executor.
const ExportPdfControl = () => {
    // Capture the shared store during render — calling the accessor inside
    // an event handler would be an invalid hook call
    const store = formatterFileStore();

    // True while the pdf-lib export is running — guards against double
    // clicks and swaps the button label to an in-progress state
    const exporting = useStateHook(false);

    // Converts every sidebar file into ONE PDF (in drop order) and triggers
    // the browser download automatically. No-op while an export is already
    // running or when the sidebar is empty (button is also visually
    // disabled in that case).
    const handleExportPdf = () => {
        if (exporting() || store.files.length === 0) return;
        exporting(true);
        downloadFilesPdf(store.files).finally(() => exporting(false));
    };

    return (
        <ExportPdfButton
            type="button"
            onClick={handleExportPdf}
            disabled={store.files.length === 0 || exporting()}
            data-testid="export-pdf-button"
        >
            {exporting() ? 'Exporting…' : 'Export PDF'}
        </ExportPdfButton>
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
