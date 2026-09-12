import { arrayEach } from '@presource/core';
import { parseCsv } from '../compare/csvDiff';

// ─── Multi-file CSV join (pure function, no React) ───────────────────────────
// Aligns ONE OR MORE CSV documents into a single side-by-side table for the
// CsvJoinPlugin's viewer:
//
//   ┌──────────┬───────────┬───────────┐
//   │ HEADER   │ file-a    │ file-b    │   ← left column = FIRST file's
//   │ id       │ 1         │ 1         │     headers (only), right columns
//   │ name     │ Ann       │ Anna      │     = every file's values in row
//   │ age      │ 20        │ 21        │     order
//   └──────────┴───────────┴───────────┘
//
// NO row matching / scoring happens here (unlike csvDiff.ts) — each file's
// data rows are listed in their own order, one file column per file. The
// join is positional per file: file N's column shows its rows top-to-bottom.
// One file alone is valid (the viewer then shows a single value column).
//
// The header row position is SHARED across all files (one selector in the
// UI controls every file) — `options.headerRow` selects which raw CSV line
// is the header row (1-based; default 1). Rows BEFORE it are ignored
// (preamble); rows AFTER it are data. Per-file clamping follows csvDiff.ts's
// resolveHeaderIndex: a value beyond a file's parsed row count clamps to
// that file's last row (header only, no data rows).

// One file's aligned contribution.
export type CsvJoinFile = {
    // File name (for the value-column header)
    name: string;
    // The file's data rows (after the header row), in file order. Each
    // entry is one COLUMN of the aligned table: cells[0] is the value on
    // the table's first data row, cells[1] the second, and so on.
    columns: string[][];
};

// Full join result.
export type CsvJoinResult = {
    // Header labels — ALWAYS the FIRST file's header row (later files'
    // headers are ignored by design)
    headers: string[];
    // Per-file aligned columns, input order preserved
    files: CsvJoinFile[];
};

// Join options. `headerRow` selects WHICH raw CSV line is the header row in
// EVERY file (1-based; default 1) — one shared selector, not per-file.
export type CsvJoinOptions = {
    headerRow?: number;
};

// Header-row index resolution — same contract as csvDiff.ts's
// resolveHeaderIndex (cross-reference: src/plugins/compare/csvDiff.ts:223):
// 1-based raw line number clamped to [1, rowCount]; invalid (non-finite /
// < 1) → default 1 (index 0). A value beyond the row count clamps to the
// last row (header only, no data rows).
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

    // Shared header-row index — clamped PER FILE (files may have different
    // row counts; the requested line number is the same for all)
    const headerIndices = parsedRows.map((rows) =>
        resolveHeaderIndex(rows.length, options.headerRow),
    );

    // Headers come from the FIRST file only (its clamped header row)
    const headers = parsedRows[0]?.[headerIndices[0]] ?? [];

    // Per-file: everything AFTER the (clamped) header row is data, in file
    // order. Transposed into columns — one column per file, index-aligned
    // with the table's rows so the viewer can zip them with the headers.
    const joinedFiles: CsvJoinFile[] = files.map((file, fileIndex) => {
        const headerIndex = headerIndices[fileIndex];
        const dataRows = parsedRows[fileIndex].slice(headerIndex + 1);
        return {
            name: file.name,
            columns: dataRows.map((cells) => cells),
        };
    });

    return { headers, files: joinedFiles };
};
