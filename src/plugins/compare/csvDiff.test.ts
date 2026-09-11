import { describe, it, expect } from 'vitest';
import { parseCsv, csvDiff } from './csvDiff';

// ─── csvDiff — order-independent CSV comparison with closest-match pairing ───
// Every assertion pins the EXACT expected output (full objects/arrays, raw
// line numbers, exact cell values). Line-number model: header = line 1,
// first data row = line 2 (raw CSV line numbers, matching the file text).
//
// Pairing cascade: EXACT (identical cell lists) → KEY (equal non-empty value
// in the first shared column) → SIMILARITY (greedy global closest match over
// the common columns; score-0 couples never pair). Unpaired rows are the
// missing rows.

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

    it('pairs rows across swapped column layouts by key, reporting no differences', () => {
        // Columns swapped → exact whole-row signatures do NOT match, but the
        // key pass pairs by the 'id' column (found by NAME at different
        // positions) and the cell comparison is name-matched → 100% matches
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
    it('pairs rows by the first shared column and reports differing cells', () => {
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

    it('pairs rows regardless of row order (key-based, not position-based)', () => {
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

describe('csvDiff — similarity matching (closest row anywhere)', () => {
    it('pairs a row to its CLOSEST match in the other file, not the same position', () => {
        // First-file row 3 (2,Bob) has NO exact/key counterpart — but it is
        // a 50% similarity match for second-file row 2 (2,Bobby). Row 2
        // (1,Ann) pairs exactly. Position-based comparison would wrongly
        // pair 2,Bob against 2,Bobby's slot at line 2 — the similarity pass
        // instead finds the globally closest candidate.
        const result = csvDiff(
            'id,name\n1,Ann\n2,Bob',
            'id,name\n2,Bobby\n1,Ann',
        );
        expect(result.rowMatches).toEqual([
            { rowNumberFirst: 2, rowNumberSecond: 3, matchPercent: 100 },
            { rowNumberFirst: 3, rowNumberSecond: 2, matchPercent: 50 },
        ]);
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
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });

    it('greedily consumes the globally best couples first', () => {
        // Row A (1,x,y) matches B1 (1,x,z) at 66% and B2 (1,w,y) at 66%.
        // Tie → lower second-file row number wins for A (B1, line 2), so
        // B2 (line 3) pairs with B's counterpart row... only one first row
        // exists here, so B2 stays missing.
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
        // Row (1,Ann,30) key-pairs with (1,Anna) — 'age' is not a common
        // column so it is not a cell difference; similarity 50% (id + name
        // match, name differs → 1 of 2 common columns matches)
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
