import { parseCsv } from '../differenceCsv/csvDiff';

// ─── Multi-file CSV join (pure function, no React) ───────────────────────────
// Aligns ONE OR MORE CSV documents into a single TRANSPOSED side-by-side
// table for the CsvJoinPlugin's viewer:
//
//   ┌──────────┬───────────┬───────────┬───────────┬───────────┐
//   │ HEADER   │ a: entry1 │ a: entry2 │ b: entry1 │ b: entry2 │
//   │ id       │ 1         │ 2         │ 1         │ 2         │
//   │ name     │ Ann       │ Bob       │ Anna      │ Robert    │
//   └──────────┴───────────┴───────────┴───────────┴───────────┘
//
// - The FIRST file's selected header row becomes the "Header" COLUMN (one
//   table row per header cell) — cross-reference: FileCsvJoinView.tsx.
// - EACH file contributes exactly ONE displayed ENTRY COLUMN: the raw CSV
//   row picked by `options.entryRows[i]` (default: the first row after that
//   file's header row). Cells align with the header labels by index.
// - The full entry list is still returned per file (`columns`) — the viewer
//   renders only `entry`, the row its head selector points at.
// - NO row matching / scoring happens here (unlike csvDiff.ts) — the join
//   is positional per file.
// - One file alone is valid (the viewer then shows its single entry column).
//
// PER-FILE row selection (both 1-based raw CSV line numbers):
// - `options.headerRows[i]` — which raw line is file i's HEADER row. Rows
//   BEFORE it are ignored (preamble); rows AFTER it are data entries.
//   Per-file clamping follows csvDiff.ts's resolveHeaderIndex: a value
//   beyond a file's parsed row count clamps to that file's last row
//   (header only, no data).
// - `options.entryRows[i]` — which raw line of file i is DISPLAYED as its
//   single entry column. Default: headerIndex + 1 (first data row). An
//   explicit value may point at the header row or a preamble row (it is
//   still "a row of that file"); a value BELOW 1 clamps to line 1. A value
//   BEYOND the file's parsed row count does NOT clamp — the entry index
//   simply points past the rows and the entry renders BLANK (empty).
//   When the header row clamps to a file's LAST row there is no data row
//   after it, so the default entry index falls PAST the last row and the
//   entry renders empty too.

// One file's aligned contribution.
export type CsvJoinFile = {
    // File name (for the file's column-head in the viewer)
    name: string;
    // The file's OWN selected header row cells. The FIRST file's headers
    // label the table rows; later files' header rows only mark where their
    // data starts (their labels are not rendered).
    headers: string[];
    // The file's data entries (all raw rows after its header row), in file
    // order. Each entry is one potential COLUMN of the aligned table:
    // entry[k][j] is the value under header-label j.
    columns: string[][];
    // 0-based raw row index of the DISPLAYED entry (see `entry` below)
    entryIndex: number;
    // The SINGLE entry the viewer renders for this file — the raw row picked
    // by options.entryRows[i] (default: the first row after the header row).
    // Shorter than the header list → the viewer pads blank cells; the row
    // index past the parsed rows → [] → the whole column renders blank.
    entry: string[];
};

// Full join result.
export type CsvJoinResult = {
    // Header labels for the "Header" column — ALWAYS the FIRST file's
    // selected header row
    headers: string[];
    // Per-file aligned entry columns, input order preserved
    files: CsvJoinFile[];
};

// Join options. `headerRows[i]` selects WHICH raw CSV line is the header row
// in file i (1-based; default 1) — one selector PER FILE, aligned by index
// with the files array. `entryRows[i]` selects WHICH raw line of file i is
// displayed as its single entry column (default: first row after the header).
export type CsvJoinOptions = {
    headerRows?: (number | undefined)[];
    entryRows?: (number | undefined)[];
};

// Header-row index resolution — same contract as csvDiff.ts's
// resolveHeaderIndex (cross-reference: src/plugins/differenceCsv/csvDiff.ts:223):
// 1-based raw line number clamped to [1, rowCount]; invalid (non-finite /
// < 1 / undefined) → default 1 (index 0). A value beyond the row count
// clamps to the last row (header only, no data rows).
const resolveHeaderIndex = (rowCount: number, requested: number | undefined): number => {
    if (requested === undefined || !Number.isFinite(requested)) return 0;
    return Math.min(Math.max(Math.floor(requested) - 1, 0), Math.max(rowCount - 1, 0));
};

// Displayed-entry index resolution: undefined / non-finite → the first row
// AFTER the header row (headerIndex + 1 — which may equal rowCount when the
// header row is the last row; the viewer then renders an empty entry). An
// explicit 1-based value clamps only at the BOTTOM (below 1 → line 1) —
// pointing at the header row or a preamble row is deliberate and allowed.
// There is NO upper clamp: a value beyond the file's parsed row count
// leaves the index past the rows and `entry` resolves to [] (BLANK
// column) — the entry row can go beyond the rows available.
const resolveEntryIndex = (
    headerIndex: number,
    requested: number | undefined,
): number => {
    if (requested === undefined || !Number.isFinite(requested)) return headerIndex + 1;
    return Math.max(Math.floor(requested) - 1, 0);
};

export const csvJoin = (
    files: { name: string; content: string }[],
    options: CsvJoinOptions = {},
): CsvJoinResult => {
    // Parse every file once (RFC-4180 parser shared with csvDiff)
    const parsedRows = files.map((file) => parseCsv(file.content));

    // Per-file header-row index — clamped PER FILE (files may have different
    // row counts and different header positions)
    const headerIndices = parsedRows.map((rows, fileIndex) =>
        resolveHeaderIndex(rows.length, options.headerRows?.[fileIndex]),
    );

    // Per-file DISPLAYED-entry index — defaults to the first row after the
    // file's header row; explicit values clamp only at the bottom (beyond
    // the row count → index past the rows → BLANK entry)
    const entryIndices = parsedRows.map((rows, fileIndex) =>
        resolveEntryIndex(headerIndices[fileIndex], options.entryRows?.[fileIndex]),
    );

    // The table's "Header" column comes from the FIRST file only (its
    // clamped header row); later files' header rows stay per-file in the
    // result but do not label the table
    const headers = parsedRows[0]?.[headerIndices[0]] ?? [];

    // Per file: its header row + everything AFTER it as data entries, in
    // file order. `entry` is the SINGLE row the viewer renders for this file
    // (missing past the end → [] so the viewer pads blank cells).
    const joinedFiles: CsvJoinFile[] = files.map((file, fileIndex) => {
        const headerIndex = headerIndices[fileIndex];
        const entryIndex = entryIndices[fileIndex];
        return {
            name: file.name,
            headers: parsedRows[fileIndex][headerIndex] ?? [],
            columns: parsedRows[fileIndex].slice(headerIndex + 1),
            entryIndex,
            entry: parsedRows[fileIndex][entryIndex] ?? [],
        };
    });

    return { headers, files: joinedFiles };
};
