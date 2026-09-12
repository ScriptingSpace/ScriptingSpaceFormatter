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
// - Each DATA ENTRY (raw CSV row after that file's header row) becomes one
//   COLUMN of the table, its cells aligned with the header labels by index.
// - A second file's entries take the NEXT columns, files laid out left to
//   right in input order. NO row matching / scoring happens here (unlike
//   csvDiff.ts) — the join is positional per file.
// - One file alone is valid (the viewer then shows its entries as columns).
//
// The header row is selected PER FILE: `options.headerRows[i]` selects which
// raw CSV line is the header row in file i (1-based; default 1). Rows BEFORE
// it are ignored (preamble); rows AFTER it are data entries. Per-file
// clamping follows csvDiff.ts's resolveHeaderIndex: a value beyond a file's
// parsed row count clamps to that file's last row (header only, no data).

// One file's aligned contribution.
export type CsvJoinFile = {
    // File name (for the file's column-head in the viewer)
    name: string;
    // The file's OWN selected header row cells. The FIRST file's headers
    // label the table rows; later files' header rows only mark where their
    // data starts (their labels are not rendered).
    headers: string[];
    // The file's data entries (rows after its header row), in file order.
    // Each entry is one COLUMN of the aligned table: entry[k][j] is the
    // value under header-label j.
    columns: string[][];
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
// with the files array (the viewer renders one input box per file column).
export type CsvJoinOptions = {
    headerRows?: (number | undefined)[];
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

    // The table's "Header" column comes from the FIRST file only (its
    // clamped header row); later files' header rows stay per-file in the
    // result but do not label the table
    const headers = parsedRows[0]?.[headerIndices[0]] ?? [];

    // Per file: its header row + everything AFTER it as data entries, in
    // file order. Each entry (parsed row) is kept as one COLUMN — the viewer
    // lays entries out left to right, cells aligned with the header labels.
    const joinedFiles: CsvJoinFile[] = files.map((file, fileIndex) => {
        const headerIndex = headerIndices[fileIndex];
        return {
            name: file.name,
            headers: parsedRows[fileIndex][headerIndex] ?? [],
            columns: parsedRows[fileIndex].slice(headerIndex + 1),
        };
    });

    return { headers, files: joinedFiles };
};
