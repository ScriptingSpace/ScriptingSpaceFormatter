import { arrayEach } from '@presource/core';

// ─── CSV diff (pure function, no React) ──────────────────────────────────────
// Order-independent comparison of two CSV documents. CSV rows carry no
// guaranteed order, so the comparison NEVER aligns rows by position.
//
// Algorithm (global closest-match assignment):
// 1. Both contents are parsed (RFC-4180-style: quoted fields, escaped
//    quotes, embedded commas/newlines, \r\n line endings).
// 2. COLUMN comparison — headers are matched BY NAME, so a reordered
//    column layout is not reported as a difference. Headers present in
//    only one file are listed as missing columns.
// 3. ROW matching — EVERY row of the first file is scored against EVERY
//    row of the second file over the common columns (name-matched):
//    score = fraction of common columns with equal NON-EMPTY values.
//    The full score matrix is then consumed GREEDILY in descending score:
//    the best couple wins globally, both rows are omitted from further
//    checking, and consumption continues down the sorted list. A 100%
//    match is therefore always recognized first — no matter where the row
//    sits in the second file — and both rows are removed from the pool
//    before any weaker couple is considered. Ties break by the first
//    file's row number, then the second's — fully deterministic.
//    Score-0 couples never pair: two rows sharing no non-empty common
//    value have no identity in common.
//    Complexity: O(n·m·c) for n/m rows and c common columns — fine for
//    typical CSV sizes; the exhaustive scan is exactly what makes the
//    match position-independent.
// 4. Rows surviving consumption are the MISSING rows: present in only one
//    of the two files.
//
// Every consumed couple is reported in `rowMatches` with its match
// percent; differing cells of a couple are reported per column in
// `cellDifferences`.
//
// VALUE NORMALIZATION (lossless OFF by default): cell values are compared
// NORMALIZED — leading/trailing whitespace is trimmed ("Retired " ===
// "Retired") and values that parse as finite numbers are canonicalized to
// their number form ("12.00" === "12", "007" === "7"). `options.lossless:
// true` disables normalization → strict raw string comparison. Reported
// cell differences always carry the RAW (unnormalized) values so the user
// sees exactly what is in the files.
//
// Row numbers in the results are RAW CSV line numbers (header = line 1,
// first data row = line 2) so they can be looked up directly in the
// original file.

// One reported cell difference — a paired row couple with a differing value
// in a common (shared-name) column.
export type CsvCellDifference = {
    // Value of the first common column (the key) in the first file's row
    rowKey: string;
    // Raw CSV line numbers (header = 1) of the paired rows
    rowNumberFirst: number;
    rowNumberSecond: number;
    // Column NAME the differing cell belongs to
    column: string;
    firstValue: string;
    secondValue: string;
};

// One matched row couple — the pairing result regardless of whether cells
// differ. 100% matches are rows that are simply at a different position in
// the second file (or identical layouts).
export type CsvRowMatch = {
    // Raw CSV line numbers (header = 1) of the paired rows
    rowNumberFirst: number;
    rowNumberSecond: number;
    // 0-100 integer — fraction of common columns with equal non-empty values
    matchPercent: number;
};

// One missing row — present in only one of the two files.
export type CsvMissingRow = {
    // Raw CSV line number (header = the configured header row; first data
    // row = header row + 1)
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
    // Matched row couples (sorted by the first file's row number) — includes
    // 100% matches (same row, different position)
    rowMatches: CsvRowMatch[];
    // Rows present in only one file (file order preserved)
    rowsOnlyInFirst: CsvMissingRow[];
    rowsOnlyInSecond: CsvMissingRow[];
    // Differing cells on paired rows (first-file row order, then header
    // order within a pair)
    cellDifferences: CsvCellDifference[];
};

// Comparison options. `headerRowFirst` / `headerRowSecond` select WHICH raw
// CSV line is the header row of each file (1-based; default 1). Every row
// AFTER the header row is data; every row BEFORE it is ignored entirely
// (preamble rows some exports prepend). A value beyond the parsed row count
// clamps to the last row (header only, no data rows).
//
// `lossless` (default false): when false, cell values are normalized before
// comparison — trimmed, and numeric-looking values canonicalized ("12.00"
// === "12"). When true, raw string equality is used instead.
export type CsvDiffOptions = {
    headerRowFirst?: number;
    headerRowSecond?: number;
    lossless?: boolean;
};

// ─── Value normalization (lossless OFF) ──────────────────────────────────────
// 1. Trim leading/trailing whitespace ("Retired " → "Retired").
// 2. If the trimmed value is a finite number, canonicalize it to its number
//    form ("12.00" → "12", "007" → "7", "-0" → "0"). Number check uses
//    Number() over the TRIMMED string so " 12.00 " also canonicalizes;
//    Number('') is 0 but the empty string must stay '' — guarded by the
//    trimmed-value emptiness check.
// Non-numeric values keep their trimmed form. Used ONLY for comparison —
// reported cell values stay raw.
const normalizeCellValue = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed === '') return '';
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && trimmed !== '') {
        // String(num) canonicalizes: 12.00 → '12', 007 → '7', -0 → '0'
        return String(asNumber);
    }
    return trimmed;
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
// `options.headerRowFirst` / `options.headerRowSecond` select the header row
// of each file (1-based raw CSV line number, default 1). Data rows are every
// parsed row AFTER the header row; rows BEFORE it are ignored (preamble).
export const csvDiff = (
    firstContent: string,
    secondContent: string,
    options: CsvDiffOptions = {},
): CsvDiffResult => {
    const firstRows = parseCsv(firstContent);
    const secondRows = parseCsv(secondContent);

    // Header selection: 1-based raw line number, clamped to [1, rowCount].
    // Invalid (non-finite / < 1) → default 1. Data rows are everything
    // AFTER the header row; rows BEFORE it are ignored entirely.
    const resolveHeaderIndex = (rowCount: number, requested: number | undefined): number => {
        if (requested === undefined || !Number.isFinite(requested)) return 0;
        return Math.min(Math.max(Math.floor(requested) - 1, 0), Math.max(rowCount - 1, 0));
    };
    const headerIndexFirst = resolveHeaderIndex(firstRows.length, options.headerRowFirst);
    const headerIndexSecond = resolveHeaderIndex(secondRows.length, options.headerRowSecond);

    const headersFirst = firstRows[headerIndexFirst] ?? [];
    const headersSecond = secondRows[headerIndexSecond] ?? [];
    const firstData = firstRows.slice(headerIndexFirst + 1);
    const secondData = secondRows.slice(headerIndexSecond + 1);

    // ── Column comparison (by NAME, order-independent) ──
    const columnsOnlyInFirst = headersFirst.filter((column) => !headersSecond.includes(column));
    const columnsOnlyInSecond = headersSecond.filter((column) => !headersFirst.includes(column));

    // Common columns matched by NAME — the comparison basis for row scoring
    // (position-independent, so reordered column layouts compare correctly)
    const commonColumns = headersFirst
        .map((name, firstIndex) => ({ name, firstIndex, secondIndex: headersSecond.indexOf(name) }))
        .filter((entry) => entry.secondIndex !== -1);

    // Key column = the FIRST common column — its value identifies a paired
    // row in the cell-difference report
    const keyIndexFirst = commonColumns.length > 0 ? commonColumns[0].firstIndex : -1;

    // ── Full score matrix: EVERY first-file row × EVERY second-file row ──
    // Score = fraction of common columns with equal NON-EMPTY values
    // (0-100 integer). Empty-vs-empty does NOT count as similarity — an
    // all-empty row has no identity and must not pair on trivial empty
    // matches. Columns missing on one side are reported in the column
    // section, not as per-cell differences. Missing trailing cells (short
    // rows) read as ''.
    //
    // Lossless OFF (default) → values are normalized (trimmed + numeric
    // canonicalized) before comparison; lossless ON → raw equality. Either
    // way the REPORTED values are the raw ones (firstValue / secondValue
    // keep the untrimmed originals so the user sees the file content).
    const compare = options.lossless === true
        ? (a: string, b: string) => a === b
        : (a: string, b: string) => normalizeCellValue(a) === normalizeCellValue(b);
    type CsvCouple = {
        firstIndex: number;
        secondIndex: number;
        score: number;
        differences: { column: string; firstValue: string; secondValue: string }[];
    };
    const couples: CsvCouple[] = [];
    arrayEach(firstData, ({ index: firstIndex, value: firstCells }) => {
        arrayEach(secondData, ({ index: secondIndex, value: secondCells }) => {
            const differences: { column: string; firstValue: string; secondValue: string }[] = [];
            let matched = 0;
            arrayEach(commonColumns, ({ value: column }) => {
                const firstValue = firstCells[column.firstIndex] ?? '';
                const secondValue = secondCells[column.secondIndex] ?? '';
                // Comparison on (possibly normalized) values; the pushed
                // difference keeps the RAW values for display
                if (compare(firstValue, secondValue)) {
                    // Non-empty check uses the same view as the comparison —
                    // a whitespace-only cell normalizes to '' and must not
                    // count as a matched non-empty value
                    if (normalizeCellValue(firstValue) !== '') matched += 1;
                } else {
                    differences.push({ column: column.name, firstValue, secondValue });
                }
            });
            const score =
                commonColumns.length === 0
                    ? 0
                    : Math.round((matched / commonColumns.length) * 100);
            // Score 0 → the couple shares no non-empty common value —
            // nothing to compare, both stay missing rows
            if (score > 0) {
                couples.push({ firstIndex, secondIndex, score, differences });
            }
        });
    });

    // ── Greedy global consumption, strongest match first ──
    // Sorting descending by score means every 100% couple is consumed
    // before any weaker couple is even considered — a row's exact match
    // anywhere in the second file always wins over a same-position partial
    // match. Ties break by first-file row number, then second-file row
    // number → fully deterministic output.
    couples.sort(
        (a, b) => b.score - a.score || a.firstIndex - b.firstIndex || a.secondIndex - b.secondIndex,
    );
    const consumedFirst = new Set<number>();
    const consumedSecond = new Set<number>();
    const pairs: {
        firstEntry: CsvMissingRow;
        secondEntry: CsvMissingRow;
        matchPercent: number;
        differences: { column: string; firstValue: string; secondValue: string }[];
    }[] = [];
    arrayEach(couples, ({ value: couple }) => {
        // Either side was already consumed by a stronger match → skip
        if (consumedFirst.has(couple.firstIndex) || consumedSecond.has(couple.secondIndex)) {
            return;
        }
        consumedFirst.add(couple.firstIndex);
        consumedSecond.add(couple.secondIndex);
        pairs.push({
            // Row numbers: data rows start at raw line (header row + 1) —
            // the header row itself is the configured headerRow position
            firstEntry: {
                rowNumber: couple.firstIndex + headerIndexFirst + 2,
                cells: firstData[couple.firstIndex],
            },
            secondEntry: {
                rowNumber: couple.secondIndex + headerIndexSecond + 2,
                cells: secondData[couple.secondIndex],
            },
            matchPercent: couple.score,
            differences: couple.differences,
        });
    });

    // ── Emit ──
    // Pairs sorted by the first file's row number → rowMatches; each pair's
    // differing cells flatten into cellDifferences (header order within a
    // pair, preserved from the scoring pass)
    pairs.sort((a, b) => a.firstEntry.rowNumber - b.firstEntry.rowNumber);
    const rowMatches: CsvRowMatch[] = pairs.map((pair) => ({
        rowNumberFirst: pair.firstEntry.rowNumber,
        rowNumberSecond: pair.secondEntry.rowNumber,
        matchPercent: pair.matchPercent,
    }));
    const cellDifferences: CsvCellDifference[] = [];
    arrayEach(pairs, ({ value: pair }) => {
        arrayEach(pair.differences, ({ value: difference }) => {
            cellDifferences.push({
                rowKey: pair.firstEntry.cells[keyIndexFirst] ?? '',
                rowNumberFirst: pair.firstEntry.rowNumber,
                rowNumberSecond: pair.secondEntry.rowNumber,
                column: difference.column,
                firstValue: difference.firstValue,
                secondValue: difference.secondValue,
            });
        });
    });

    // Unconsumed rows are the missing rows (file order preserved — the
    // consumed sets are index-filtered over the original row arrays).
    // Row numbers offset by the configured header row position.
    const rowsOnlyInFirst = firstData
        .map((cells, index) => ({ rowNumber: index + headerIndexFirst + 2, cells }))
        .filter((entry, index) => !consumedFirst.has(index));
    const rowsOnlyInSecond = secondData
        .map((cells, index) => ({ rowNumber: index + headerIndexSecond + 2, cells }))
        .filter((entry, index) => !consumedSecond.has(index));

    return {
        headersFirst,
        headersSecond,
        dataRowCountFirst: firstData.length,
        dataRowCountSecond: secondData.length,
        columnsOnlyInFirst,
        columnsOnlyInSecond,
        rowMatches,
        rowsOnlyInFirst,
        rowsOnlyInSecond,
        cellDifferences,
    };
};
