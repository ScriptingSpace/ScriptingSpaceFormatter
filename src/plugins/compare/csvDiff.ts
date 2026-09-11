import { arrayEach } from '@presource/core';

// ─── CSV diff (pure function, no React) ──────────────────────────────────────
// Order-independent comparison of two CSV documents. CSV rows carry no
// guaranteed order, so the comparison NEVER aligns rows by position:
//
// 1. Both contents are parsed (RFC-4180-style: quoted fields, escaped
//    quotes, embedded commas/newlines, \r\n line endings).
// 2. COLUMN comparison — headers are matched BY NAME, so a reordered
//    column layout is not reported as a difference. Headers present in
//    only one file are listed as missing columns.
// 3. ROW matching happens in two passes:
//    a. EXACT pass — rows whose full cell list is identical consume each
//       other (multiplicity-aware: duplicate rows match one-to-one).
//    b. KEY pass — leftover rows are paired by their KEY COLUMN value
//       (the first column name present in BOTH headers). Paired rows get
//       a cell-by-cell comparison over the common columns (matched by
//       name) — differing cells are reported as cell differences.
// 4. Rows left unpaired after both passes are the MISSING rows: present
//    in only one of the two files.
//
// Row numbers in the results are RAW CSV line numbers (header = line 1,
// first data row = line 2) so they can be looked up directly in the
// original file.

// One reported cell difference — a key-paired row with a differing value
// in a common (shared-name) column.
export type CsvCellDifference = {
    // Value of the key column in the paired row
    rowKey: string;
    // Raw CSV line numbers (header = 1) of the paired rows
    rowNumberFirst: number;
    rowNumberSecond: number;
    // Column NAME the differing cell belongs to
    column: string;
    firstValue: string;
    secondValue: string;
};

// One missing row — present in only one of the two files.
export type CsvMissingRow = {
    // Raw CSV line number (header = 1, first data row = 2)
    rowNumber: number;
    // The row's cells as parsed (header layout of its own file)
    cells: string[];
};

// Full comparison result — every array is empty when there is nothing to
// report for that category.
export type CsvDiffResult = {
    headersFirst: string[];
    headersSecond: string[];
    // Data-row counts (header row excluded)
    dataRowCountFirst: number;
    dataRowCountSecond: number;
    // Column names present in only one file (header order preserved)
    columnsOnlyInFirst: string[];
    columnsOnlyInSecond: string[];
    // Rows present in only one file (file order preserved)
    rowsOnlyInFirst: CsvMissingRow[];
    rowsOnlyInSecond: CsvMissingRow[];
    // Differing cells on key-paired rows (first-file row order)
    cellDifferences: CsvCellDifference[];
};

// ─── CSV parser ──────────────────────────────────────────────────────────────
// Single-pass character scanner. Handles:
// - quoted fields ("..." may contain commas and newlines)
// - escaped quotes inside quoted fields ("")
// - \n and \r\n line endings (lone \r also treated as a line ending)
// - a trailing line ending does NOT produce an extra row (a trailing
//   newline terminates the last row; only an unterminated final field
//   flushes an extra row)
// Returns one array of string cells per row. Empty content → [].
export const parseCsv = (content: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let index = 0;
    while (index < content.length) {
        const char = content[index];
        if (inQuotes) {
            if (char === '"') {
                // "" inside a quoted field → one literal quote character
                if (content[index + 1] === '"') {
                    field += '"';
                    index += 2;
                    continue;
                }
                // Closing quote → back to unquoted mode (lenient: text after
                // the closing quote on the same field is appended as-is)
                inQuotes = false;
                index += 1;
                continue;
            }
            field += char;
            index += 1;
            continue;
        }
        if (char === '"') {
            // Opening quote → quoted mode (nothing is committed yet)
            inQuotes = true;
            index += 1;
            continue;
        }
        if (char === ',') {
            // Field separator → commit the current field
            row.push(field);
            field = '';
            index += 1;
            continue;
        }
        if (char === '\n' || char === '\r') {
            // \r\n counts as ONE line ending — skip the \n partner
            if (char === '\r' && content[index + 1] === '\n') index += 1;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            index += 1;
            continue;
        }
        field += char;
        index += 1;
    }
    // Final row — flushed only when the content does NOT end with a line
    // ending (a trailing newline already flushed the last row above)
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows;
};

// ─── Comparison ──────────────────────────────────────────────────────────────
export const csvDiff = (firstContent: string, secondContent: string): CsvDiffResult => {
    const firstRows = parseCsv(firstContent);
    const secondRows = parseCsv(secondContent);

    // Row 1 of each parse is the header row; data rows start at raw line 2
    const headersFirst = firstRows[0] ?? [];
    const headersSecond = secondRows[0] ?? [];
    const firstData = firstRows.slice(1);
    const secondData = secondRows.slice(1);

    // ── Column comparison (by NAME, order-independent) ──
    const columnsOnlyInFirst = headersFirst.filter((column) => !headersSecond.includes(column));
    const columnsOnlyInSecond = headersSecond.filter((column) => !headersFirst.includes(column));

    // ── Pass 1: exact full-row matching (order-independent, multiplicity-aware)
    // A row signature is the JSON of its cell list. Each signature matches
    // min(firstCount, secondCount) times; occurrences beyond that matched
    // multiplicity become leftovers on their side.
    const signature = (cells: string[]): string => JSON.stringify(cells);
    const countSignatures = (rows: string[][]): Map<string, number> => {
        const counts = new Map<string, number>();
        arrayEach(rows, ({ value: cells }) => {
            const sig = signature(cells);
            counts.set(sig, (counts.get(sig) ?? 0) + 1);
        });
        return counts;
    };
    const firstCounts = countSignatures(firstData);
    const secondCounts = countSignatures(secondData);

    // Per-signature CONSUMED counters — a row is paired only while the
    // matched multiplicity for its signature is not yet exhausted (an
    // `index >= matched` check would wrongly mark later occurrences of a
    // signature as leftovers even when the side only has `matched` copies)
    const firstConsumed = new Map<string, number>();
    const secondConsumed = new Map<string, number>();

    const leftoverFirst: CsvMissingRow[] = [];
    const leftoverSecond: CsvMissingRow[] = [];
    arrayEach(firstData, ({ index, value: cells }) => {
        const sig = signature(cells);
        const matched = Math.min(firstCounts.get(sig) ?? 0, secondCounts.get(sig) ?? 0);
        const consumed = firstConsumed.get(sig) ?? 0;
        // Row number: data rows start at raw line 2 (line 1 is the header)
        if (consumed < matched) {
            firstConsumed.set(sig, consumed + 1);
        } else {
            leftoverFirst.push({ rowNumber: index + 2, cells });
        }
    });
    arrayEach(secondData, ({ index, value: cells }) => {
        const sig = signature(cells);
        const matched = Math.min(firstCounts.get(sig) ?? 0, secondCounts.get(sig) ?? 0);
        const consumed = secondConsumed.get(sig) ?? 0;
        if (consumed < matched) {
            secondConsumed.set(sig, consumed + 1);
        } else {
            leftoverSecond.push({ rowNumber: index + 2, cells });
        }
    });

    // ── Pass 2: key pairing among leftovers ──
    // Key column = the FIRST column name present in BOTH headers. Matching
    // the key by NAME (not position) keeps pairing stable across reordered
    // column layouts. No common column → pairing is impossible; every
    // leftover stays a missing row.
    const keyColumn = headersFirst.find((column) => headersSecond.includes(column)) ?? null;
    const keyIndexFirst = keyColumn === null ? -1 : headersFirst.indexOf(keyColumn);
    const keyIndexSecond = keyColumn === null ? -1 : headersSecond.indexOf(keyColumn);

    const cellDifferences: CsvCellDifference[] = [];
    // Paired-entry tracking (by index into the leftover arrays) so the
    // unpaired leftovers can be collected preserving each file's row order
    const pairedFirst = new Set<number>();
    const pairedSecond = new Set<number>();

    if (keyColumn !== null) {
        // Bucket second-side leftovers by key value (position kept so the
        // paired set can mark them for exclusion from rowsOnlyInSecond)
        const secondByKey = new Map<
            string,
            { position: number; rowNumber: number; cells: string[] }[]
        >();
        arrayEach(leftoverSecond, ({ index, value: entry }) => {
            const key = entry.cells[keyIndexSecond] ?? '';
            const bucket = secondByKey.get(key) ?? [];
            bucket.push({ position: index, rowNumber: entry.rowNumber, cells: entry.cells });
            secondByKey.set(key, bucket);
        });
        arrayEach(leftoverFirst, ({ index, value: entry }) => {
            const key = entry.cells[keyIndexFirst] ?? '';
            const bucket = secondByKey.get(key);
            // No counterpart with the same key → stays a missing row
            if (!bucket || bucket.length === 0) return;
            const counterpart = bucket.shift()!;
            pairedFirst.add(index);
            pairedSecond.add(counterpart.position);
            // Cell-by-cell comparison over the COMMON columns, matched by
            // name — columns missing on one side are already reported in
            // the column section, not as per-cell differences. Missing
            // trailing cells (short rows) read as ''.
            arrayEach(headersFirst, ({ index: firstIndex, value: column }) => {
                const secondIndex = headersSecond.indexOf(column);
                if (secondIndex === -1) return;
                const firstValue = entry.cells[firstIndex] ?? '';
                const secondValue = counterpart.cells[secondIndex] ?? '';
                if (firstValue !== secondValue) {
                    cellDifferences.push({
                        rowKey: key,
                        rowNumberFirst: entry.rowNumber,
                        rowNumberSecond: counterpart.rowNumber,
                        column,
                        firstValue,
                        secondValue,
                    });
                }
            });
        });
    }

    // Unpaired leftovers are the missing rows
    const rowsOnlyInFirst = leftoverFirst.filter((entry, index) => !pairedFirst.has(index));
    const rowsOnlyInSecond = leftoverSecond.filter((entry, index) => !pairedSecond.has(index));

    return {
        headersFirst,
        headersSecond,
        dataRowCountFirst: firstData.length,
        dataRowCountSecond: secondData.length,
        columnsOnlyInFirst,
        columnsOnlyInSecond,
        rowsOnlyInFirst,
        rowsOnlyInSecond,
        cellDifferences,
    };
};
