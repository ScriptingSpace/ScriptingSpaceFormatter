import React from 'react';
import { styledComponent } from '@presource/react';
import type { DashboardPlugin, DashboardSelectionContext } from '../core';
import { FileDiffView } from './FileDiffView';
import { FileCsvDiffView } from './FileCsvDiffView';

// ─── COMPARE PLUGIN ──────────────────────────────────────────────────────────
// File comparison. Hooks ONLY `renderSelection` — the selection-level hook
// that fires when TWO OR MORE sidebar files are selected. The dashboard
// renders the returned node as an extra content tab placed AFTER the focused
// file's plugin tabs (tab label "Compare"). With fewer than two selected
// files the hook never fires, so the tab simply does not exist.
//
// Comparison strategy per selection content:
// - BOTH files are CSV (text kind + .csv extension) → order-independent CSV
//   comparison (csvDiff.ts: missing columns / missing rows / cell
//   differences) rendered by FileCsvDiffView.
// - OTHERWISE all-text → git-style line diff (diffLines.ts) rendered by
//   FileDiffView.
// - Any non-text kind in the selection → no tab at all.

// A text file counts as CSV when its extension is .csv (case-insensitive).
// Kind must already be 'text' — the diffability gate below runs first.
const isCsvFile = (file: { name: string; kind: string }): boolean =>
    file.kind === 'text' && file.name.toLowerCase().endsWith('.csv');

// Non-text files have no line/cell model — the comparison only makes sense
// for text. A selection containing any non-text kind contributes nothing
// (no tab).
const isDiffable = (context: DashboardSelectionContext): boolean =>
    context.files.filter((entry) => context.activeFileIds.includes(entry.name)).every(
        (entry) => entry.kind === 'text',
    );

// The selection-level renderer. Receives the selection snapshot from the
// dashboard (dashboards/FormatterDashboard.tsx builds it from the shared
// store) and compares the FIRST-selected file against the SECOND-selected
// file — git semantics: first = old side (left), second = new side (right).
// Two CSV files → CSV comparison view; otherwise the git-style line diff.
const CompareSelectionView = ({ context }: { context: DashboardSelectionContext }) => {
    // Resolve the selected files in SELECTION order (activeFileIds order —
    // NOT sidebar order): the first-selected file is the diff's "old" side,
    // the second-selected file is the "new" side
    const selected = context.activeFileIds
        .map((name) => context.files.find((entry) => entry.name === name))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    // Fewer than two resolvable selections → nothing to compare
    if (selected.length < 2) return null;

    const first = selected[0];
    const second = selected[1];

    // BOTH sides CSV → order-independent CSV comparison (missing columns /
    // missing rows / cell differences); any other text pair → line diff
    const csvComparison = isCsvFile(first) && isCsvFile(second);

    return (
        <DiffRoot data-testid="file-compare">
            <DiffHeader data-testid="file-compare-header">
                {/* Left (old) side — the FIRST-selected file */}
                <DiffLegend data-testid="file-compare-first">
                    <DiffLegendMarker type="removed">−</DiffLegendMarker>
                    {first.name}
                </DiffLegend>
                {/* Right (new) side — the SECOND-selected file */}
                <DiffLegend data-testid="file-compare-second">
                    <DiffLegendMarker type="added">+</DiffLegendMarker>
                    {second.name}
                </DiffLegend>
            </DiffHeader>
            {csvComparison ? (
                <FileCsvDiffView
                    first={{ name: first.name, content: first.content }}
                    second={{ name: second.name, content: second.content }}
                />
            ) : (
                <FileDiffView
                    first={{ name: first.name, content: first.content }}
                    second={{ name: second.name, content: second.content }}
                />
            )}
        </DiffRoot>
    );
};

// Column wrapper — header strip on top, diff frame filling the rest
const DiffRoot = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#0b1120',
});

// Legend strip mapping the two columns to their file names (git's
// "+++ / ---" header equivalent)
const DiffHeader = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row' as const,
    flexShrink: 0,
    borderBottom: '1px solid #1e293b',
    background: '#0f172a',
});

// One legend half — left/right file name with its −/+ marker
const DiffLegend = styledComponent('span', {
    flex: 1,
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

// The −/+ marker glyph, tinted to match its side's row tint
const DiffLegendMarker = styledComponent<{ type: 'removed' | 'added' }>('span', {
    fontWeight: 700,
    color: ({ type }) => (type === 'removed' ? '#f87171' : '#4ade80'),
});

// ─── Plugin definition ───────────────────────────────────────────────────────

export const comparePlugin: DashboardPlugin = {
    id: 'compare',
    label: 'Compare',
    // Selection-level hook only — the dashboard calls this when two or more
    // files are selected and mounts the returned node as an extra tab after
    // the focused file's plugin tabs
    renderSelection: (context) => {
        // Text-only selections produce a real diff; anything else (image /
        // video / pdf / binary in the selection) contributes no tab
        if (!isDiffable(context)) return null;
        return <CompareSelectionView context={context} />;
    },
};
