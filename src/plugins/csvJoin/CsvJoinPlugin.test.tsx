import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { FormatterDashboard } from '../../dashboards/FormatterDashboard';
import { defaultPlugins } from '../../plugins';
import { csvJoin } from './csvJoin';

// ─── CSV JOIN PLUGIN — integration tests through the real dashboard ─────────
// The csvJoin plugin hooks `renderSelection`, which the dashboard fires when
// ONE OR MORE sidebar files are selected. The tab mounts AFTER the focused
// file's plugin tabs (tab label "CSV join").
//
// Selection order semantics (cross-reference: ComparePlugin.test.tsx): the
// file dropped first is selected by the drop; clicking another sidebar file
// TOGGLES it into the selection. activeFileIds order = selection order —
// the FIRST-selected file donates the header column.

afterEach(() => {
    cleanup();
});

// Drop CSV files and select them (drop selects the last dropped file;
// clicking a sidebar entry toggles it into the multi-selection)
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

describe('csvJoin — pure function', () => {
    it('joins two files positionally with the FIRST file headers only', () => {
        expect(
            csvJoin([
                { name: 'a.csv', content: 'id,name\n1,Ann\n2,Bob' },
                { name: 'b.csv', content: 'key,label\n1,Anna\n2,Robert' },
            ]),
        ).toEqual({
            headers: ['id', 'name'],
            files: [
                { name: 'a.csv', columns: [['1', 'Ann'], ['2', 'Bob']] },
                { name: 'b.csv', columns: [['1', 'Anna'], ['2', 'Robert']] },
            ],
        });
    });

    it('accepts a single file', () => {
        expect(csvJoin([{ name: 'solo.csv', content: 'id,name\n1,Ann' }])).toEqual({
            headers: ['id', 'name'],
            files: [{ name: 'solo.csv', columns: [['1', 'Ann']] }],
        });
    });
});

describe('csvJoinPlugin', () => {
    it('shows no CSV join tab when the selection is not all CSV', async () => {
        // One .txt + one .csv selected → the all-CSV gate rejects the tab
        await dropAndSelect(
            [
                new File(['plain'], 'plain.txt', { type: 'text/plain' }),
                new File(['id\n1'], 'tab.csv', { type: 'text/csv' }),
            ],
            ['plain.txt'],
        );
        fireEvent.click(screen.getByTestId('content-tab-compare'));
        expect(screen.queryByTestId('content-tab-csvJoin')).toBeNull();
        expect(screen.queryByTestId('file-csv-join-plugin')).toBeNull();
    });

    it('joins a SINGLE csv file (header column + one value column)', async () => {
        await dropAndSelect(
            [new File(['id,name\n1,Ann\n2,Bob'], 'solo.csv', { type: 'text/csv' })],
            [],
        );

        // Single selection → the compare tab does not exist, but CSV join
        // accepts one file. The focused file's own tabs render first; the
        // join tab mounts after them.
        fireEvent.click(screen.getByTestId('content-tab-csvJoin'));

        // Corner cell + file-name strip; one row per header label
        expect(screen.getByTestId('csv-join-table').textContent).toBe(
            'Headersolo.csvidname1Ann2Bob',
        );
        // Left column carries the FIRST (only) file's headers
        const labels = screen.getAllByTestId('csv-join-header-label');
        expect(labels.map((label) => label.textContent)).toEqual(['id', 'name']);
        // One value cell per header row per file column
        const cells = screen.getAllByTestId('csv-join-cell');
        expect(cells.map((cell) => cell.textContent)).toEqual(['1', 'Ann', '2', 'Bob']);
    });

    it('joins two csv files with the first-selected file headers on the left', async () => {
        // Selection order: a.csv (dropped, auto-selected) then b.csv
        // (clicked in) → a.csv = FIRST side (header donor), b.csv = second
        await dropAndSelect(
            [
                new File(['id,name\n1,Ann\n2,Bob'], 'join-a.csv', { type: 'text/csv' }),
                new File(['key,label\n1,Anna\n2,Robert\n3,Zed'], 'join-b.csv', { type: 'text/csv' }),
            ],
            ['join-b.csv'],
        );
        fireEvent.click(screen.getByTestId('content-tab-csvJoin'));

        // Corner cell reads "Header"; file-name strip in selection order.
        // b.csv has THREE data rows vs a.csv's two → the tail row renders
        // with a blank label and b.csv's '3' value; a.csv's tail cell is
        // blank (nbsp).
        expect(screen.getByTestId('csv-join-table').textContent).toBe(
            'Headerjoin-a.csvjoin-b.csvidname1AnnAnna2BobRobert\u00a03Zed',
        );
        // Left column = FIRST file's headers ONLY — b.csv's key/label
        // headers are ignored by design
        const labels = screen.getAllByTestId('csv-join-header-label');
        expect(labels.map((label) => label.textContent)).toEqual(['id', 'name', '\u00a0']);
    });

    it('header-row selector shifts the header line in EVERY file', async () => {
        // Both files carry a one-line preamble; headerRow 2 skips it in both
        await dropAndSelect(
            [
                new File(['preamble\nid,name\n1,Ann'], 'pre-a.csv', { type: 'text/csv' }),
                new File(['preamble\nkey,label\n1,Anna'], 'pre-b.csv', { type: 'text/csv' }),
            ],
            ['pre-b.csv'],
        );
        fireEvent.click(screen.getByTestId('content-tab-csvJoin'));

        // Before: raw line 1 is the header → labels are the preamble text
        expect(screen.getAllByTestId('csv-join-header-label').map((l) => l.textContent)).toEqual([
            'preamble',
            'preamble',
        ]);

        // Change the shared selector → both files re-resolve
        fireEvent.change(screen.getByTestId('csv-join-header-row'), {
            target: { value: '2' },
        });
        expect(screen.getAllByTestId('csv-join-header-label').map((l) => l.textContent)).toEqual([
            'id',
            'name',
        ]);
        expect(screen.getAllByTestId('csv-join-cell').map((c) => c.textContent)).toEqual([
            '1',
            'Anna',
        ]);
    });

    it('cross-highlights same-value cells in a row on hover', async () => {
        // Fixture: row 1 holds value '9' in BOTH files (different columns:
        // a's name column and b's label column) → hovering one highlights
        // the other. Row 2's values ('X'/'Y') have no counterpart.
        await dropAndSelect(
            [
                new File(['id,name\n9,X\n2,Y'], 'hovj-a.csv', { type: 'text/csv' }),
                new File(['key,label\n1,9\n2,Y'], 'hovj-b.csv', { type: 'text/csv' }),
            ],
            ['hovj-b.csv'],
        );
        fireEvent.click(screen.getByTestId('csv-join-tab') ?? screen.getByTestId('content-tab-csvJoin'));

        // Table layout (row-major): header strip, then rows. Row 1 = id/key
        // ('9' / '1'), row 2 = name/label ('X' / '9'), row 3 = age/extra
        // ('2' / 'Y'). Wait — the fixture's first column values differ per
        // file; the left labels come from a.csv only.
        const table = screen.getByTestId('csv-join-table');
        const spansWithText = (text: string) =>
            Array.from(table.querySelectorAll('span')).filter(
                (span) => span.textContent === text,
            );
        // '9' appears as: row 1 a.csv cell, row 2 b.csv cell — plus the
        // header strip does not contain it. Two value cells.
        const nineCells = spansWithText('9');
        expect(nineCells).toHaveLength(2);
        const yCell = spansWithText('Y')[0];

        // Before any hover: no highlight on any value cell
        expect(nineCells[0].style.background).toBe('');
        expect(nineCells[1].style.background).toBe('');
        expect(yCell.style.background).toBe('');

        // Hover the first '9' (a.csv row 1) → hovered tint on it, MATCHED
        // tint on the second '9' (b.csv row 2). 'Y' stays unhighlighted.
        fireEvent.mouseEnter(nineCells[0]);
        expect(nineCells[0].style.background).toBe('rgba(148, 163, 184, 0.25)');
        expect(nineCells[1].style.background).toBe('rgba(59, 130, 246, 0.25)');
        expect(yCell.style.background).toBe('');

        // Mouse leaves → both highlights clear
        fireEvent.mouseLeave(nineCells[0]);
        expect(nineCells[0].style.background).toBe('');
        expect(nineCells[1].style.background).toBe('');

        // Hover the second '9' (b.csv row 2) → mirrored behavior
        fireEvent.mouseEnter(nineCells[1]);
        expect(nineCells[1].style.background).toBe('rgba(148, 163, 184, 0.25)');
        expect(nineCells[0].style.background).toBe('rgba(59, 130, 246, 0.25)');

        fireEvent.mouseLeave(nineCells[1]);
        expect(nineCells[1].style.background).toBe('');
        expect(nineCells[0].style.background).toBe('');
    });
});
