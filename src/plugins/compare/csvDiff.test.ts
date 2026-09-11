import { describe, it, expect } from 'vitest';
import { parseCsv, csvDiff } from './csvDiff';

// ─── csvDiff — order-independent CSV comparison ──────────────────────────────
// Every assertion pins the EXACT expected output (full objects/arrays, raw
// line numbers, exact cell values). Line-number model: header = line 1,
// first data row = line 2 (raw CSV line numbers, matching the file text).

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

describe('csvDiff — identical content', () => {
    it('reports nothing for identical CSVs', () => {
        expect(csvDiff('id,name\n1,Ann\n2,Bob', 'id,name\n1,Ann\n2,Bob')).toEqual({
            headersFirst: ['id', 'name'],
            headersSecond: ['id', 'name'],
            dataRowCountFirst: 2,
            dataRowCountSecond: 2,
            columnsOnlyInFirst: [],
            columnsOnlyInSecond: [],
            rowsOnlyInFirst: [],
            rowsOnlyInSecond: [],
            cellDifferences: [],
        });
    });

    it('reports nothing when rows are in DIFFERENT order (order independence)', () => {
        expect(csvDiff('id,name\n1,Ann\n2,Bob', 'id,name\n2,Bob\n1,Ann')).toEqual({
            headersFirst: ['id', 'name'],
            headersSecond: ['id', 'name'],
            dataRowCountFirst: 2,
            dataRowCountSecond: 2,
            columnsOnlyInFirst: [],
            columnsOnlyInSecond: [],
            rowsOnlyInFirst: [],
            rowsOnlyInSecond: [],
            cellDifferences: [],
        });
    });

    it('reports nothing when COLUMNS are in different order (name-matched headers)', () => {
        expect(csvDiff('id,name\n1,Ann', 'name,id\nAnn,1')).toEqual({
            headersFirst: ['id', 'name'],
            headersSecond: ['name', 'id'],
            dataRowCountFirst: 1,
            dataRowCountSecond: 1,
            columnsOnlyInFirst: [],
            columnsOnlyInSecond: [],
            rowsOnlyInFirst: [],
            rowsOnlyInSecond: [],
            cellDifferences: [],
        });
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

    it('pairs rows across swapped column layouts by key, reporting no differences', () => {
        // Columns swapped → exact whole-row signatures do NOT match, but the
        // key pass pairs by the 'id' column (found by NAME at different
        // positions) and the cell comparison is name-matched → no diff
        const result = csvDiff('id,name\n1,Ann', 'name,id\nAnn,1');
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
        expect(result.cellDifferences).toEqual([]);
    });
});

describe('csvDiff — cell differences (key pairing)', () => {
    it('pairs rows by the first shared column and reports differing cells', () => {
        const result = csvDiff('id,name\n1,Ann\n2,Bob', 'id,name\n1,Ann\n2,Bobby');
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

describe('csvDiff — mixed scenarios', () => {
    it('combines missing columns, missing rows and cell differences in one result', () => {
        const result = csvDiff(
            'id,name,age\n1,Ann,30\n3,Cid,20',
            'id,name\n1,Anna\n2,Bob',
        );
        expect(result.columnsOnlyInFirst).toEqual(['age']);
        expect(result.columnsOnlyInSecond).toEqual([]);
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
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 3, cells: ['3', 'Cid', '20'] }]);
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 3, cells: ['2', 'Bob'] }]);
    });

    it('handles empty second content: every first-file data row is missing', () => {
        const result = csvDiff('id,name\n1,Ann', '');
        expect(result.headersFirst).toEqual(['id', 'name']);
        expect(result.headersSecond).toEqual([]);
        expect(result.dataRowCountSecond).toEqual(0);
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 2, cells: ['1', 'Ann'] }]);
        expect(result.rowsOnlyInSecond).toEqual([]);
        expect(result.columnsOnlyInFirst).toEqual(['id', 'name']);
        expect(result.columnsOnlyInSecond).toEqual([]);
        expect(result.cellDifferences).toEqual([]);
    });

    it('survives quoted fields containing commas in comparisons', () => {
        const result = csvDiff('id,note\n1,"a,b"', 'id,note\n1,"a,b"');
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowsOnlyInFirst).toEqual([]);
        expect(result.rowsOnlyInSecond).toEqual([]);
    });

    it('does not pair rows when there is no shared column (all leftovers missing)', () => {
        const result = csvDiff('a,b\n1,2', 'x,y\n3,4');
        expect(result.columnsOnlyInFirst).toEqual(['a', 'b']);
        expect(result.columnsOnlyInSecond).toEqual(['x', 'y']);
        expect(result.cellDifferences).toEqual([]);
        expect(result.rowsOnlyInFirst).toEqual([{ rowNumber: 2, cells: ['1', '2'] }]);
        expect(result.rowsOnlyInSecond).toEqual([{ rowNumber: 2, cells: ['3', '4'] }]);
    });
});
