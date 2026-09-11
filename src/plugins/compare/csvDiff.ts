import { arrayEach } from '@presource/core';

// ─── CSV diff (pure function, no React) ──────────────────────────────────────
// Order-independent comparison of two CSV documents. CSV rows carry no
// guaranteed order, so the comparison NEVER aligns rows by position: every
// row of the first file is matched against its CLOSEST row anywhere in the
// second file. The pairing cascade runs strongest-signal-first:
//
// 1. EXACT pass      — identical full cell lists consume each other
//                      (multiplicity-aware). A 100% match is simply a row
//                      sitting at a different position in the second file —
//                      recognized as the same row, never reported as a
//                      difference.
// 2. KEY pass        — leftover rows pair by equal value in the key column
//                      (the first column name present in BOTH headers;
//                      matched by NAME, not position). Stable ID-based
//                      pairing. Empty keys never pair (no identity).
// 3. SIMILARITY pass — every remaining first-file row is scored against
//                      EVERY remaining second-file row over the common
//                      columns (name-matched): score = fraction of common
//                      columns with equal NON-EMPTY values. Pairs are
//                      consumed greedily in descending score (ties: lower
//                      first-file row number, then lower second-file row
//                      number) so the globally closest matches win. Score-0
//                      candidates are dropped — two rows sharing no
//                      non-empty common value have nothing to compare and
//                      stay unpaired.
// 4. Rows surviving all passes are the MISSING rows: present in only one
//    of the two files.
//
// Every paired couple (all three passes) is reported in `rowMatches` with
// its match percent; differing cells of a pair are reported per column in
// `cellDifferences`.
//
// Row numbers in the results are RAW CSV line numbers (header = line 1,
// first data row = line 2) so they can be looked up directly in the
// original file.

// One reported cell difference — a paired row couple with a differing value
// in a common (shared-name) column.
export type CsvCellDifference = {
    // Value of the key column in the first file's row ('' when the two
    // files share no column at all)
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
    // 0-100 integer — fraction of common columns with equal non-empty
    // values (100 only from the exact pass)
    matchPercent: number;
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

    // Common columns matched by NAME — the comparison basis for every
    // pairing pass (position-independent, so reordered column layouts
    // compare correctly)
    const commonColumns = headersFirst
        .map((name, firstIndex) => ({ name, firstIndex, secondIndex: headersSecond.indexOf(name) }))
        .filter((entry) => entry.secondIndex !== -1);

    // Key column = the FIRST column name present in BOTH headers. Matching
    // the key by NAME (not position) keeps pairing stable across reordered
    // column layouts.
    const keyColumn = commonColumns.length > 0 ? commonColumns[0].name : null;
    const keyIndexFirst =
        keyColumn === null ? -1 : headersFirst.indexOf(keyColumn);

    // Cell-by-cell comparison of a row couple over the COMMON columns
    // (matched by name). Columns missing on one side are already reported in
    // the column section, not as per-cell differences. Missing trailing
    // cells (short rows) read as ''.
    // Empty-vs-empty cells are NOT counted as similarity — an all-empty row
    // has no identity, so it must not pair on trivial empty matches.
    const comparePair = (firstCells: string[], secondCells: string[]) => {
        const differences: { column: string; firstValue: string; secondValue: string }[] = [];
        let matched = 0;
        arrayEach(commonColumns, ({ value: column }) => {
            const firstValue = firstCells[column.firstIndex] ?? '';
            const secondValue = secondCells[column.secondIndex] ?? '';
            if (firstValue === secondValue) {
                if (firstValue !== '') matched += 1;
            } else {
                differences.push({ column: column.name, firstValue, secondValue });
            }
        });
        return {
            differences,
            // 0-100 integer similarity over the common columns
            matchPercent:
                commonColumns.length === 0
                    ? 0
                    : Math.round((matched / commonColumns.length) * 100),
        };
    };

    // ── Pairing state ──
    // Every pass appends consumed couples here; `paired*` sets track
    // consumption BY INDEX INTO THE LEFTOVER ARRAYS (the exact pass consumes
    // directly and never touches them — its rows never become leftovers).
    type CsvPair = {
        firstEntry: CsvMissingRow;
        secondEntry: CsvMissingRow;
        matchPercent: number;
        differences: { column: string; firstValue: string; secondValue: string }[];
    };
    const pairs: CsvPair[] = [];
    const pairedFirst = new Set<number>();
    const pairedSecond = new Set<number>();

    // ── Pass 1: EXACT ──
    // Signature = JSON of the full cell list. Second-side rows are bucketed
    // by signature in row order; each first-side row consumes one bucket
    // entry one-to-one (multiplicity-aware: duplicate rows match
    // one-to-one, extras survive as leftovers). A consumed couple is a 100%
    // match at ANY row position — recognized, never reported as a diff.
    const signature = (cells: string[]): string => JSON.stringify(cells);
    const secondBySignature = new Map<string, { position: number; entry: CsvMissingRow }[]>();
    arrayEach(secondData, ({ index, value: cells }) => {
        const bucket = secondBySignature.get(signature(cells)) ?? [];
        bucket.push({ position: index, entry: { rowNumber: index + 2, cells } });
        secondBySignature.set(signature(cells), bucket);
    });
    const leftoverFirst: CsvMissingRow[] = [];
    arrayEach(firstData, ({ index, value: cells }) => {
        const bucket = secondBySignature.get(signature(cells));
        if (bucket && bucket.length > 0) {
            const counterpart = bucket.shift()!;
            pairs.push({
                firstEntry: { rowNumber: index + 2, cells },
                secondEntry: counterpart.entry,
                matchPercent: 100,
                differences: [],
            });
        } else {
            // Row number: data rows start at raw line 2 (line 1 is the header)
            leftoverFirst.push({ rowNumber: index + 2, cells });
        }
    });
    // Whatever remains in the signature buckets are the second-side
    // leftovers — buckets are signature-grouped, so restore file order
    const leftoverSecond: CsvMissingRow[] = [];
    arrayEach(Array.from(secondBySignature.values()), ({ value: bucket }) => {
        arrayEach(bucket, ({ value: item }) => {
            leftoverSecond.push(item.entry);
        });
    });
    leftoverSecond.sort((a, b) => a.rowNumber - b.rowNumber);

    // ── Pass 2: KEY ──
    // Leftover rows pair by equal NON-EMPTY key value (empty keys carry no
    // identity). Buckets keep second-side rows in row order; consumption is
    // first-come in first-file order.
    if (keyColumn !== null) {
        const keyIndexSecond = headersSecond.indexOf(keyColumn);
        const secondByKey = new Map<string, { position: number; entry: CsvMissingRow }[]>();
        arrayEach(leftoverSecond, ({ index, value: entry }) => {
            const key = entry.cells[keyIndexSecond] ?? '';
            if (key === '') return;
            const bucket = secondByKey.get(key) ?? [];
            bucket.push({ position: index, entry });
            secondByKey.set(key, bucket);
        });
        arrayEach(leftoverFirst, ({ index, value: entry }) => {
            const key = entry.cells[keyIndexFirst] ?? '';
            if (key === '') return;
            const bucket = secondByKey.get(key);
            // No counterpart with the same key → flows into the similarity pass
            if (!bucket || bucket.length === 0) return;
            const counterpart = bucket.shift()!;
            pairedFirst.add(index);
            pairedSecond.add(counterpart.position);
            const { matchPercent, differences } = comparePair(entry.cells, counterpart.entry.cells);
            pairs.push({
                firstEntry: entry,
                secondEntry: counterpart.entry,
                matchPercent,
                differences,
            });
        });
    }

    // ── Pass 3: SIMILARITY (closest match) ──
    // Every remaining first-file row is scored against EVERY remaining
    // second-file row — the match target is the closest row ANYWHERE in the
    // second file, never the same position.
    const remainingFirst = leftoverFirst
        .map((entry, index) => ({ entry, index }))
        .filter((candidate) => !pairedFirst.has(candidate.index));
    const remainingSecond = leftoverSecond
        .map((entry, index) => ({ entry, index }))
        .filter((candidate) => !pairedSecond.has(candidate.index));

    const candidates: {
        firstIndex: number;
        secondIndex: number;
        score: number;
        differences: { column: string; firstValue: string; secondValue: string }[];
    }[] = [];
    arrayEach(remainingFirst, ({ value: firstCandidate }) => {
        arrayEach(remainingSecond, ({ value: secondCandidate }) => {
            const { matchPercent, differences } = comparePair(
                firstCandidate.entry.cells,
                secondCandidate.entry.cells,
            );
            // Score 0 → the couple shares no non-empty common value —
            // nothing to compare, both stay missing rows
            if (matchPercent > 0) {
                candidates.push({
                    firstIndex: firstCandidate.index,
                    secondIndex: secondCandidate.index,
                    score: matchPercent,
                    differences,
                });
            }
        });
    });

    // Greedy global consumption: the best-scoring couple wins regardless of
    // which row was seen first. Ties break by the first file's row number,
    // then the second file's — fully deterministic.
    candidates.sort(
        (a, b) => b.score - a.score || a.firstIndex - b.firstIndex || a.secondIndex - b.secondIndex,
    );
    arrayEach(candidates, ({ value: candidate }) => {
        // Either side was already consumed by a better match → skip
        if (pairedFirst.has(candidate.firstIndex) || pairedSecond.has(candidate.secondIndex)) {
            return;
        }
        pairedFirst.add(candidate.firstIndex);
        pairedSecond.add(candidate.secondIndex);
        const firstCandidate = remainingFirst.find((entry) => entry.index === candidate.firstIndex)!;
        const secondCandidate = remainingSecond.find(
            (entry) => entry.index === candidate.secondIndex,
        )!;
        pairs.push({
            firstEntry: firstCandidate.entry,
            secondEntry: secondCandidate.entry,
            matchPercent: candidate.score,
            differences: candidate.differences,
        });
    });

    // ── Emit ──
    // Pairs sorted by the first file's row number → rowMatches; each pair's
    // differing cells flatten into cellDifferences (header order within a
    // pair, preserved from comparePair)
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

    // Unpaired leftovers are the missing rows (file order preserved — both
    // leftover arrays are built/sorted in row order and the paired sets are
    // index-filtered, which keeps relative order)
    const rowsOnlyInFirst = leftoverFirst.filter((entry, index) => !pairedFirst.has(index));
    const rowsOnlyInSecond = leftoverSecond.filter((entry, index) => !pairedSecond.has(index));

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
