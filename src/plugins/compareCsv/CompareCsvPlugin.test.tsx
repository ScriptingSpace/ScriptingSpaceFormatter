import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { FormatterDashboard } from '../../dashboards/FormatterDashboard';
import { defaultPlugins } from '../../plugins';
import { csvJoin } from './csvJoin';

// ─── COMPARE CSV PLUGIN — integration tests through the real dashboard ──────
// The compareCsv plugin hooks `renderSelection`, which the dashboard fires when
// ONE OR MORE sidebar files are selected. The tab mounts AFTER the focused
// file's plugin tabs (tab label "Compare").
//
// Selection order semantics (cross-reference: DifferenceCsvPlugin.test.tsx): the
// file dropped first is selected by the drop; clicking another sidebar file
// TOGGLES it into the selection. activeFileIds order = selection order —
// the FIRST-selected file's selected header row donates the "Header" column.
//
// Layout (FileCsvJoinView): the table is TRANSPOSED — first column = header
// labels of the first file; EACH file contributes exactly ONE entry column:
// the raw CSV row picked by that file's head inputs. Each file head carries
// TWO number inputs (testids csv-join-header-row-<fileIndex> for the header
// row and csv-join-entry-row-<fileIndex> for the displayed row).

afterEach(() => {
    cleanup();
});

// Drop CSV files and select them. The drop opens EVERY file but activates
// only the LAST one (openFile replaces the selection — cross-reference:
// plugins/fileReader/FileReaderPlugin.ts onFilesDropped); clicking a sidebar
// entry that is NOT selected toggles it INTO the multi-selection. So
// activeFileIds = [last dropped, ...clickNames] — click the OTHER files to
// control the selection order.
const dropAndSelect = async (files: File[], clickNames: string[]) => {
    render(<FormatterDashboard plugins={defaultPlugins} />);
    fireEvent.drop(screen.getByTestId('dashboard-root'), { dataTransfer: { files } });
    await waitFor(() => {
        expect(screen.getByTestId(`sidebar-file-${files[files.length - 1].name}`)).toBeDefined();
    });
    clickNames.forEach((name) => {
        fireEvent.click(screen.getByTestId(`sidebar-file-${name}`));
    });
};

describe('compareCsv — pure function', () => {
    it('joins two files TRANSPOSED with the FIRST file headers labeling the rows', () => {
        expect(
            csvJoin([
                { name: 'a.csv', content: 'id,name\n1,Ann\n2,Bob' },
                { name: 'b.csv', content: 'key,label\n1,Anna\n2,Robert' },
            ]),
        ).toEqual({
            headers: ['id', 'name'],
            files: [
                {
                    name: 'a.csv',
                    headers: ['id', 'name'],
                    columns: [['1', 'Ann'], ['2', 'Bob']],
                    entryIndex: 1,
                    entry: ['1', 'Ann'],
                },
                {
                    name: 'b.csv',
                    headers: ['key', 'label'],
                    columns: [['1', 'Anna'], ['2', 'Robert']],
                    entryIndex: 1,
                    entry: ['1', 'Anna'],
                },
            ],
        });
    });

    it('accepts a single file', () => {
        expect(csvJoin([{ name: 'solo.csv', content: 'id,name\n1,Ann' }])).toEqual({
            headers: ['id', 'name'],
            files: [
                {
                    name: 'solo.csv',
                    headers: ['id', 'name'],
                    columns: [['1', 'Ann']],
                    entryIndex: 1,
                    entry: ['1', 'Ann'],
                },
            ],
        });
    });
});

describe('compareCsvPlugin', () => {
    it('shows no Compare tab when the selection is not all CSV', async () => {
        // One .txt + one .csv selected → the all-CSV gate rejects the tab; the Difference tab (text+csv) is clicked to focus it
        await dropAndSelect(
            [
                new File(['plain'], 'plain.txt', { type: 'text/plain' }),
                new File(['id\n1'], 'tab.csv', { type: 'text/csv' }),
            ],
            ['plain.txt'],
        );
        fireEvent.click(screen.getByTestId('content-tab-differenceCsv'));
        expect(screen.queryByTestId('content-tab-compareCsv')).toBeNull();
        expect(screen.queryByTestId('file-csv-join-plugin')).toBeNull();
    });

    it('joins a SINGLE csv file (header column + ONE default entry column)', async () => {
        await dropAndSelect(
            [new File(['id,name\n1,Ann\n2,Bob'], 'solo.csv', { type: 'text/csv' })],
            [],
        );

        // Single selection → the Difference tab does not exist, but Compare CSV
        // accepts one file. The focused file's own tabs render first; the
        // join tab mounts after them.
        fireEvent.click(screen.getByTestId('content-tab-compareCsv'));

        // Corner cell + file head; one row per header label, the file's
        // DEFAULT entry (first data row) as its single column:
        // row 'id' → 1; row 'name' → Ann
        expect(screen.getByTestId('csv-join-table').textContent).toBe(
            'Headersolo.csvid1nameAnn',
        );
        // Left column carries the FIRST (only) file's headers
        const labels = screen.getAllByTestId('csv-join-header-label');
        expect(labels.map((label) => label.textContent)).toEqual(['id', 'name']);
        // ONE value cell per table row (one entry column per file)
        const cells = screen.getAllByTestId('csv-join-cell');
        expect(cells.map((cell) => cell.textContent)).toEqual(['1', 'Ann']);
        // The entry input displays the DEFAULT selection (raw line 2 =
        // entryIndex 1 + 1)
        const entryInput = screen.getByTestId('csv-join-entry-row-0') as HTMLInputElement;
        expect(entryInput.value).toBe('2');
    });

    it('joins two csv files with the first-selected file headers on the left', async () => {
        // Selection order: drop [b, a] → a.csv is opened LAST so the drop
        // auto-selects IT; clicking join-b.csv toggles b INTO the selection
        // → activeFileIds = [a, b]: a.csv = FIRST side (header donor)
        await dropAndSelect(
            [
                new File(['key,label\n1,Anna\n2,Robert\n3,Zed'], 'join-b.csv', { type: 'text/csv' }),
                new File(['id,name\n1,Ann\n2,Bob'], 'join-a.csv', { type: 'text/csv' }),
            ],
            ['join-b.csv'],
        );
        fireEvent.click(screen.getByTestId('content-tab-compareCsv'));

        // Corner cell reads "Header"; file heads in selection order. Each
        // file shows ONE default entry (its first data row): row 'id' reads
        // a's 1 then b's 1; row 'name' reads Ann then Anna.
        expect(screen.getByTestId('csv-join-table').textContent).toBe(
            'Headerjoin-a.csvjoin-b.csvid11nameAnnAnna',
        );
        // Left column = FIRST file's headers ONLY — b.csv's key/label
        // headers are not rendered
        const labels = screen.getAllByTestId('csv-join-header-label');
        expect(labels.map((label) => label.textContent)).toEqual(['id', 'name']);
    });

    it('each file has its OWN header-row input selecting that file header line', async () => {
        // Both files carry a one-line preamble, but the selectors are
        // independent: changing file 0's input must NOT touch file 1.
        // Drop [b, a] → the drop auto-selects pre-a.csv; clicking pre-b.csv
        // toggles it in → activeFileIds = [pre-a, pre-b]
        await dropAndSelect(
            [
                new File(['preamble\nkey,label\n1,Anna'], 'pre-b.csv', { type: 'text/csv' }),
                new File(['preamble\nid,name\n1,Ann'], 'pre-a.csv', { type: 'text/csv' }),
            ],
            ['pre-b.csv'],
        );
        fireEvent.click(screen.getByTestId('content-tab-compareCsv'));

        // Before: raw line 1 is the header in file 0 → the label column
        // reads the preamble text; each file's DEFAULT entry is its row 2
        expect(screen.getAllByTestId('csv-join-header-label').map((l) => l.textContent)).toEqual([
            'preamble',
            '\u00a0',
        ]);
        expect(screen.getAllByTestId('csv-join-cell').map((c) => c.textContent)).toEqual([
            'id',
            'key',
            'name',
            'label',
        ]);

        // Change file 0's selector → file 0's header row moves to line 2
        // AND its default entry slides to line 3; file 1 stays untouched
        // (header line 1, default entry line 2)
        fireEvent.change(screen.getByTestId('csv-join-header-row-0'), {
            target: { value: '2' },
        });
        expect(screen.getAllByTestId('csv-join-header-label').map((l) => l.textContent)).toEqual([
            'id',
            'name',
        ]);
        // Row-major cells: row 'id' → a '1', b 'key'; row 'name' →
        // a 'Ann', b 'label'
        expect(screen.getAllByTestId('csv-join-cell').map((c) => c.textContent)).toEqual([
            '1',
            'key',
            'Ann',
            'label',
        ]);

        // Change file 1's selector → only b's entry shifts; the Header
        // column (file 0) stays untouched
        fireEvent.change(screen.getByTestId('csv-join-header-row-1'), {
            target: { value: '2' },
        });
        expect(screen.getAllByTestId('csv-join-header-label').map((l) => l.textContent)).toEqual([
            'id',
            'name',
        ]);
        expect(screen.getAllByTestId('csv-join-cell').map((c) => c.textContent)).toEqual([
            '1',
            '1',
            'Ann',
            'Anna',
        ]);
    });

    it('each file head has an ENTRY selector changing which row of that file is displayed', async () => {
        // Each file carries TWO data rows; the entry selector picks which
        // ONE is shown per file. Drop [b, a] → activeFileIds = [a, b]
        await dropAndSelect(
            [
                new File(['key,label\n1,Anna\n2,Robert'], 'ent-b.csv', { type: 'text/csv' }),
                new File(['id,name\n1,Ann\n2,Bob'], 'ent-a.csv', { type: 'text/csv' }),
            ],
            ['ent-b.csv'],
        );
        fireEvent.click(screen.getByTestId('content-tab-compareCsv'));

        // Default: each file shows its FIRST data row (raw line 2) — the
        // entry inputs DISPLAY that default (entryIndex + 1 = 2)
        expect(screen.getAllByTestId('csv-join-cell').map((c) => c.textContent)).toEqual([
            '1',
            '1',
            'Ann',
            'Anna',
        ]);
        expect((screen.getByTestId('csv-join-entry-row-0') as HTMLInputElement).value).toBe('2');
        expect((screen.getByTestId('csv-join-entry-row-1') as HTMLInputElement).value).toBe('2');

        // Change file 1's entry selector → only b's displayed row moves
        // (raw line 3 = b's second data row)
        fireEvent.change(screen.getByTestId('csv-join-entry-row-1'), {
            target: { value: '3' },
        });
        expect(screen.getAllByTestId('csv-join-cell').map((c) => c.textContent)).toEqual([
            '1',
            '2',
            'Ann',
            'Robert',
        ]);

        // Change file 0's entry selector → only a's displayed row moves;
        // the header labels stay untouched
        fireEvent.change(screen.getByTestId('csv-join-entry-row-0'), {
            target: { value: '3' },
        });
        expect(screen.getAllByTestId('csv-join-header-label').map((l) => l.textContent)).toEqual([
            'id',
            'name',
        ]);
        expect(screen.getAllByTestId('csv-join-cell').map((c) => c.textContent)).toEqual([
            '2',
            '2',
            'Bob',
            'Robert',
        ]);
    });

    it('cross-highlights same-value cells in a row on hover', async () => {
        // Fixture: table row 'id' holds value '9' in BOTH files (each file
        // shows ONE entry) → hovering one highlights the other. The 'X'
        // value sits in row 'name' and has no same-row counterpart when a
        // '9' is hovered.
        // Drop [b, a] → the drop auto-selects hovj-a.csv; clicking hovj-b.csv
        // toggles it in → activeFileIds = [hovj-a, hovj-b]
        await dropAndSelect(
            [
                new File(['key,label\n9,Anna\n2,Y'], 'hovj-b.csv', { type: 'text/csv' }),
                new File(['id,name\n9,X\n2,Y'], 'hovj-a.csv', { type: 'text/csv' }),
            ],
            ['hovj-b.csv'],
        );
        fireEvent.click(screen.getByTestId('content-tab-compareCsv'));

        const table = screen.getByTestId('csv-join-table');
        const spansWithText = (text: string) =>
            Array.from(table.querySelectorAll('span')).filter(
                (span) => span.textContent === text,
            );
        // '9' appears as: row 'id' a-entry cell, row 'id' b-entry cell.
        // Two value cells.
        const nineCells = spansWithText('9');
        expect(nineCells).toHaveLength(2);
        const xCell = spansWithText('X')[0];

        // Before any hover: no highlight on any value cell
        expect(nineCells[0].style.background).toBe('');
        expect(nineCells[1].style.background).toBe('');
        expect(xCell.style.background).toBe('');

        // Hover the first '9' (a, row 'id') → hovered tint on it, MATCHED
        // tint on the second '9' (b, row 'id'). 'X' stays unhighlighted.
        fireEvent.mouseEnter(nineCells[0]);
        expect(nineCells[0].style.background).toBe('rgba(148, 163, 184, 0.25)');
        expect(nineCells[1].style.background).toBe('rgba(59, 130, 246, 0.25)');
        expect(xCell.style.background).toBe('');

        // Mouse leaves → both highlights clear
        fireEvent.mouseLeave(nineCells[0]);
        expect(nineCells[0].style.background).toBe('');
        expect(nineCells[1].style.background).toBe('');

        // Hover the second '9' (b, row 'id') → mirrored behavior
        fireEvent.mouseEnter(nineCells[1]);
        expect(nineCells[1].style.background).toBe('rgba(148, 163, 184, 0.25)');
        expect(nineCells[0].style.background).toBe('rgba(59, 130, 246, 0.25)');

        fireEvent.mouseLeave(nineCells[1]);
        expect(nineCells[1].style.background).toBe('');
        expect(nineCells[0].style.background).toBe('');
    });
});
