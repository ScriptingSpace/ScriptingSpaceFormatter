import { arrayCreate, loopFor } from '@presource/core';

// ─── Git-style line diff (pure function, no React) ───────────────────────────
// Computes a line-level diff between two text contents using the classic
// longest-common-subsequence (LCS) dynamic-programming algorithm — the same
// approach git's Myers-style output is conceptually based on. Lines present
// only in the FIRST content become 'removed' rows (git '-'), lines present
// only in the SECOND content become 'added' rows (git '+'), and matched
// lines become 'same' rows (unchanged context).

// Row classification — mirrors git's marker semantics:
// - 'same'    → line exists in BOTH files (context line, git ' ')
// - 'removed' → line exists only in the FIRST file (git '-')
// - 'added'   → line exists only in the SECOND file (git '+')
export type DiffRowType = 'same' | 'removed' | 'added';

// One rendered diff line. `left` / `right` are the 1-based line numbers in
// the FIRST / SECOND file respectively — null on the side the line does not
// exist in (removed rows have no right number, added rows no left number).
export type DiffRow = {
    type: DiffRowType;
    // 1-based line number in the FIRST file — null for added-only rows
    left: number | null;
    // 1-based line number in the SECOND file — null for removed-only rows
    right: number | null;
    // The line text (identical in both files for 'same' rows)
    text: string;
};

// Splits BOTH contents into lines and diffs them. No trailing-newline
// normalization on purpose: a file ending with '\n' legitimately has one
// more (empty) line than one without, and the diff must reflect that —
// splitting 'a\n' yields ['a', ''] which keeps the empty trailing line
// visible as a real row.
export const diffLines = (firstContent: string, secondContent: string): DiffRow[] => {
    const firstLines = firstContent.split('\n');
    const secondLines = secondContent.split('\n');

    // dp[i][j] = length of the LCS of firstLines[i..] and secondLines[j..].
    // Built as a (firstLines.length + 1) × (secondLines.length + 1) table of
    // zeros — the extra row/column represent the empty suffixes. arrayCreate
    // (presource core) produces dense undefined-filled arrays, so .map works.
    const table: number[][] = arrayCreate(firstLines.length + 1).map(() =>
        arrayCreate(secondLines.length + 1).map(() => 0),
    );

    // Fill the table bottom-up from the bottom-right corner. loopFor iterates
    // ascending, so the actual table row/column is REVERSED (length-1-index)
    // — this guarantees dp[i][j] only reads already-filled cells (i+1 / j+1).
    loopFor(firstLines.length, ({ index }) => {
        const i = firstLines.length - 1 - index;
        loopFor(secondLines.length, ({ index: innerIndex }) => {
            const j = secondLines.length - 1 - innerIndex;
            // Equal lines extend the LCS by one; differing lines take the
            // better of skipping a first-file line or skipping a second-file
            // line
            table[i][j] =
                firstLines[i] === secondLines[j]
                    ? table[i + 1][j + 1] + 1
                    : Math.max(table[i + 1][j], table[i][j + 1]);
        });
    });

    // Backtrack from (0, 0) to emit the rows in document order:
    // - equal lines → 'same' row (both numbers advance)
    // - otherwise follow the larger LCS value; on a TIE prefer stepping the
    //   first file, so removals render BEFORE additions (git-like ordering)
    const rows: DiffRow[] = [];
    let i = 0;
    let j = 0;
    let left = 0;
    let right = 0;
    while (i < firstLines.length || j < secondLines.length) {
        if (
            i < firstLines.length &&
            j < secondLines.length &&
            firstLines[i] === secondLines[j]
        ) {
            left++;
            right++;
            rows.push({ type: 'same', left, right, text: firstLines[i] });
            i++;
            j++;
        } else if (
            i < firstLines.length &&
            (j >= secondLines.length || table[i + 1][j] >= table[i][j + 1])
        ) {
            // Line exists only in the FIRST file → git '-' (removed)
            left++;
            rows.push({ type: 'removed', left, right: null, text: firstLines[i] });
            i++;
        } else {
            // Line exists only in the SECOND file → git '+' (added)
            right++;
            rows.push({ type: 'added', left: null, right, text: secondLines[j] });
            j++;
        }
    }
    return rows;
};
