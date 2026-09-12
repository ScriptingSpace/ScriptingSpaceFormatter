import React from 'react';
import { arrayEach } from '@presource/core';
import { styledComponent } from '@presource/react';
import { diffLines } from './diffLines';
import type { DiffRow } from './diffLines';

// ─── Git-style diff view ─────────────────────────────────────────────────────
// Renders the LCS line diff between exactly two selected text files as a
// side-by-side (two-column) table: the FIRST-selected file on the LEFT, the
// SECOND-selected file on the RIGHT. Row classification comes from
// diffLines.ts — 'same' rows appear on both sides, 'removed' rows only on
// the left (git '-'), 'added' rows only on the right (git '+').

// Row data paired with its 1-based line number for one side of the table.
// `number` is null on the side the line does not exist in (removed rows
// have no right-side number, added rows no left-side number).
type SideCell = {
    number: number | null;
    text: string;
    type: DiffRow['type'];
};

// Outer frame — fills the tab panel, scrolls internally (the dashboard's
// pane never scrolls, this element does)
const DiffFrame = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'auto' as const,
    boxSizing: 'border-box' as const,
    background: '#0b1120',
    color: '#e2e8f0',
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    fontSize: 12,
    lineHeight: 1.5,
});

// The two-column grid. Each row is a 3-column grid: left gutter number,
// left text, right gutter number, right text — implemented as a repeating
// 4-column grid (number / text / number / text) so both sides stay aligned.
const DiffGrid = styledComponent('div', {
    display: 'grid' as const,
    gridTemplateColumns: '40px minmax(0, 1fr) 40px minmax(0, 1fr)',
    minWidth: '100%',
    width: 'max-content' as const,
    minHeight: '100%',
});

// One gutter cell (line number). Dimmed; removed/added rows tint the gutter
// to match their half so the marker reads at a glance.
const DiffGutter = styledComponent<{ type: DiffRow['type'] }>('span', {
    padding: '0 8px',
    textAlign: 'right' as const,
    userSelect: 'none' as const,
    whiteSpace: 'pre' as const,
    color: ({ type }) => typeColor(type),
    background: ({ type }) => typeBackground(type),
});

// One text cell. Removed rows tint red (left half only), added rows tint
// green (right half only), same rows stay neutral. Empty text still needs
// the cell to keep the grid aligned — rendered as a single space.
const DiffCell = styledComponent<{ type: DiffRow['type'] }>('span', {
    padding: '0 8px',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: ({ type }) => typeColor(type),
    background: ({ type }) => typeBackground(type),
});

// Shared tint resolution for gutter + text cells — kept in one place so the
// row background spans gutter+text as ONE continuous strip per side.
const typeColor = (type: DiffRow['type']): string =>
    type === 'removed' ? '#f87171' : type === 'added' ? '#4ade80' : '#e2e8f0';

const typeBackground = (type: DiffRow['type']): string =>
    type === 'removed'
        ? 'rgba(248, 113, 113, 0.08)'
        : type === 'added'
          ? 'rgba(74, 222, 128, 0.08)'
          : 'transparent';

// Empty-diff fallback — only reachable when both files are empty
const DiffEmpty = styledComponent('div', {
    padding: 16,
    fontSize: 13,
    color: '#475569',
    fontFamily:
        'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
});

// Builds one side's cells from the diff rows: rows existing on that side
// become cells with their 1-based number; the other side gets a blank cell
// so the grid stays aligned.
const buildSide = (rows: DiffRow[], side: 'left' | 'right'): SideCell[] => {
    const cells: SideCell[] = [];
    arrayEach(rows, ({ value: row }) => {
        const number = side === 'left' ? row.left : row.right;
        // null number → this side has no line here → blank placeholder cell
        cells.push({
            number,
            text: number === null ? '' : row.text,
            type: number === null ? 'same' : row.type,
        });
    });
    return cells;
};

// The diff view component. Recomputes the diff on every render — pure and
// deterministic for a given (first, second) content pair.
export const FileDiffView = ({
    first,
    second,
}: {
    first: { name: string; content: string };
    second: { name: string; content: string };
}) => {
    const rows = diffLines(first.content, second.content);

    if (rows.length === 0) {
        return <DiffEmpty data-testid="file-diff-empty">Both files are empty.</DiffEmpty>;
    }

    const leftCells = buildSide(rows, 'left');
    const rightCells = buildSide(rows, 'right');

    // Per-row casts hoisted out of the loop — styledComponent returns
    // React.FC (no custom-prop typing), so the same cast pattern as
    // TabButton in dashboards/FormatterDashboard.tsx applies. The cast is
    // identical for both sides (the components are side-agnostic); the
    // side separation lives purely in the cell data.
    const Gutter = DiffGutter as unknown as React.FC<
        { type: DiffRow['type'] } & React.HTMLAttributes<HTMLSpanElement>
    >;
    const Cell = DiffCell as unknown as React.FC<
        { type: DiffRow['type'] } & React.HTMLAttributes<HTMLSpanElement>
    >;

    // Flatten row-pairs into the 4-column grid: [left gutter, left text,
    // right gutter, right text] × rows
    const cells: React.ReactNode[] = [];
    arrayEach(rows, ({ index }) => {
        const leftCell = leftCells[index];
        const rightCell = rightCells[index];
        cells.push(
            <Gutter key={`lg-${index}`} type={leftCell.type}>
                {leftCell.number === null ? '' : String(leftCell.number)}
            </Gutter>,
            <Cell key={`lc-${index}`} type={leftCell.type}>
                {leftCell.text === '' ? ' ' : leftCell.text}
            </Cell>,
            <Gutter key={`rg-${index}`} type={rightCell.type}>
                {rightCell.number === null ? '' : String(rightCell.number)}
            </Gutter>,
            <Cell key={`rc-${index}`} type={rightCell.type}>
                {rightCell.text === '' ? ' ' : rightCell.text}
            </Cell>,
        );
    });

    return (
        <DiffFrame data-testid="file-diff">
            <DiffGrid data-testid="file-diff-grid">{cells}</DiffGrid>
        </DiffFrame>
    );
};
