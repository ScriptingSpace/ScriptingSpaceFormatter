import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import { csvJoin } from './csvJoin';
import type { CsvJoinFile, CsvJoinResult } from './csvJoin';

// ─── Multi-file CSV join view ────────────────────────────────────────────────
// Renders the csvJoin result (csvJoin.ts) as a TRANSPOSED side-by-side table:
//
//   ┌──────────┬──────────────┬──────────────┬──────────────┐
//   │ Header   │ a.csv  [1] ▦ │ a.csv  [1] ▦ │ b.csv  [1] ▦ │   ← file head
//   │          │ entry1 entry2│ entry3 entry4│ entry1 entry2│     spans its
//   │ id       │ 1      2     │ ...          │ ...          │     entry cols
//   │ name     │ Ann    Bob   │              │              │
//   └──────────┴──────────────┴──────────────┴──────────────┘
//
// - FIRST column ("Header"): the FIRST file's selected header row, one
//   table row per header cell — "the first column is the header selected of
//   the first file". Later files' header rows are NOT rendered (cross-
//   reference: csvJoin.ts).
// - Each file's DATA ENTRIES (rows after that file's header row) become
//   COLUMNS, grouped under the file's head cell left to right; entry cells
//   align with the header labels by index. Row count = the longest entry
//   (labels run blank past the first file's header list).
// - EACH file's head cell carries its own number input (one per file, NOT
//   shared) selecting which raw CSV line is that file's header row; the
//   first file's selector therefore also drives the "Header" column.
// - Hover cross-highlighting: hovering a value cell tints it gray AND every
//   OTHER cell in the same table row (any entry column) that holds the SAME
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

// Grid for the transposed table. Layout: header-label column | one grid
// column per ENTRY (files' entries grouped left to right in selection
// order). The label column hugs its content; entry columns share the rest.
const JoinTable = styledComponent<{ entryColumns: number }>('div', {
    display: 'grid' as const,
    gridTemplateColumns: ({ entryColumns }) =>
        `minmax(90px, max-content) repeat(${entryColumns}, minmax(0, 1fr))`,
    width: 'max-content' as const,
    minWidth: '100%',
    gap: '2px 12px',
});

// File head cell — sits in the strip row ABOVE the file's entry columns and
// spans exactly those columns (`entryCount`, minimum 1 so a file with no
// data rows still keeps its selector aligned over a blank column). Holds
// the file name + the PER-FILE header-row input.
const FileHead = styledComponent<{ entryCount: number }>('span', {
    gridColumn: ({ entryCount }) => `span ${Math.max(entryCount, 1)}`,
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    fontWeight: 700,
    color: '#64748b',
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid #1e293b',
    paddingBottom: 2,
});

// The per-file header-row number input — styled to match the shell's
// control family
const HeaderRowInput = styledComponent('input', {
    width: 48,
    padding: '2px 4px',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: '#0f172a',
    color: '#e2e8f0',
}) as unknown as React.FC<React.InputHTMLAttributes<HTMLInputElement>>;

// Left-column header-label cell — visually distinct (muted bold) so the
// header labels read as row titles rather than data
const HeaderLabel = styledComponent('span', {
    fontWeight: 700,
    color: '#94a3b8',
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
// (files, per-file header rows) input tuple.
export const FileCsvJoinView = ({
    files,
}: {
    files: { name: string; content: string }[];
}) => {
    // PER-FILE header row positions (1-based raw CSV line number, default
    // 1), keyed by file name so selection changes (files added/removed)
    // never desync the state array. The input keeps its raw text so clearing
    // it does not snap mid-edit; the committed value feeds the join
    // (invalid/empty → 1). useStateHook is an accessor function (read with
    // no args, write with one), NOT an array-destructuring hook like React's
    // useState.
    const headerRowInputs = useStateHook<Record<string, string>>({});
    // Hover cross-highlighting — TWO pieces of state:
    // - hoveredCellId: identity of the exact hovered cell
    //   (`r<row>-f<file>-c<column>`, null = nothing hovered). Identity is
    //   needed because a same-value cell must get the MATCHED tint, not the
    //   hovered tint — value alone cannot distinguish the hovered cell from
    //   its twins.
    // - hoveredValue: the hovered cell's RAW text, used to find same-value
    //   cells anywhere else in the same table row (any entry column).
    const hoveredCellId = useStateHook<string | null>(null);
    const hoveredValue = useStateHook<string | null>(null);

    // Raw input text → 1-based header row number (invalid/empty → 1)
    const resolveHeaderRow = (raw: string | undefined): number => {
        const parsed = Number.parseInt(raw ?? '', 10);
        return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    };

    const result: CsvJoinResult = csvJoin(files, {
        // One selector per file, in selection order — file 0's selector
        // drives the "Header" column as well as its own data start
        headerRows: files.map((file) => resolveHeaderRow(headerRowInputs()[file.name])),
    });

    // A file with no entry columns still occupies ONE grid column (blank)
    // so CSS grid auto-placement keeps every later file's cells aligned
    // under its own head — every row must emit the same cell count.
    const fileColumnCount = (file: CsvJoinFile): number => Math.max(file.columns.length, 1);

    // Total grid columns = label column + every file's entry columns
    const entryColumns = result.files.reduce((sum, file) => sum + fileColumnCount(file), 0);

    // Row count = the LONGEST entry (files may have different column counts
    // AND entries with different cell counts; shorter cells render blank)
    const rowCount = result.files.reduce(
        (max, file) =>
            file.columns.reduce((fileMax, entry) => Math.max(fileMax, entry.length), max),
        0,
    );

    return (
        <CsvFrame data-testid="file-csv-join">
            {/* Transposed table — first column: first file's header labels;
                then, per file, its data entries as columns grouped under the
                file's head (name + per-file header-row input). Row count =
                longest entry across all files. */}
            <JoinTable entryColumns={entryColumns} data-testid="csv-join-table">
                {/* Corner cell + per-file head strip (each head spans its
                    file's entry columns) */}
                <HeaderLabel>Header</HeaderLabel>
                {result.files.map((file, fileIndex) => (
                    <FileHead
                        key={`head-${file.name}-${fileIndex}`}
                        entryCount={file.columns.length}
                        data-testid={`csv-join-file-head-${fileIndex}`}
                    >
                        {file.name}
                        {/* PER-FILE header-row selector — which raw CSV line
                            is THIS file's header row (1-based; rows before
                            it are ignored as preamble, rows after it become
                            its entry columns). File 0's selector also drives
                            the "Header" label column. */}
                        <HeaderRowInput
                            type="number"
                            min={1}
                            value={headerRowInputs()[file.name] ?? '1'}
                            onChange={(event) =>
                                headerRowInputs({
                                    ...headerRowInputs(),
                                    [file.name]: event.target.value,
                                })
                            }
                            data-testid={`csv-join-header-row-${fileIndex}`}
                        />
                    </FileHead>
                ))}

                {/* One table row per header-label position: the left cell is
                    the first file's header label (blank past its header
                    list); then every file's entry columns show the cell at
                    this label index — entry[k][j] aligns under label j. */}
                {Array.from({ length: rowCount }, (_, rowIndex) => (
                    <React.Fragment key={`row-${rowIndex}`}>
                        <HeaderLabel data-testid="csv-join-header-label">
                            {result.headers[rowIndex] ?? '\u00a0'}
                        </HeaderLabel>
                        {result.files.map((file, fileIndex) =>
                            // Fixed cell count per file (min 1) keeps grid
                            // auto-placement aligned; entries shorter than
                            // the table / missing columns read as ''
                            Array.from({ length: fileColumnCount(file) }, (_, columnIndex) => {
                                // Missing trailing cells read as '' — no
                                // padding in csvJoin
                                const raw = file.columns[columnIndex]?.[rowIndex] ?? '';
                                const cellId = `r${rowIndex}-f${fileIndex}-c${columnIndex}`;
                                return (
                                    <ValueCell
                                        key={`cell-${rowIndex}-${fileIndex}-${columnIndex}`}
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
                            }),
                        )}
                    </React.Fragment>
                ))}
            </JoinTable>
        </CsvFrame>
    );
};
