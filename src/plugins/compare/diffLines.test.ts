import { describe, it, expect } from 'vitest';
import { diffLines } from './diffLines';

// ─── diffLines — git-style line diff (LCS backtrack) ─────────────────────────
// Every assertion below is an EXACT expected row list: type, 1-based line
// numbers and text are all pinned, no fuzzy range checks.
//
// Line model note: contents are split on '\n' WITHOUT trailing-newline
// normalization — ''.split('\n') → [''] (one empty line), 'a\n'.split('\n')
// → ['a', '']. This keeps a trailing newline visible as a real row and makes
// every output below the unique minimal LCS edit script under the tie-break
// "prefer stepping the FIRST file" rule (removals group before additions).

describe('diffLines', () => {
    it('returns a single same row for identical contents', () => {
        expect(diffLines('hello', 'hello')).toEqual([
            { type: 'same', left: 1, right: 1, text: 'hello' },
        ]);
    });

    it('returns one same empty row for two empty contents (split model: one empty line each)', () => {
        expect(diffLines('', '')).toEqual([{ type: 'same', left: 1, right: 1, text: '' }]);
    });

    it('removes the empty first line then adds every second-file line when the first content is empty', () => {
        expect(diffLines('', 'a\nb')).toEqual([
            { type: 'removed', left: 1, right: null, text: '' },
            { type: 'added', left: null, right: 1, text: 'a' },
            { type: 'added', left: null, right: 2, text: 'b' },
        ]);
    });

    it('removes every first-file line then adds the empty second line when the second content is empty', () => {
        expect(diffLines('a\nb', '')).toEqual([
            { type: 'removed', left: 1, right: null, text: 'a' },
            { type: 'removed', left: 2, right: null, text: 'b' },
            { type: 'added', left: null, right: 1, text: '' },
        ]);
    });

    it('groups removals before additions for a fully rewritten file (tie-break)', () => {
        expect(diffLines('old one\nold two', 'new one\nnew two')).toEqual([
            { type: 'removed', left: 1, right: null, text: 'old one' },
            { type: 'removed', left: 2, right: null, text: 'old two' },
            { type: 'added', left: null, right: 1, text: 'new one' },
            { type: 'added', left: null, right: 2, text: 'new two' },
        ]);
    });

    it('keeps shared context lines and appends the added tail line', () => {
        expect(diffLines('a\nb\nc\nd\ne', 'a\nb\nc\nd\ne\nf')).toEqual([
            { type: 'same', left: 1, right: 1, text: 'a' },
            { type: 'same', left: 2, right: 2, text: 'b' },
            { type: 'same', left: 3, right: 3, text: 'c' },
            { type: 'same', left: 4, right: 4, text: 'd' },
            { type: 'same', left: 5, right: 5, text: 'e' },
            { type: 'added', left: null, right: 6, text: 'f' },
        ]);
    });

    it('survives a trailing newline (empty final line is a real row)', () => {
        expect(diffLines('a\n', 'a\n')).toEqual([
            { type: 'same', left: 1, right: 1, text: 'a' },
            { type: 'same', left: 2, right: 2, text: '' },
        ]);
    });

    it('treats a missing trailing newline as a removed empty line', () => {
        expect(diffLines('a\n', 'a')).toEqual([
            { type: 'same', left: 1, right: 1, text: 'a' },
            { type: 'removed', left: 2, right: null, text: '' },
        ]);
    });

    it('renders removal before addition inside a single changed block', () => {
        expect(diffLines('x\ny\nz', 'x\nw\nz')).toEqual([
            { type: 'same', left: 1, right: 1, text: 'x' },
            { type: 'removed', left: 2, right: null, text: 'y' },
            { type: 'added', left: null, right: 2, text: 'w' },
            { type: 'same', left: 3, right: 3, text: 'z' },
        ]);
    });

    it('handles repeated lines with the minimal LCS edit script', () => {
        // LCS of [a,b,a] vs [a,a,b] is length 2; the tie-break matches the
        // trailing [a, b] pair: same a, removed b, same a, added b
        expect(diffLines('a\nb\na', 'a\na\nb')).toEqual([
            { type: 'same', left: 1, right: 1, text: 'a' },
            { type: 'removed', left: 2, right: null, text: 'b' },
            { type: 'same', left: 3, right: 2, text: 'a' },
            { type: 'added', left: null, right: 3, text: 'b' },
        ]);
    });

    it('groups multi-line removals before additions between matched context', () => {
        expect(diffLines('keep\nold1\nold2\nkeep2', 'keep\nnew1\nnew2\nkeep2')).toEqual([
            { type: 'same', left: 1, right: 1, text: 'keep' },
            { type: 'removed', left: 2, right: null, text: 'old1' },
            { type: 'removed', left: 3, right: null, text: 'old2' },
            { type: 'added', left: null, right: 2, text: 'new1' },
            { type: 'added', left: null, right: 3, text: 'new2' },
            { type: 'same', left: 4, right: 4, text: 'keep2' },
        ]);
    });

    it('matches the earliest shared occurrences when a line repeats in both files', () => {
        // LCS is [shared, shared]; the backtrack adds 'b' first (the second
        // file's extra head line), then matches both 'shared' lines, with
        // the first file's lone 'a' removed between them
        expect(diffLines('shared\na\nshared', 'b\nshared\nshared')).toEqual([
            { type: 'added', left: null, right: 1, text: 'b' },
            { type: 'same', left: 1, right: 2, text: 'shared' },
            { type: 'removed', left: 2, right: null, text: 'a' },
            { type: 'same', left: 3, right: 3, text: 'shared' },
        ]);
    });
});
