import { describe, it, expect } from 'vitest';
import { parseCsv, csvDiff } from './csvDiff';

// ─── csvDiff — order-independent CSV comparison, global closest-match ────────
// Every assertion pins the EXACT expected output (full objects/arrays, raw
// line numbers, exact cell values). Line-number model: header = line 1,
// first data row = line 2 (raw CSV line numbers, matching the file text).
//
// Algorithm: EVERY first-file row is scored against EVERY second-file row
// (fraction of common columns with equal non-empty values); the score
// matrix is consumed greedily strongest-first — the best couple wins
// globally, both rows are omitted from further checking. Score-0 couples
// never pair. Unconsumed rows are the missing rows.

describe('parseCsv', () => {
    it('parses simple comma-separated rows', () => {
        expect(parseCsv('a,b,c\n1,2,3')).toEqual([
            ['a', 'b', 'c'],
            ['1', '2', '3'],
        ]);
    });

    it('returns [] for empty content', () => {
        expect(parseCsv('')).toEqual([]);
    });

    it('does not emit an extra row for a trailing newline', () => {
        expect(parseCsv('a,b\n1,2\n')).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });

    it('handles \r\n line endings', () => {
        expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
            ['a', 'b'],
            ['1', '2'],
        ]);
    });

    it('keeps commas and newlines inside quoted fields', () => {
        expect(parseCsv('a,"x,y",c\n1,"line1\nline2",3')).toEqual([
            ['a', 'x,y', 'c'],
            ['1', 'line1\nline2', '3'],
        ]);
    });

    it('unescapes doubled quotes inside quoted fields', () => {
        expect(parseCsv('"he said ""hi""",b')).toEqual([['he said "hi"', 'b']]);
    });
});

describe('csvDiff — identical / reordered content', () => {
    it('reports nothing for identical CSVs', () => {
        expect(csvDiff('id,name\n1,Ann\n2,Bob', 'id,name\n1,Ann\n2,Bob')).toEqual({
            headersFirst: ['id', 'name'],
            headersSecond: ['id', 'name'],
            dataRowCountFirst: 2,
            dataRowCountSecond: 2,
            columnsOnlyInFirst: [],
            columnsOnlyInSecond: [],
            rowMatches: [
                { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
                { rowNumberFirst: 3, rowNumberSecond: 3, matchPercent: 100 },
            ],
            rowsOnlyInFirst: [],
            rowsOnlyInSecond: [],
            cellDifferences: [],
        });
    });

    it('reports 100% matches when rows are in DIFFERENT order (order independence)', () => {
        // Same rows, second file reversed — each row is a 100% match at a
        // different position; nothing is reported as missing or differing
        expect(csvDiff('id,name\n1,Ann\n2,Bob', 'id,name\n2,Bob\n1,Ann')).toEqual({
            headersFirst: ['id', 'name'],
            headersSecond: ['id', 'name'],
            dataRowCountFirst: 2,
            dataRowCountSecond: 2,
            columnsOnlyInFirst: [],
            columnsOnlyInSecond: [],
            rowMatches: [
                { rowNumberFirst: 2, rowNumberSecond: 3, matchPercent: 100 },
                { rowNumberFirst: 3, rowNumberSecond: 2, matchPercent: 100 },
            ],
            rowsOnlyInFirst: [],
            rowsOnlyInSecond: [],
            cellDifferences: [],
        });
    });

    it('matches every first-file row against EVERY second-file row (far positions)', () => {
        // 30 identical rows, second file rotated by 7 — first-file row 4
        // (line 5) has its 100% twin at second-file line 12 (a far position)
        const rows: string[] = [];
        for (let index = 1; index <= 30; index++) {
            rows.push(`${index},shared-${index}`);
        }
        const secondShuffled = [...rows.slice(7), ...rows.slice(0, 7)];
        const result = csvDiff(
            ['id,label', ...rows].join('\n'),
            ['id,label', ...secondShuffled].join('\n'),
        );
        // Every row must pair 100% with its exact twin, wherever it sits
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowMatches).toHaveLength(30);
        // Every couple is a 100% match between the SAME id's rows
        for (const match of result.rowMatches) {
            const firstId = rows[match.rowNumberFirst - 2].split(',')[0];
            // The second file's rows come from the SHUFFLED array
            const secondId = secondShuffled[match.rowNumberSecond - 2].split(',')[0];
            expect(firstId).toBe(secondId);
            expect(match.matchPercent).toBe(100);
        }
        // At least one couple is cross-position (the rotation guarantees it)
        expect(
            result.rowMatches.some((match) => match.rowNumberFirst !== match.rowNumberSecond),
        ).toBe(true);
    });

    it('pairs rows across swapped column layouts (name-matched columns)', () => {
        // Columns swapped → the cell comparison matches columns by NAME
        const result = csvDiff('id,name\n1,Ann', 'name,id\nAnn,1');
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
        ]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
        expect(result.cellDifferences).toEqual([]);
    });
});

describe('csvDiff — missing columns', () => {
    it('lists columns present in only one file, header order preserved', () => {
        const result = csvDiff('id,name,age\n1,Ann,30', 'id,name\n1,Ann');
        expect(result.columnsOnlyInFirst).toEqual(['age']);
        expect(result.columnsOnlyInSecond).toEqual([]);
    });

    it('lists columns missing on each side independently', () => {
        const result = csvDiff('id,email\n1,a@x.io', 'id,phone\n1,555');
        expect(result.columnsOnlyInFirst).toEqual(['email']);
        expect(result.columnsOnlyInSecond).toEqual(['phone']);
    });
});

describe('csvDiff — missing rows', () => {
    it('reports a row present only in the second file with its raw line number', () => {
        const result = csvDiff('id,name\n1,Ann', 'id,name\n1,Ann\n2,Bob');
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
        ]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 3, cells: ['2', 'Bob'] }]);
    });

    it('reports rows present only in the first file with their raw line numbers', () => {
        const result = csvDiff('id,name\n1,Ann\n2,Bob\n3,Cid', 'id,name\n1,Ann');
        expect(result.rowsOnlyInFirst).toEqual([
            { rowNumber: 3, cells: ['2', 'Bob'] },
            { rowNumber: 4, cells: ['3', 'Cid'] },
        ]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });

    it('is multiplicity-aware: duplicate rows match one-to-one, extras are missing', () => {
        // First file has 'tag' twice, second file once → one 'tag' is missing
        const result = csvDiff('id,tag\n1,tag\n2,tag', 'id,tag\n1,tag');
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 3, cells: ['2', 'tag'] }]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });
});

describe('csvDiff — cell differences (paired rows)', () => {
    it('pairs rows by closest match and reports differing cells', () => {
        const result = csvDiff('id,name\n1,Ann\n2,Bob', 'id,name\n1,Ann\n2,Bobby');
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
            { rowNumberFirst: 3, rowNumberSecond: 3, matchPercent: 50 },
        ]);
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '2',
                rowNumberFirst: 3,
                rowNumberSecond: 3,
                column: 'name',
                firstValue: 'Bob',
                secondValue: 'Bobby',
            },
        ]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });

    it('pairs rows regardless of row order (closest match, not position)', () => {
        const result = csvDiff('id,name\n1,Ann\n2,Bob', 'id,name\n2,Bobby\n1,Ann');
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '2',
                rowNumberFirst: 3,
                rowNumberSecond: 2,
                column: 'name',
                firstValue: 'Bob',
                secondValue: 'Bobby',
            },
        ]);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 3, matchPercent: 100 },
            { rowNumberFirst: 3, rowNumberSecond: 2, matchPercent: 50 },
        ]);
    });

    it('pairs by column NAME when the key column sits at different positions', () => {
        // Key column 'id' is first in file 1 but second in file 2
        const result = csvDiff('id,name\n1,Ann', 'name,id\nAnna,1');
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'name',
                firstValue: 'Ann',
                secondValue: 'Anna',
            },
        ]);
    });

    it('reports multiple differing cells on one paired row in header order', () => {
        const result = csvDiff('id,name,age\n1,Ann,30', 'id,name,age\n1,Anna,31');
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'name',
                firstValue: 'Ann',
                secondValue: 'Anna',
            },
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'age',
                firstValue: '30',
                secondValue: '31',
            },
        ]);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 33 },
        ]);
    });

    it('reports a differing cell against an empty value as an empty string', () => {
        const result = csvDiff('id,name\n1,Ann', 'id,name\n1,');
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'name',
                firstValue: 'Ann',
                secondValue: '',
            },
        ]);
    });
});

describe('csvDiff — greedy global consumption', () => {
    it('a 100% match anywhere beats a same-position partial match', () => {
        // First-file row (2,Bob) has a 100% twin at second-file line 4 and a
        // weaker 50% candidate at line 2 — the 100% couple must win even
        // though the 50% candidate sits at the "same" position. Row (1,Ann)
        // vs (2,Bobby) scores 0 (id AND name differ), so no second couple
        // exists — (1,Ann), (2,Bobby) and (9,Zed) all stay missing.
        const result = csvDiff(
            'id,name\n1,Ann\n2,Bob',
            'id,name\n2,Bobby\n9,Zed\n2,Bob',
        );
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 3, rowNumberSecond: 4, matchPercent: 100 },
        ]);
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 2, cells: ['1', 'Ann'] }]);
        // (1,Ann) vs (2,Bobby): id differs, name differs → score 0 →
        // (2,Bobby) stays unpaired as a missing row too
        expect(result.rowsOnlyInSecond).toEqual([
            { rowNumber: 2, cells: ['2', 'Bobby'] },
            { rowNumber: 3, cells: ['9', 'Zed'] },
        ]);
        expect(result.cellDifferences).toEqual([]);
    });

    it('consumes the globally best couples first when scores tie', () => {
        // First row (1,x,y) ties at 67% with both second rows; the tie
        // breaks by the second-file row number → line 2 wins, line 3 stays
        // missing (only one first-file row exists)
        const result = csvDiff('id,a,b\n1,x,y', 'id,a,b\n1,x,z\n1,w,y');
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 67 },
        ]);
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'b',
                firstValue: 'y',
                secondValue: 'z',
            },
        ]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 3, cells: ['1', 'w', 'y'] }]);
    });

    it('never pairs score-0 couples (no shared non-empty common value)', () => {
        const result = csvDiff('id,name\n1,alpha', 'id,name\n2,beta');
        expect(result.rowMatches).toEqual([]);
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 2, cells: ['1', 'alpha'] }]);
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 2, cells: ['2', 'beta'] }]);
    });

    it('does not pair on trivial empty-vs-empty matches', () => {
        // Both rows empty in every common column → no identity, stay missing
        const result = csvDiff('id,name\n1,', 'id,name\n2,');
        expect(result.rowMatches).toEqual([]);
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 2, cells: ['1', ''] }]);
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 2, cells: ['2', ''] }]);
    });

    it('matches each first-file row to the closest of several candidates', () => {
        // First row (1,Ann,30) vs candidates: (1,Ann,31) 67% and (9,Zed,99)
        // 0% → only the 67% candidate is a valid pair; second row (9,Zed,99)
        // matches (9,Zed,99) exactly
        const result = csvDiff(
            'id,name,age\n1,Ann,30\n9,Zed,99',
            'id,name,age\n9,Zed,99\n1,Ann,31',
        );
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 3, matchPercent: 67 },
            { rowNumberFirst: 3, rowNumberSecond: 2, matchPercent: 100 },
        ]);
    });
});

describe('csvDiff — mixed scenarios', () => {
    it('combines missing columns, missing rows and cell differences in one result', () => {
        const result = csvDiff(
            'id,name,age\n1,Ann,30\n3,Cid,20',
            'id,name\n1,Anna\n2,Bob',
        );
        expect(result.columnsOnlyInFirst).toEqual(['age']);
        expect(result.columnsOnlyInSecond).toEqual([]);
        // Row (1,Ann,30) vs (1,Anna): 50% (id matches, name differs — 'age'
        // is not a common column, so not a cell difference)
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'name',
                firstValue: 'Ann',
                secondValue: 'Anna',
            },
        ]);
        // Row (3,Cid,20) vs (2,Bob): id differs, name differs → score 0 →
        // no pairing; both stay missing rows
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 50 },
        ]);
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 3, cells: ['3', 'Cid', '20'] }]);
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 3, cells: ['2', 'Bob'] }]);
    });

    it('handles empty second content: every first-file data row is missing', () => {
        const result = csvDiff('id,name\n1,Ann', '');
        expect(result.headersFirst).toEqual(['id', 'name']);
        expect(result.headersSecond).toEqual([]);
        expect(result.dataRowCountSecond).toEqual(0);
        expect(result.rowMatches).toEqual([]);
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 2, cells: ['1', 'Ann'] }]);
        expect(result.rowsOnlyInSecond).toEqual([]);
        expect(result.columnsOnlyInFirst).toEqual(['id', 'name']);
        expect(result.columnsOnlyInSecond).toEqual([]);
        expect(result.cellDifferences).toEqual([]);
    });

    it('survives quoted fields containing commas in comparisons', () => {
        const result = csvDiff('id,note\n1,"a,b"', 'id,note\n1,"a,b"');
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
        ]);
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });

    it('does not pair rows when there is no shared column (all leftovers missing)', () => {
        const result = csvDiff('a,b\n1,2', 'x,y\n3,4');
        expect(result.columnsOnlyInFirst).toEqual(['a', 'b']);
        expect(result.columnsOnlyInSecond).toEqual(['x', 'y']);
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowMatches).toEqual([]);
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 2, cells: ['1', '2'] }]);
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 2, cells: ['3', '4'] }]);
    });
});

describe('csvDiff — lossless option (value normalization)', () => {
    it('treats trailing-whitespace values as equal by default (trimmed)', () => {
        // Default (lossless OFF): "Retired " === "Retired" → no difference
        const result = csvDiff('id,status\n1,Retired ', 'id,status\n1,Retired');
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
        ]);
    });

    it('treats numeric-formatted values as equal by default ("12.00" === "12")', () => {
        const result = csvDiff('id,price\n1,12.00', 'id,price\n1,12');
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
        ]);
    });

    it('canonicalizes padded and zero-padded numbers (" 007 " === "7")', () => {
        const result = csvDiff('id,code\n1, 007 ', 'id,code\n1,7');
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
        ]);
    });

    it('reports the RAW values in cell differences even when normalized', () => {
        // "Bob " vs "Bobby" differs either way, but the reported values
        // must be the untrimmed originals
        const result = csvDiff('id,name\n1,Bob ', 'id,name\n1,Bobby');
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'name',
                firstValue: 'Bob ',
                secondValue: 'Bobby',
            },
        ]);
    });

    it('does not canonicalize non-numeric values (only trims them)', () => {
        // "1.2.3" is not a finite number → stays a string (trimmed only)
        const result = csvDiff('id,ver\n1,1.2.3 ', 'id,ver\n1,1.2.3');
        expect(result.cellDifferences).toEqual([]);
        // "1.2.3 " vs "1.2" → different after trim, not numbers → differs
        const result2 = csvDiff('id,ver\n1,1.2.3', 'id,ver\n1,1.2');
        expect(result2.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'ver',
                firstValue: '1.2.3',
                secondValue: '1.2',
            },
        ]);
    });

    it('does not treat whitespace-only vs empty as a matched value', () => {
        // 'name' cells (' ' and '') normalize equal but empty → no match
        // credit; the id column ('1' === '1') is the only matched column →
        // the pair forms at 50% with NO cell difference
        const result = csvDiff('id,name\n1, ', 'id,name\n1,');
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 50 },
        ]);
    });

    it('lossless: true keeps strict raw comparison ("Retired " !== "Retired")', () => {
        const result = csvDiff('id,status\n1,Retired ', 'id,status\n1,Retired', {
            lossless: true,
        });
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'status',
                firstValue: 'Retired ',
                secondValue: 'Retired',
            },
        ]);
    });

    it('lossless: true keeps strict raw comparison ("12.00" !== "12")', () => {
        const result = csvDiff('id,price\n1,12.00', 'id,price\n1,12', { lossless: true });
        expect(result.cellDifferences).toEqual([
            {
                rowKey: '1',
                rowNumberFirst: 2,
                rowNumberSecond: 2,
                column: 'price',
                firstValue: '12.00',
                secondValue: '12',
            },
        ]);
    });

    it('normalization applies to row matching (rows pair across formats)', () => {
        // Row pairing is value-based: "2,Bobby " pairs with "2,Bobby" even
        // though the raw cells differ
        const result = csvDiff('id,name\n1,Ann\n2,Bobby ', 'id,name\n2,Bobby\n1,Ann');
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 3, matchPercent: 100 },
            { rowNumberFirst: 3, rowNumberSecond: 2, matchPercent: 100 },
        ]);
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });
});

describe('csvDiff — header row selection', () => {
    it('defaults to row 1 as the header (no options)', () => {
        const result = csvDiff('id,name\n1,Ann', 'id,name\n1,Ann');
        expect(result.headersFirst).toEqual(['id', 'name']);
        expect(result.headersSecond).toEqual(['id', 'name']);
    });

    it('uses the 3rd row as the header when headerRow is 3 (preamble ignored)', () => {
        // Rows 1-2 are preamble garbage; row 3 carries the real headers
        const content = 'junk,junk\npreamble\nid,name\n1,Ann\n30';
        const result = csvDiff(content, content, { headerRowFirst: 3, headerRowSecond: 3 });
        expect(result.headersFirst).toEqual(['id', 'name']);
        expect(result.headersSecond).toEqual(['id', 'name']);
        // Rows AFTER the header are data — (1,Ann) pairs 100%; (30) has no
        // counterpart value in the second file's columns... it pairs with
        // itself at 50% (empty-vs-empty 'name' does not count, 'id'='30'
        // matches) — both sides consumed
        expect(result.dataRowCountFirst).toEqual(2);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 4, rowNumberSecond: 4, matchPercent: 100 },
            { rowNumberFirst: 5, rowNumberSecond: 5, matchPercent: 50 },
        ]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });

    it('supports DIFFERENT header rows per file', () => {
        // First file: header at row 1; second file: header at row 3 with two
        // preamble rows — the data still pairs 100% by name-matched columns
        const result = csvDiff(
            'id,name\n1,Ann',
            'preamble\nmore preamble\nid,name\n1,Ann',
            { headerRowFirst: 1, headerRowSecond: 3 },
        );
        expect(result.headersFirst).toEqual(['id', 'name']);
        expect(result.headersSecond).toEqual(['id', 'name']);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 4, matchPercent: 100 },
        ]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });

    it('reports raw line numbers relative to the file start (header row offset)', () => {
        // Header at row 3 → data rows are lines 4 and 5; a missing row keeps
        // its raw line number (5), not a data-relative index
        const result = csvDiff(
            'p\np\nid,name\n1,Ann',
            'p\np\nid,name\n1,Ann\n2,Bob',
            { headerRowFirst: 3, headerRowSecond: 3 },
        );
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 5, cells: ['2', 'Bob'] }]);
    });

    it('clamps an out-of-range header row to the last parsed row', () => {
        // headerRow 99 on a 2-row file → header = last row, no data rows
        const result = csvDiff('id,name\n1,Ann', 'id,name\n1,Ann', { headerRowFirst: 99 });
        expect(result.headersFirst).toEqual(['1', 'Ann']);
        expect(result.headersSecond).toEqual(['id', 'name']);
        expect(result.dataRowCountFirst).toEqual(0);
    });

    it('falls back to row 1 for invalid header row values', () => {
        const result = csvDiff('id,name\n1,Ann', 'id,name\n1,Ann', {
            headerRowFirst: 0,
            headerRowSecond: -5,
        });
        expect(result.headersFirst).toEqual(['id', 'name']);
        expect(result.headersSecond).toEqual(['id', 'name']);
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 2, matchPercent: 100 },
        ]);
    });
});
