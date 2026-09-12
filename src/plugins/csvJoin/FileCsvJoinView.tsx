import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import { csvJoin } from './csvJoin';
import type { CsvJoinResult } from './csvJoin';

// ─── Multi-file CSV join view ────────────────────────────────────────────────
// Renders the csvJoin result (csvJoin.ts) as a side-by-side table:
//
//   ┌──────────┬───────────┬───────────┐
//   │ HEADER   │ file-a    │ file-b    │   ← column header strip: the left
//   │ id       │ 1         │ 1         │     cell reads "Header", the value
//   │ name     │ Ann       │ Anna      │     columns carry the file names
//   │ age      │ 20        │ 21        │
//   └──────────┴───────────┴───────────┘
//
// - LEFT column: the FIRST file's headers ONLY (later files' headers are
//   ignored by design — cross-reference: csvJoin.ts). One table row per
//   header label; each file's column shows that file's values in row order.
// - The header-row selector (one number input, default 1) chooses WHICH raw
//   CSV line is the header row — SHARED across all files. Changing it
//   recomputes the whole join.
// - Hover cross-highlighting: hovering a value cell tints it gray AND every
//   OTHER cell in the same table row (any file column) that holds the SAME
//   value blue. State: hoveredCellId (exact cell identity) + hoveredValue
//   (raw text) — value alone cannot distinguish the hovered cell from its
//   same-value twins (same pattern as FileCsvDiffView's hover state).
// - Tints are applied via an inline `style` prop (valueCellHighlightStyle)
//   — styledComponent resolves function values into Emotion CLASS-based CSS
//   which never lands on element.style (cross-reference: the FileCsvDiffView
//   hover incident — jsdom getComputedStyle does not evaluate Emotion's
//   media-wrapped rules, so inline styles are the observable path).

// Outer frame — fills the tab panel, scrolls internally (the dashboard's
// pane never scrolls, this element does)
const CsvFrame = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'auto' as const,
    boxSizing: 'border-box' as const,
    background: '#0b1120',
    color: '#e2e8f0',
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    fontSize: 12,
    lineHeight: 1.5,
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
});

// Header-row selector strip — labeled number input (shared across files)
const HeaderRowBar = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: 16,
    alignItems: 'center' as const,
    flexShrink: 0,
});

// One selector: label + number input
const HeaderRowControl = styledComponent('label', {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: 6,
    alignItems: 'center' as const,
    fontSize: 12,
    color: '#94a3b8',
});

// The number input itself — styled to match the shell's control family
const HeaderRowInput = styledComponent('input', {
    width: 56,
    padding: '4px 6px',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: '#0f172a',
    color: '#e2e8f0',
}) as unknown as React.FC<React.InputHTMLAttributes<HTMLInputElement>>;

// Grid for the joined table. Layout: header label | one column per file.
// The left column hugs its content; the file columns share the rest evenly.
const JoinTable = styledComponent<{ fileCount: number }>('div', {
    display: 'grid' as const,
    gridTemplateColumns: ({ fileCount }) =>
        `minmax(90px, max-content) repeat(${fileCount}, minmax(0, 1fr))`,
    width: 'max-content' as const,
    minWidth: '100%',
    gap: '2px 12px',
});

// Left-column header-label cell — visually distinct (muted bold) so the
// header labels read as row titles rather than data
const HeaderLabel = styledComponent('span', {
    fontWeight: 700,
    color: '#94a3b8',
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid #1e293b',
    paddingBottom: 2,
});

// File-name cell atop each value column
const FileHead = styledComponent('span', {
    fontWeight: 700,
    color: '#64748b',
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid #1e293b',
    paddingBottom: 2,
});

// Value cell — pre-wrap so embedded newlines in cell values stay visible
const ValueCell = styledComponent('span', {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    padding: '0 4px',
    borderRadius: 4,
});

// Inline hover/matched tint for a ValueCell — passed via the `style` prop.
// Precedence: hovered (gray) wins over matched (blue) when both apply.
// Unhighlighted → background '' (omitted) and no outline, so
// `element.style.background` reads '' exactly like the tests assert.
const valueCellHighlightStyle = (hovered?: boolean, matched?: boolean): React.CSSProperties => ({
    background: hovered ? 'rgba(148, 163, 184, 0.25)' : matched ? 'rgba(59, 130, 246, 0.25)' : '',
    outline: matched ? '1px solid rgba(59, 130, 246, 0.5)' : undefined,
});

// ─── Component ───────────────────────────────────────────────────────────────
// Recomputes the join on every render — pure and deterministic for a given
// (files, header row) input tuple.
export const FileCsvJoinView = ({
    files,
}: {
    files: { name: string; content: string }[];
}) => {
    // Header row position (1-based raw CSV line number, default 1) — SHARED
    // across every file. The input keeps its raw text so clearing it does
    // not snap mid-edit; the committed value feeds the join (invalid/empty
    // → 1). useStateHook is an accessor function (read with no args, write
    // with one), NOT an array-destructuring hook like React's useState.
    const headerRowInput = useStateHook('1');
    // Hover cross-highlighting — TWO pieces of state:
    // - hoveredCellId: identity of the exact hovered cell (`r<row>-f<file>`,
    //   null = nothing hovered). Identity is needed because a same-value
    //   cell must get the MATCHED tint, not the hovered tint — value alone
    //   cannot distinguish the hovered cell from its twins.
    // - hoveredValue: the hovered cell's RAW text, used to find same-value
    //   cells anywhere else in the same table row (any file column).
    const hoveredCellId = useStateHook<string | null>(null);
    const hoveredValue = useStateHook<string | null>(null);

    const resolveHeaderRow = (raw: string): number => {
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    };

    const result: CsvJoinResult = csvJoin(files, {
        headerRow: resolveHeaderRow(headerRowInput()),
    });

    // Row count = the LONGEST file column (files may have different data
    // row counts; shorter columns render blank cells for the missing tail)
    const rowCount = result.files.reduce(
        (max, file) => Math.max(max, file.columns.length),
        0,
    );

    return (
        <CsvFrame data-testid="file-csv-join">
            {/* Header-row selector — which raw CSV line is the column header
                in EVERY file (1-based; rows before it are ignored). Changing
                it recomputes the whole join. */}
            <HeaderRowBar data-testid="csv-join-header-row-bar">
                <HeaderRowControl>
                    Header row
                    <HeaderRowInput
                        type="number"
                        min={1}
                        value={headerRowInput()}
                        onChange={(event) => headerRowInput(event.target.value)}
                        data-testid="csv-join-header-row"
                    />
                </HeaderRowControl>
            </HeaderRowBar>

            {/* Joined table — left column: first file's headers; one value
                column per file (file-name header strip on top). Row count =
                longest file column. */}
            <JoinTable fileCount={result.files.length} data-testid="csv-join-table">
                {/* Corner cell + file-name header strip */}
                <HeaderLabel>Header</HeaderLabel>
                {result.files.map((file, fileIndex) => (
                    <FileHead key={`head-${fileIndex}`}>{file.name}</FileHead>
                ))}

                {/* One table row per header label of the FIRST file, then
                    tail rows for files longer than the first file's header
                    list. Each value cell reads the file's data row at this
                    table row — column 0 of the parsed row when the row fits
                    the header layout; for rows beyond the header list the
                    cell shows the row's first cell (a multi-column tail row
                    cannot be aligned without a header to align against). */}
                {Array.from({ length: rowCount }, (_, rowIndex) => (
                    <React.Fragment key={`row-${rowIndex}`}>
                        {/* Left label: the header label while the header list
                            lasts, blank after it runs out */}
                        <HeaderLabel data-testid="csv-join-header-label">
                            {result.headers[rowIndex] ?? '\u00a0'}
                        </HeaderLabel>
                        {result.files.map((file, fileIndex) => {
                            // Missing trailing cells (short rows / shorter
                            // files) read as '' — no padding in csvJoin
                            const raw = file.columns[rowIndex]?.[0] ?? '';
                            const cellId = `r${rowIndex}-f${fileIndex}`;
                            return (
                                <ValueCell
                                    key={`cell-${rowIndex}-${fileIndex}`}
                                    data-testid="csv-join-cell"
                                    style={valueCellHighlightStyle(
                                        hoveredCellId() === cellId,
                                        hoveredCellId() !== null &&
                                            hoveredValue() === raw &&
                                            hoveredCellId() !== cellId,
                                    )}
                                    onMouseEnter={() => {
                                        hoveredCellId(cellId);
                                        hoveredValue(raw);
                                    }}
                                    onMouseLeave={() => {
                                        hoveredCellId(null);
                                        hoveredValue(null);
                                    }}
                                >
                                    {raw === '' ? '\u00a0' : raw}
                                </ValueCell>
                            );
                        })}
                    </React.Fragment>
                ))}
            </JoinTable>
        </CsvFrame>
    );
};
