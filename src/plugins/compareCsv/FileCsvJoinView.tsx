import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import { csvJoin } from './csvJoin';
import type { CsvJoinResult } from './csvJoin';

// ─── Multi-file CSV join view ────────────────────────────────────────────────
// Renders the csvJoin result (csvJoin.ts) as a TRANSPOSED side-by-side table:
//
//   ┌──────────────┬───────────────┬───────────────┐
//   │ Header [1] ▦ │ a.csv [1] ▦   │ b.csv [1] ▦   │   ← column heads
//   │ id           │ 1             │ 1             │   ← ONE entry row
//   │ name         │ Ann           │ Anna          │     per file
//   └──────────────┴───────────────┴───────────────┘
//              ▦ = hover cross-highlight zone
//
// - FIRST column ("Header"): the FIRST file's selected header row, one
//   table row per header cell. Later files' header rows are NOT rendered
//   as labels (cross-reference: csvJoin.ts).
// - UNIFORM head strip: EVERY column head carries ONE incrementer input.
//   The "Header" corner head's incrementer is the SEPARATE header-row
//   selector — it picks which raw CSV line of the FIRST file is the header
//   row that labels the left column. Each file head's incrementer picks
//   which raw line of THAT file is displayed.
// - EACH file contributes exactly ONE entry column: the raw CSV row picked
//   by that file's selector. "Each file can only display one entry row on
//   the UI" — the file's data is not spread over multiple columns anymore;
//   the full entry list stays available in the csvJoin result (`columns`).
// - EACH file's head cell carries exactly ONE number input: which raw CSV
//   line of THAT file is displayed as its single entry column (default:
//   the first row after that file's header row — line 2 for files other
//   than the first). Changing it swaps the displayed row without touching
//   the header selection, so any row of any file can be brought on screen.
// - Row count = max(header label count, longest displayed entry); entries
//   shorter than the label list pad blank cells, longer ones add rows with
//   blank labels.
// - Hover cross-highlighting: hovering a value cell tints it gray AND every
//   OTHER cell in the same table row (any file's entry column) that holds
//   the SAME value blue. State: hoveredCellId (exact cell identity) +
//   hoveredValue (raw text) — value alone cannot distinguish the hovered
//   cell from its same-value twins (same pattern as FileCsvDiffView's hover
//   state).
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
// column per FILE (each file shows exactly one entry column). The label
// column hugs its content; file columns share the rest.
const JoinTable = styledComponent<{ entryColumns: number }>('div', {
    display: 'grid' as const,
    gridTemplateColumns: ({ entryColumns }) =>
        `minmax(90px, max-content) repeat(${entryColumns}, minmax(0, 1fr))`,
    width: 'max-content' as const,
    minWidth: '100%',
    gap: '2px 12px',
});

// File head cell — sits in the strip row ABOVE the file's single entry
// column. Holds the file name + the PER-FILE entry-row number input ONLY
// (the header selection lives on the "Header" corner head — each file's
// head can only adjust its own displayed row).
const FileHead = styledComponent('span', {
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

// The head incrementer inputs — styled to match the shell's control family
const RowInput = styledComponent('input', {
    width: 44,
    padding: '2px 4px',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: '#0f172a',
    color: '#e2e8f0',
}) as unknown as React.FC<React.InputHTMLAttributes<HTMLInputElement>>;

// "Header" corner head — tops the label column and carries the SEPARATE
// header-row incrementer, so EVERY column head has an input (uniform strip)
const CornerHead = styledComponent('span', {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    fontWeight: 700,
    color: '#94a3b8',
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid #1e293b',
    paddingBottom: 2,
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

// Raw input text → 1-based row number; anything invalid/empty → undefined
// so csvJoin applies its own default for that row kind
const resolveRowNumber = (raw: string | undefined): number | undefined => {
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
};

// ─── Component ───────────────────────────────────────────────────────────────
// Recomputes the join on every render — pure and deterministic for a given
// (files, per-file header rows, per-file entry rows) input tuple.
export const FileCsvJoinView = ({
    files,
}: {
    files: { name: string; content: string }[];
}) => {
    // THE header row position — ONE separate input (1-based raw CSV line
    // number, default 1) selecting which line of the FIRST file is the
    // header row that labels the left "Header" column. Files other than
    // the first keep csvJoin's default (line 1); their displayed rows are
    // chosen purely by their own entry selectors. The input keeps its raw
    // text so clearing it does not snap mid-edit; the committed value
    // feeds the join (invalid/empty → 1). useStateHook is an accessor
    // function (read with no args, write with one), NOT an
    // array-destructuring hook like React's useState.
    const headerRowInput = useStateHook<string>('1');
    // PER-FILE displayed-entry row positions (1-based raw CSV line number,
    // default = first row after that file's header row). Keyed by file name
    // for the same desync-proofing.
    const entryRowInputs = useStateHook<Record<string, string>>({});
    // Hover cross-highlighting — TWO pieces of state:
    // - hoveredCellId: identity of the exact hovered cell
    //   (`r<row>-f<file>`, null = nothing hovered). Identity is needed
    //   because a same-value cell must get the MATCHED tint, not the
    //   hovered tint — value alone cannot distinguish the hovered cell
    //   from its twins.
    // - hoveredValue: the hovered cell's RAW text, used to find same-value
    //   cells anywhere else in the same table row (any file's column).
    const hoveredCellId = useStateHook<string | null>(null);
    const hoveredValue = useStateHook<string | null>(null);

    const result: CsvJoinResult = csvJoin(files, {
        // The SEPARATE header-row input selects the header row of the FIRST
        // file only (it labels the "Header" column); every other file keeps
        // csvJoin's default. Each file's entry selector picks the ONE row
        // of that file shown on screen.
        headerRows: files.map((_, fileIndex) =>
            fileIndex === 0 ? resolveRowNumber(headerRowInput()) : undefined,
        ),
        entryRows: files.map((file) => resolveRowNumber(entryRowInputs()[file.name])),
    });

    // Row count = max(header label count, longest displayed entry) — files
    // may have entries with different cell counts; shorter cells blank
    const rowCount = result.files.reduce(
        (max, file) => Math.max(max, file.entry.length),
        result.headers.length,
    );

    return (
        <CsvFrame data-testid="file-csv-join">
            {/* Transposed table — first column: first file's header labels;
                then ONE column per file showing the single entry row picked
                by that file's head input. Row count = max(labels, longest
                entry across files). */}
            <JoinTable entryColumns={result.files.length} data-testid="csv-join-table">
                {/* UNIFORM head strip: the "Header" corner head carries the
                    SEPARATE header-row incrementer (first file only); each
                    file head carries its own displayed-row incrementer. */}
                <CornerHead data-testid="csv-join-header-corner">
                    Header
                    {/* SEPARATE header-row selector — picks which raw line
                        of the FIRST file is the header row (1-based) that
                        labels the left "Header" column. Styled identical to
                        the file heads' incrementers so the strip is uniform. */}
                    <RowInput
                        type="number"
                        min={1}
                        title="Header row of the first file"
                        value={headerRowInput()}
                        onChange={(event) => headerRowInput(event.target.value)}
                        data-testid="csv-join-header-row"
                    />
                </CornerHead>
                {result.files.map((file, fileIndex) => (
                    <FileHead
                        key={`head-${file.name}-${fileIndex}`}
                        data-testid={`csv-join-file-head-${fileIndex}`}
                    >
                        {file.name}
                        {/* PER-FILE entry selector — the ONLY control on the
                            file head: which raw CSV line OF THIS FILE is
                            displayed as its single entry column (1-based;
                            default = first row after its header row, shown
                            via the clamped entryIndex). A number BEYOND the
                            file's rows leaves the column BLANK. */}
                        <RowInput
                            type="number"
                            min={1}
                            title={`Displayed row of ${file.name}`}
                            value={entryRowInputs()[file.name] ?? String(file.entryIndex + 1)}
                            onChange={(event) =>
                                entryRowInputs({
                                    ...entryRowInputs(),
                                    [file.name]: event.target.value,
                                })
                            }
                            data-testid={`csv-join-entry-row-${fileIndex}`}
                        />
                    </FileHead>
                ))}

                {/* One table row per label position: the left cell is the
                    first file's header label (blank past its header list);
                    then every file's column shows the cell at this label
                    index — entry[j] aligns under label j. */}
                {Array.from({ length: rowCount }, (_, rowIndex) => (
                    <React.Fragment key={`row-${rowIndex}`}>
                        <HeaderLabel data-testid="csv-join-header-label">
                            {result.headers[rowIndex] ?? '\u00a0'}
                        </HeaderLabel>
                        {result.files.map((file, fileIndex) => {
                            // Missing trailing cells read as '' — no
                            // padding in csvJoin
                            const raw = file.entry[rowIndex] ?? '';
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
