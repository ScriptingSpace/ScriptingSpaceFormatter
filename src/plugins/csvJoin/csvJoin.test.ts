import { describe, it, expect } from 'vitest';
import { csvJoin } from './csvJoin';

// ─── csvJoin — deterministic unit tests ──────────────────────────────────────
// Pure-function coverage for the multi-file CSV join that backs
// FileCsvJoinView (cross-reference: FileCsvJoinView.tsx). Every assertion
// pins the EXACT output object — no ranges, no fuzzy checks.

describe('csvJoin', () => {
    it('joins two files positionally with the FIRST file headers only', () => {
        // Second file has DIFFERENT header names — they must be ignored;
        // only the first file's header row labels the left column
        const result = csvJoin([
            { name: 'a.csv', content: 'id,name\n1,Ann\n2,Bob' },
            { name: 'b.csv', content: 'key,label\n1,Anna\n2,Robert' },
        ]);
        expect(result).toEqual({
            headers: ['id', 'name'],
            files: [
                { name: 'a.csv', columns: [['1', 'Ann'], ['2', 'Bob']] },
                { name: 'b.csv', columns: [['1', 'Anna'], ['2', 'Robert']] },
            ],
        });
    });

    it('accepts a SINGLE file', () => {
        const result = csvJoin([{ name: 'solo.csv', content: 'id,name\n1,Ann' }]);
        expect(result).toEqual({
            headers: ['id', 'name'],
            files: [{ name: 'solo.csv', columns: [['1', 'Ann']] }],
        });
    });

    it('empty files list → empty headers and no columns', () => {
        expect(csvJoin([])).toEqual({ headers: [], files: [] });
    });

    it('respects a shared headerRow offset across all files', () => {
        // Both files carry a one-line preamble; headerRow: 2 skips it in
        // BOTH files (one shared selector, not per-file)
        const result = csvJoin(
            [
                { name: 'a.csv', content: 'preamble\nid,name\n1,Ann' },
                { name: 'b.csv', content: 'preamble\nkey,label\n1,Anna' },
            ],
            { headerRow: 2 },
        );
        expect(result).toEqual({
            headers: ['id', 'name'],
            files: [
                { name: 'a.csv', columns: [['1', 'Ann']] },
                { name: 'b.csv', columns: [['1', 'Anna']] },
            ],
        });
    });

    it('headerRow beyond a file row count clamps to that file last row', () => {
        // a.csv has 3 rows → headerRow 5 clamps to row 3 (header only, no
        // data). b.csv has 2 rows → clamps to row 2 (its last row).
        const result = csvJoin(
            [
                { name: 'a.csv', content: 'id,name\n1,Ann\n2,Bob' },
                { name: 'b.csv', content: 'key,label\n1,Anna' },
            ],
            { headerRow: 5 },
        );
        expect(result).toEqual({
            headers: ['2', 'Bob'],
            files: [
                { name: 'a.csv', columns: [] },
                { name: 'b.csv', columns: [] },
            ],
        });
    });

    it('rows before the header row are ignored as preamble', () => {
        const result = csvJoin([{ name: 'a.csv', content: 'junk\nmore junk\nid,name\n1,Ann' }], {
            headerRow: 3,
        });
        expect(result).toEqual({
            headers: ['id', 'name'],
            files: [{ name: 'a.csv', columns: [['1', 'Ann']] }],
        });
    });

    it('handles quoted fields with commas and embedded newlines', () => {
        // Parser is shared with csvDiff (RFC-4180) — quoted commas and
        // newlines stay inside one field
        const result = csvJoin([
            { name: 'a.csv', content: 'id,note\n1,"has, comma"\n2,"line1\nline2"' },
        ]);
        expect(result).toEqual({
            headers: ['id', 'note'],
            files: [
                {
                    name: 'a.csv',
                    columns: [['1', 'has, comma'], ['2', 'line1\nline2']],
                },
            ],
        });
    });

    it('handles \\r\\n line endings', () => {
        const result = csvJoin([{ name: 'a.csv', content: 'id,name\r\n1,Ann\r\n2,Bob' }]);
        expect(result).toEqual({
            headers: ['id', 'name'],
            files: [{ name: 'a.csv', columns: [['1', 'Ann'], ['2', 'Bob']] }],
        });
    });

    it('files with different row counts keep their own column lengths', () => {
        // No padding is added — each file column carries exactly its own
        // data rows; the viewer renders blanks for the shorter columns
        const result = csvJoin([
            { name: 'a.csv', content: 'id\n1\n2\n3' },
            { name: 'b.csv', content: 'id\n1' },
        ]);
        expect(result).toEqual({
            headers: ['id'],
            files: [
                { name: 'a.csv', columns: [['1'], ['2'], ['3']] },
                { name: 'b.csv', columns: [['1']] },
            ],
        });
    });

    it('short rows within a file keep their parsed cell arrays as-is', () => {
        // A row with fewer cells than the header is NOT padded — the viewer
        // reads missing cells as '' at render time
        const result = csvJoin([{ name: 'a.csv', content: 'id,name\n1\n2,Bob' }]);
        expect(result).toEqual({
            headers: ['id', 'name'],
            files: [{ name: 'a.csv', columns: [['1'], ['2', 'Bob']] }],
        });
    });

    it('invalid headerRow falls back to 1', () => {
        const result = csvJoin([{ name: 'a.csv', content: 'id\n1' }], { headerRow: 0 });
        expect(result).toEqual({
            headers: ['id'],
            files: [{ name: 'a.csv', columns: [['1']] }],
        });
    });

    it('empty content yields empty headers and an empty column', () => {
        expect(csvJoin([{ name: 'a.csv', content: '' }])).toEqual({
            headers: [],
            files: [{ name: 'a.csv', columns: [] }],
        });
    });
});
