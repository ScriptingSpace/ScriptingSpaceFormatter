import React from 'react';
import { styledComponent } from '@presource/react';
import type { DashboardPlugin, DashboardSelectionContext } from '../core';
import { FileCsvJoinView } from './FileCsvJoinView';

// ─── COMPARE CSV PLUGIN ──────────────────────────────────────────────────────
// Multi-file side-by-side CSV viewer. Hooks ONLY `renderSelection` — the
// selection-level hook that fires when ONE OR MORE sidebar files are
// selected (cross-reference: dashboards/FormatterDashboard.tsx — selection
// tabs mount after the focused file's plugin tabs; tab label "Compare").
//
// Unlike differenceCsvPlugin (exactly two files, order-dependent diff), this
// viewer accepts ANY selection size — even a single file — as long as every
// selected file is CSV. Layout (FileCsvJoinView): the FIRST file's selected
// header row forms the left "Header" column (one table row per header
// cell); every file's data ENTRIES then become columns grouped under that
// file's head, left to right. EACH file's head carries its own header-row
// input selecting which raw CSV line is that file's header row.
//
// Gate: every selected file must be CSV (text kind + .csv extension,
// case-insensitive — same predicate as differenceCsvPlugin's isCsvFile). Any
// non-CSV file in the selection → no tab (the viewer has no meaningful
// rendering for images / videos / pdfs / generic text).

// A text file counts as CSV when its extension is .csv (case-insensitive).
// Kind must already be 'text' — the all-text gate below runs first.
const isCsvFile = (file: { name: string; kind: string }): boolean =>
    file.kind === 'text' && file.name.toLowerCase().endsWith('.csv');

// Every selected file must be CSV — one non-CSV file in the selection
// contributes no tab at all.
const isJoinable = (context: DashboardSelectionContext): boolean =>
    context.activeFileIds
        .map((name) => context.files.find((entry) => entry.name === name))
        .every((entry) => entry && isCsvFile(entry));

// The selection-level renderer. Receives the selection snapshot from the
// dashboard (dashboards/FormatterDashboard.tsx builds it from the shared
// store) and joins every selected file in SELECTION order (activeFileIds
// order — NOT sidebar order). The FIRST-selected file's selected header row
// becomes the "Header" column; the rest follow with their entry columns.
const CsvJoinSelectionView = ({ context }: { context: DashboardSelectionContext }) => {
    // Resolve the selected files in SELECTION order (activeFileIds order —
    // NOT sidebar order): the first-selected file owns the header column
    const selected = context.activeFileIds
        .map((name) => context.files.find((entry) => entry.name === name))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    // No resolvable selection → nothing to join
    if (selected.length === 0) return null;

    return (
        <JoinRoot data-testid="file-csv-join-plugin">
            {/* Legend strip — every joined file in selection order; the
                first one is marked as the header donor */}
            <JoinHeader data-testid="file-csv-join-header">
                {selected.map((file, index) => (
                    <JoinLegend key={file.name} data-testid={`file-csv-join-legend-${index}`}>
                        {index === 0 ? 'headers: ' : ''}
                        {file.name}
                    </JoinLegend>
                ))}
            </JoinHeader>
            <FileCsvJoinView
                files={selected.map((file) => ({ name: file.name, content: file.content }))}
            />
        </JoinRoot>
    );
};

// Column wrapper — legend strip on top, join frame filling the rest
const JoinRoot = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#0b1120',
});

// Legend strip mapping the value columns to their file names
const JoinHeader = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row' as const,
    flexShrink: 0,
    borderBottom: '1px solid #1e293b',
    background: '#0f172a',
});

// One legend entry — the file name (the first entry is flagged as the
// header donor)
const JoinLegend = styledComponent('span', {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 12px',
    fontSize: 12,
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    color: '#94a3b8',
    overflow: 'hidden' as const,
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis' as const,
});

// ─── Plugin definition ───────────────────────────────────────────────────────

export const compareCsvPlugin: DashboardPlugin = {
    id: 'compareCsv',
    label: 'Compare',
    // Selection-level hook only — fires for ANY selection size (1+ files).
    // All-CSV selections produce the join viewer; anything else contributes
    // no tab.
    renderSelection: (context) => {
        if (!isJoinable(context)) return null;
        return <CsvJoinSelectionView context={context} />;
    },
};
