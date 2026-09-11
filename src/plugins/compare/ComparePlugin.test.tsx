import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { FormatterDashboard } from '../../dashboards/FormatterDashboard';
import { defaultPlugins } from '../../plugins';
import { diffLines } from './diffLines';

// ─── COMPARE PLUGIN — integration tests through the real dashboard ──────────
// The compare plugin hooks `renderSelection`, which the dashboard fires only
// when TWO OR MORE sidebar files are selected. The tab mounts AFTER the
// focused file's plugin tabs (tab label "Compare").

afterEach(() => {
    cleanup();
});

// Drop two text files and multi-select both (beta is selected by the drop;
// clicking alpha toggles it INTO the selection)
const setupTwoSelected = async () => {
    render(<FormatterDashboard plugins={defaultPlugins} />);
    fireEvent.drop(screen.getByTestId('dashboard-root'), {
        dataTransfer: {
            files: [
                new File(['alpha line\nshared line'], 'alpha.txt', { type: 'text/plain' }),
                new File(['beta line\nshared line'], 'beta.txt', { type: 'text/plain' }),
            ],
        },
    });
    await waitFor(() => {
        expect(screen.getByTestId('sidebar-file-beta.txt')).toBeDefined();
    });
    fireEvent.click(screen.getByTestId('sidebar-file-alpha.txt'));
};

describe('comparePlugin', () => {
    it('diffLines marks the first file line removed and the second file line added', () => {
        // Pure-function sanity for the exact fixture used by the UI tests
        expect(diffLines('alpha line\nshared line', 'beta line\nshared line')).toEqual([
            { type: 'removed', left: 1, right: null, text: 'alpha line' },
            { type: 'added', left: null, right: 1, text: 'beta line' },
            { type: 'same', left: 2, right: 2, text: 'shared line' },
        ]);
    });

    it('shows no compare tab when only ONE file is selected', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['solo'], 'solo.txt', { type: 'text/plain' })],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('file-content-text')).toBeDefined();
        });

        // Single selection → renderSelection never fires → no Compare tab
        expect(screen.queryByTestId('content-tab-compare')).toBeNull();
        expect(screen.queryByTestId('file-compare')).toBeNull();
    });

    it('adds a Compare tab after the plugin tabs when exactly 2 files are selected', async () => {
        await setupTwoSelected();

        // Multi-select → file options layout; the Compare tab exists AFTER
        // the focused file's plugin tabs (text tab first, compare second)
        expect(screen.getByTestId('file-options')).toBeDefined();
        const tabTestIds = Array.from(
            screen.getByTestId('file-option-panel-alpha.txt').querySelector('[data-testid="content-tabs"]')!
                .children[0].children,
        ).map((tab) => tab.getAttribute('data-testid'));
        expect(tabTestIds).toEqual(['content-tab-text', 'content-tab-compare']);
        expect(screen.getByTestId('content-tab-compare').textContent).toBe('Compare');
    });

    it('defaults to the focused file tab; clicking Compare shows the git-style diff', async () => {
        await setupTwoSelected();

        // Default visible tab = the focused file's plugin tab (text)
        expect(screen.getByTestId('file-content-text')).toBeDefined();
        expect(screen.queryByTestId('file-compare')).toBeNull();

        // Click the Compare tab → the diff view replaces the text panel
        fireEvent.click(screen.getByTestId('content-tab-compare'));

        expect(screen.getByTestId('file-compare')).toBeDefined();
        // Legend maps left column → FIRST-selected file (beta — it was
        // selected by the drop), right → SECOND-selected (alpha — clicked
        // into the selection afterwards)
        expect(screen.getByTestId('file-compare-first').textContent).toBe('−beta.txt');
        expect(screen.getByTestId('file-compare-second').textContent).toBe('+alpha.txt');

        // The diff grid is the git-style side-by-side: row 1 = removed on
        // the left (beta's unique line), row 2 = added on the right (alpha's
        // unique line), row 3 = same (both) — removals render BEFORE
        // additions under the diff's tie-break rule
        const grid = screen.getByTestId('file-diff-grid');
        const cells = Array.from(grid.children).map((cell) => cell.textContent);
        expect(cells).toEqual([
            // row 1: left gutter+text (removed — beta's line), right blank
            '1', 'beta line', '', ' ',
            // row 2: left blank, right gutter+text (added — alpha's line)
            '', ' ', '1', 'alpha line',
            // row 3: same line on both sides
            '2', 'shared line', '2', 'shared line',
        ]);
    });

    it('diffs the FIRST-selected file against the SECOND-selected file (selection order)', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['one'], 'one.txt', { type: 'text/plain' }),
                    new File(['two'], 'two.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-two.txt')).toBeDefined();
        });

        // Selection order: two.txt first (drop-selected), then one.txt —
        // so one.txt is the OLD (left) side and two.txt the NEW (right)
        fireEvent.click(screen.getByTestId('sidebar-file-one.txt'));

        fireEvent.click(screen.getByTestId('content-tab-compare'));

        expect(screen.getByTestId('file-compare-first').textContent).toBe('−two.txt');
        expect(screen.getByTestId('file-compare-second').textContent).toBe('+one.txt');
    });

    it('removes the Compare tab when the selection drops back to one file', async () => {
        await setupTwoSelected();
        expect(screen.getByTestId('content-tab-compare')).toBeDefined();

        // Toggle alpha back off → single selection → the tab disappears and
        // the focused file's text view renders directly
        fireEvent.click(screen.getByTestId('sidebar-file-alpha.txt'));

        expect(screen.queryByTestId('content-tab-compare')).toBeNull();
        expect(screen.queryByTestId('file-compare')).toBeNull();
        expect(screen.getByTestId('file-content-text').textContent).toBe(
            'beta line\nshared line',
        );
    });

    it('shows no compare tab when the selection contains a non-text file', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['text content'], 'doc.txt', { type: 'text/plain' }),
                    new File(['fake-png-bytes'], 'logo.png', { type: 'image/png' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-logo.png')).toBeDefined();
        });

        // Select both → the image kind makes the selection non-diffable
        fireEvent.click(screen.getByTestId('sidebar-file-doc.txt'));

        expect(screen.getByTestId('file-options')).toBeDefined();
        expect(screen.queryByTestId('content-tab-compare')).toBeNull();
    });

    it('renders an empty diff grid when both selected files are empty', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File([''], 'empty-a.txt', { type: 'text/plain' }),
                    new File([''], 'empty-b.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-empty-b.txt')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-empty-a.txt'));

        fireEvent.click(screen.getByTestId('content-tab-compare'));

        // Both files are a single empty line → one fully 'same' row
        expect(screen.getByTestId('file-compare')).toBeDefined();
        const cells = Array.from(screen.getByTestId('file-diff-grid').children).map(
            (cell) => cell.textContent,
        );
        expect(cells).toEqual(['1', ' ', '1', ' ']);
    });
});

// ─── CSV comparison (two .csv files selected) ────────────────────────────────
// Two selected CSV files route the Compare tab to the order-independent CSV
// comparison (csvDiff.ts) instead of the git-style line diff.

describe('comparePlugin — csv comparison', () => {
    // Drop two CSV files and multi-select both (beta selected by the drop;
    // clicking alpha toggles it INTO the selection)
    const setupTwoCsvSelected = async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['id,name\n1,Ann\n2,Bob'], 'alpha.csv', { type: 'text/csv' }),
                    new File(['id,name\n2,Bobby\n1,Ann'], 'beta.csv', { type: 'text/csv' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-beta.csv')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-alpha.csv'));
    };

    it('adds a Compare tab for two selected CSV files', async () => {
        await setupTwoCsvSelected();

        expect(screen.getByTestId('file-options')).toBeDefined();
        const tabTestIds = Array.from(
            screen.getByTestId('file-option-panel-alpha.csv').querySelector('[data-testid="content-tabs"]')!
                .children[0].children,
        ).map((tab) => tab.getAttribute('data-testid'));
        expect(tabTestIds).toEqual(['content-tab-text', 'content-tab-compare']);
    });

    it('shows the CSV report (not the line diff) with cell differences and missing rows', async () => {
        await setupTwoCsvSelected();

        fireEvent.click(screen.getByTestId('content-tab-compare'));

        // CSV view mounted — the line-diff grid must NOT be present
        expect(screen.getByTestId('file-csv-diff')).toBeDefined();
        expect(screen.queryByTestId('file-diff-grid')).toBeNull();

        // Summary row counts (2 data rows each). Selection order: beta.csv
        // was opened by the drop (drop activates the LAST file), alpha.csv
        // clicked in after → beta.csv = first side, alpha.csv = second side
        const summary = screen.getByTestId('csv-diff-summary');
        expect(summary.textContent).toBe('Summary1beta.csv: 2 data rows2alpha.csv: 2 data rows');

        // Cell difference: key '2' paired across the reordered rows —
        // beta row 2 (2,Bobby) vs alpha row 3 (2,Bob). The match percent is
        // merged INTO the cell-differences table (Match column after Key);
        // the SECOND file (alpha.csv, green) is the first value column.
        const cellRows = Array.from(
            screen.getByTestId('csv-diff-cells').querySelectorAll('[data-testid="csv-diff-cell-row"]'),
        ).map((cell) => cell.textContent);
        expect(cellRows).toEqual(['2']);

        const cellSection = screen.getByTestId('csv-diff-cells');
        expect(cellSection.textContent).toBe(
            'Cell differences⎘KeyMatchRowsColumnalpha.csvbeta.csv2' +
                '50%2 ↔ 3nameBobBobby',
        );

        // No missing columns / missing rows in this fixture
        expect(screen.queryByTestId('csv-diff-columns')).toBeNull();
        expect(screen.queryByTestId('csv-diff-rows')).toBeNull();
    });

    it('reports missing columns and missing rows for divergent CSVs', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['id,name,age\n1,Ann,30\n3,Cid,20'], 'first.csv', { type: 'text/csv' }),
                    new File(['id,name\n1,Anna\n2,Bob'], 'second.csv', { type: 'text/csv' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-second.csv')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-first.csv'));

        fireEvent.click(screen.getByTestId('content-tab-compare'));

        expect(screen.getByTestId('file-csv-diff')).toBeDefined();

        // Missing column: 'age' only in first.csv. Selection order:
        // second.csv opened by the drop, first.csv clicked in after →
        // first.csv is the SECOND side (marker "2")
        const columnRows = Array.from(
            screen.getByTestId('csv-diff-columns').querySelectorAll('[data-testid="csv-diff-column"]'),
        ).map((row) => row.textContent);
        expect(columnRows).toEqual(['2ageonly in first.csv']);

        // Cell difference on the key-paired row '1' (name Ann vs Anna)
        const cellRows = Array.from(
            screen.getByTestId('csv-diff-cells').querySelectorAll('[data-testid="csv-diff-cell-row"]'),
        ).map((cell) => cell.textContent);
        expect(cellRows).toEqual(['1']);

        // Missing rows: '3,Cid,20' only in first.csv (second side, marker
        // "2"), '2,Bob' only in second.csv (first side, marker "1")
        const rowLines = Array.from(
            screen.getByTestId('csv-diff-rows').querySelectorAll('[data-testid="csv-diff-row"]'),
        ).map((row) => row.textContent);
        expect(rowLines).toEqual([
            '1line 3: 2, Bobonly in second.csv',
            '2line 3: 3, Cid, 20only in first.csv',
        ]);
    });

    it('shows the identical-CSV message when both files match', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['id,name\n1,Ann'], 'same-a.csv', { type: 'text/csv' }),
                    new File(['id,name\n1,Ann'], 'same-b.csv', { type: 'text/csv' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-same-b.csv')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-same-a.csv'));

        fireEvent.click(screen.getByTestId('content-tab-compare'));

        expect(screen.getByTestId('csv-diff-identical').textContent).toBe(
            'The two CSV files are identical.',
        );
    });

    it('keeps the line diff for two non-CSV text files (regression)', async () => {
        await setupTwoSelected();

        fireEvent.click(screen.getByTestId('content-tab-compare'));

        // .txt selection → git-style line diff, not the CSV report
        expect(screen.getByTestId('file-diff-grid')).toBeDefined();
        expect(screen.queryByTestId('file-csv-diff')).toBeNull();
    });

    it('recomputes the comparison when the header row selector changes', async () => {
        // Both files carry two preamble rows; the real header sits at row 3.
        // Default (header row 1) → garbage columns, no pairing. Selecting 3
        // → real headers, the data row pairs 100%.
        render(<FormatterDashboard plugins={defaultPlugins} />);
        const content = 'junk,junk\npreamble\nid,name\n1,Ann';
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File([content], 'pre-a.csv', { type: 'text/csv' }),
                    new File([content], 'pre-b.csv', { type: 'text/csv' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-pre-b.csv')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-pre-a.csv'));
        fireEvent.click(screen.getByTestId('content-tab-compare'));

        // Default header row 1 → headers are the preamble cells → nothing
        // matches cleanly; the report is NOT the identical message
        expect(screen.queryByTestId('csv-diff-identical')).toBeNull();

        // Set the header row to 3 on BOTH selectors → the preamble is
        // ignored, the real header applies and the files become identical
        fireEvent.change(screen.getByTestId('csv-diff-header-row-first'), {
            target: { value: '3' },
        });
        fireEvent.change(screen.getByTestId('csv-diff-header-row-second'), {
            target: { value: '3' },
        });

        expect(screen.getByTestId('csv-diff-identical')).toBeDefined();
    });

    it('treats "Retired " and "12.00" as matching by default (lossless off)', async () => {
        // Default: normalization trims whitespace and canonicalizes numbers
        // → no cell differences → identical message
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['id,status,age\n1,Retired ,12.00'], 'norm-a.csv', { type: 'text/csv' }),
                    new File(['id,status,age\n1,Retired,12'], 'norm-b.csv', { type: 'text/csv' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-norm-b.csv')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-norm-a.csv'));
        fireEvent.click(screen.getByTestId('content-tab-compare'));

        // Checkbox renders unchecked by default
        const checkbox = screen.getByTestId('csv-diff-lossless') as HTMLInputElement;
        expect(checkbox.checked).toBe(false);

        expect(screen.getByTestId('csv-diff-identical')).toBeDefined();
    });

    it('enabling the Lossless toggle turns normalization off (raw comparison)', async () => {
        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['id,status,age\n1,Retired ,12.00'], 'norm-a.csv', { type: 'text/csv' }),
                    new File(['id,status,age\n1,Retired,12'], 'norm-b.csv', { type: 'text/csv' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-norm-b.csv')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-norm-a.csv'));
        fireEvent.click(screen.getByTestId('content-tab-compare'));

        // Default (lossless off) → identical
        expect(screen.getByTestId('csv-diff-identical')).toBeDefined();

        // Toggle lossless ON → raw comparison → both cells differ. The flat
        // table has ONE row per differing cell — the single couple (key
        // '1') contributes two rows (status + age), each carrying its key
        fireEvent.click(screen.getByTestId('csv-diff-lossless'));
        expect((screen.getByTestId('csv-diff-lossless') as HTMLInputElement).checked).toBe(true);

        const cellRows = Array.from(
            screen.getByTestId('csv-diff-cells').querySelectorAll('[data-testid="csv-diff-cell-row"]'),
        ).map((cell) => cell.textContent);
        expect(cellRows).toEqual(['1', '1']);

        // Raw values reported: 'Retired ' (untrimmed) and '12.00'.
        // Selection order: norm-a.csv opened by the drop, norm-b.csv clicked
        // in after → norm-a.csv = FIRST side, norm-b.csv = SECOND side.
        // Match 33% (id matches, status + age differ of 3 columns). Flat
        // table → every column is filled on BOTH cell rows.
        const cellSection = screen.getByTestId('csv-diff-cells');
        expect(cellSection.textContent).toBe(
            'Cell differences⎘KeyMatchRowsColumnnorm-a.csvnorm-b.csv1' +
                '33%2 ↔ 2statusRetired Retired' +
                '133%2 ↔ 2age12.0012',
        );
    });

    it('copies the cell-differences table as CSV via the copy button', async () => {
        // jsdom has no navigator.clipboard — stub writeText before rendering
        const written: string[] = [];
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: (text: string) => {
                    written.push(text);
                    return Promise.resolve();
                },
            },
            configurable: true,
        });

        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['id,name\n1,Ann\n2,Bob'], 'copy-a.csv', { type: 'text/csv' }),
                    new File(['id,name\n1,Anna\n2,Bobby'], 'copy-b.csv', { type: 'text/csv' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-copy-b.csv')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-copy-a.csv'));
        fireEvent.click(screen.getByTestId('content-tab-compare'));

        // Copy ICON sits immediately after the section title — clipboard
        // glyph ⎘, no text label
        expect(screen.getByTestId('csv-diff-cells-copy').textContent).toBe('⎘');

        fireEvent.click(screen.getByTestId('csv-diff-cells-copy'));

        // Payload mirrors the on-screen table: header row + one row per
        // differing cell, second file (copy-a.csv — wait: selection order
        // makes copy-a the FIRST side and copy-b the SECOND; the SECOND
        // file's column comes first). Values are the RAW unnormalized ones.
        // Rows: '1,Ann' ↔ '1,Anna' (name differs) and '2,Bob' ↔ '2,Bobby'.
        // Match 50%: id matches, name differs of 2 common columns.
        expect(written).toEqual([
            [
                'Key,Match,Rows,Column,copy-a.csv,copy-b.csv',
                '1,50%,2 ↔ 2,name,Ann,Anna',
                '2,50%,3 ↔ 3,name,Bob,Bobby',
            ].join('\r\n'),
        ]);

        // Icon flips to the checkmark glyph after a successful copy (the
        // async clipboard promise resolves in a microtask — flush it first)
        await waitFor(() => {
            expect(screen.getByTestId('csv-diff-cells-copy').textContent).toBe('✓');
        });
    });

    it('escapes CSV special characters (commas, quotes) in the copy payload', async () => {
        const written: string[] = [];
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: (text: string) => {
                    written.push(text);
                    return Promise.resolve();
                },
            },
            configurable: true,
        });

        render(<FormatterDashboard plugins={defaultPlugins} />);
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['id,note\n1,"has, comma"'], 'esc-a.csv', { type: 'text/csv' }),
                    new File(['id,note\n1,"has ""quote"""'], 'esc-b.csv', { type: 'text/csv' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-esc-b.csv')).toBeDefined();
        });
        fireEvent.click(screen.getByTestId('sidebar-file-esc-a.csv'));
        fireEvent.click(screen.getByTestId('content-tab-compare'));

        fireEvent.click(screen.getByTestId('csv-diff-cells-copy'));

        // Fields containing commas or quotes are RFC-4180 quoted with
        // internal quotes doubled. Match 50% (id matches, note differs).
        expect(written).toEqual([
            [
                'Key,Match,Rows,Column,esc-a.csv,esc-b.csv',
                '1,50%,2 ↔ 2,note,"has, comma","has ""quote"""',
            ].join('\r\n'),
        ]);
    });
});
