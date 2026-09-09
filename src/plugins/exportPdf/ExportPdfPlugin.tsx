import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import type { DashboardPlugin, DashboardMenuItemProps } from '../core';
import { formatterFileStore } from '../../functions';
import { downloadFilesPdf } from './exportFilesToPdf';

// ─── Menu item visuals ───────────────────────────────────────────────────────

// Inline error text inside the menu row — red on the dark panel so it reads
// as a failure, not as regular menu copy
const ExportError = styledComponent('span', {
    fontSize: 12,
    fontWeight: 600,
    color: '#f87171',
    whiteSpace: 'normal' as const,
});

// "Exporting…" in-progress label — replaces the row label while pdf-lib runs
const ExportBusy = styledComponent('span', {
    fontSize: 13,
    fontWeight: 600,
    color: '#94a3b8',
});

// ─── EXPORT PDF menu item ────────────────────────────────────────────────────

// One row inside the dashboard's header dropdown (dashboards/
// FormatterDashboard.tsx — HeaderMenu). Triggers the pdf-lib export of the
// SELECTED sidebar files into one downloaded PDF (exportFilesToPdf.ts).
// Clicking it with NOTHING selected shows an inline error INSIDE the menu
// row instead of exporting (there is no whole-session fallback — an
// unintended blank/full export was worse than an explicit error). The menu
// stays open on error and closes on a successful export start.
const ExportPdfMenuItem = ({ closeMenu }: DashboardMenuItemProps) => {
    // Capture the shared store during render — calling the accessor inside
    // an event handler would be an invalid hook call
    const store = formatterFileStore();

    // True while the pdf-lib export is running — guards against double
    // clicks and swaps the row label to an in-progress state
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
            // selected" — the export targets the selected files only
            error('No files selected — select files in the sidebar to export.');
            // Keep the menu open so the inline error stays visible
            return;
        }
        error(null);
        exporting(true);
        // Close the dropdown as soon as the download is triggered — the
        // action succeeded, the menu's job is done. The export itself
        // continues in the background.
        closeMenu();
        downloadFilesPdf(selected).finally(() => exporting(false));
    };

    // Error renders only while the selection is still empty — selecting a
    // file clears it automatically
    if (error() !== null && store.activeFileIds.length === 0) {
        return <ExportError data-testid="export-pdf-error">{error()}</ExportError>;
    }

    return (
        <ExportBusy data-testid="export-pdf-item" onClick={handleExportPdf}>
            {exporting() ? 'Exporting…' : 'Export selected files as PDF'}
        </ExportBusy>
    );
};

// EXPORT PDF PLUGIN — contributes ONE item ("Export selected files as PDF")
// into the dashboard's header dropdown. It renders no file content (no
// renderFile), so it never contributes a content tab.
export const exportPdfPlugin: DashboardPlugin = {
    id: 'export-pdf',
    menus: [
        {
            id: 'export-pdf',
            label: 'Export selected files as PDF',
            render: ExportPdfMenuItem,
        },
    ],
};
