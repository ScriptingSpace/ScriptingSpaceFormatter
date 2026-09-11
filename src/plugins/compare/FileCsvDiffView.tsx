import React from 'react';
import { styledComponent, useStateHook, useToggleHook } from '@presource/react';
import { csvDiff } from './csvDiff';
import type { CsvDiffResult } from './csvDiff';

// ─── CSV comparison view ─────────────────────────────────────────────────────
// Renders the csvDiff result (csvDiff.ts) as a report with four sections:
// 1. Summary — row counts per file
// 2. Missing columns — header names present in only one file
// 3. Cell differences — paired rows with differing values in common
//    columns. Each row couple's match percent is shown IN THIS TABLE (a
//    dedicated "Matched rows" table was merged into it — one table per
//    couple instead of two). Column order: the SECOND-selected file's
//    value (green, the actively selected file) comes FIRST, the
//    FIRST-selected file's value (red) after it.
// 4. Missing rows — rows present in only one file (no acceptable match
//    anywhere in the other file)
//
// 100%-matched couples (no differing cells) produce no cell-difference
// entry, so they simply do not appear in the cell-differences table.
//
// A header-row selector (one number input per file, default 1) chooses
// WHICH raw CSV line is treated as the column header — rows before it are
// ignored (preamble), rows after it are data. Changing either selector
// recomputes the whole comparison.
//
// Identical CSVs render a single "no differences" line.

// Outer frame — fills the tab panel, scrolls internally (the dashboard's
// pane never scrolls, this element does)
const CsvFrame = styledComponent('div', {
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
    padding: 16,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
});

// Section heading strip
const SectionTitle = styledComponent('div', {
    fontSize: 13,
    fontWeight: 700,
    color: '#94a3b8',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 6,
});

// Section container
const Section = styledComponent('div', {
    display: 'flex',
    flexDirection: 'column' as const,
});

// Grid for the tabular report section — cell differences. Each row couple
// with differing cells occupies TWO table rows: a "match" row (couple id +
// match percent, spanning visually via the muted percent cell) followed by
// one row per differing cell.
// Layout: key | match% | rows | column | second value (green) | first value (red)
const DiffTable = styledComponent('div', {
    display: 'grid' as const,
    gridTemplateColumns:
        'minmax(60px, max-content) minmax(80px, max-content) minmax(90px, max-content) minmax(90px, max-content) minmax(0, 1fr) minmax(0, 1fr)',
    width: 'max-content' as const,
    minWidth: '100%',
    gap: '2px 8px',
});

// Table header cell
const TableHead = styledComponent('span', {
    fontWeight: 700,
    color: '#64748b',
    whiteSpace: 'nowrap' as const,
    borderBottom: '1px solid #1e293b',
    paddingBottom: 2,
});

// Table body cell — pre-wrap so embedded newlines in cell values stay visible
const TableCell = styledComponent('span', {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
});

// Match-percent cell — full green at 100%, amber below (partial match);
// muted when shown inside the cell-differences table (the percent is
// metadata there, not the row's primary content)
const MatchPercent = styledComponent<{ percent: number; muted?: boolean }>('span', {
    fontWeight: 700,
    color: ({ percent, muted }) =>
        muted ? '#475569' : percent === 100 ? '#4ade80' : '#fbbf24',
});

// Value cell tinted by which side it came from. The SECOND file (green —
// the actively selected file) renders in the FIRST column, the FIRST file
// (red) in the second — matching the diff view's green = added (new) /
// red = removed (old) emphasis with green leading.
const ValueCell = styledComponent<{ side: 'first' | 'second' }>('span', {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    color: ({ side }) => (side === 'first' ? '#f87171' : '#4ade80'),
});

// One bullet line inside a list section (missing columns / missing rows)
const ListRow = styledComponent('div', {
    display: 'flex',
    gap: 8,
    alignItems: 'baseline' as const,
});

// Side marker in list rows — "1" = first file, "2" = second file
const ListMarker = styledComponent<{ side: 'first' | 'second' }>('span', {
    fontWeight: 700,
    flexShrink: 0,
    color: ({ side }) => (side === 'first' ? '#f87171' : '#4ade80'),
});

// Muted meta text (counts, "none" fallbacks)
const Muted = styledComponent('span', {
    color: '#475569',
});

// Header-row selector strip — one labeled number input per file
const HeaderRowBar = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: 16,
    alignItems: 'center' as const,
    flexShrink: 0,
});

// One selector: file label + number input
const HeaderRowControl = styledComponent('label', {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: 6,
    alignItems: 'center' as const,
    fontSize: 12,
    color: '#94a3b8',
});

// The number input itself — styled to match the shell's control family
const HeaderRowInput = styledComponent('input', {
    width: 56,
    padding: '4px 6px',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: '#0f172a',
    color: '#e2e8f0',
}) as unknown as React.FC<React.InputHTMLAttributes<HTMLInputElement>>;

// Lossless toggle — a labeled checkbox in the same control family
const LosslessControl = styledComponent('label', {
    display: 'flex',
    flexDirection: 'row' as const,
    gap: 6,
    alignItems: 'center' as const,
    fontSize: 12,
    color: '#94a3b8',
    cursor: 'pointer' as const,
    userSelect: 'none' as const,
});

// The checkbox itself
const LosslessCheckbox = styledComponent('input', {
    accentColor: '#3b82f6',
    cursor: 'pointer' as const,
}) as unknown as React.FC<React.InputHTMLAttributes<HTMLInputElement>>;

// ─── Component ───────────────────────────────────────────────────────────────
// Recomputes the diff on every render — pure and deterministic for a given
// (first, second, header rows, lossless) input tuple.
export const FileCsvDiffView = ({
    first,
    second,
}: {
    first: { name: string; content: string };
    second: { name: string; content: string };
}) => {
    // Header row position per file (1-based raw CSV line number, default 1).
    // The input keeps its raw text so clearing it does not snap mid-edit;
    // the committed value feeds the diff (invalid/empty → 1).
    const headerRowFirstInput = useStateHook('1');
    const headerRowSecondInput = useStateHook('1');
    // Lossless comparison — default OFF: values are normalized (trimmed +
    // numeric canonicalized, "Retired " === "Retired", "12.00" === "12").
    // ON → strict raw string comparison.
    const lossless = useToggleHook(false);
    const resolveHeaderRow = (raw: string): number => {
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
    };

    const result: CsvDiffResult = csvDiff(first.content, second.content, {
        headerRowFirst: resolveHeaderRow(headerRowFirstInput()),
        headerRowSecond: resolveHeaderRow(headerRowSecondInput()),
        lossless: lossless(),
    });

    // Fully identical CSVs → single quiet line
    const identical =
        result.columnsOnlyInFirst.length === 0 &&
        result.columnsOnlyInSecond.length === 0 &&
        result.cellDifferences.length === 0 &&
        result.rowsOnlyInFirst.length === 0 &&
        result.rowsOnlyInSecond.length === 0;

    if (identical) {
        return (
            <CsvFrame data-testid="file-csv-diff">
                {/* Selector bar renders in the identical state too — switching
                    the header row can turn "identical" into a diff */}
                <HeaderRowBar data-testid="csv-diff-header-row-bar">
                    <HeaderRowControl>
                        Header row ({first.name})
                        <HeaderRowInput
                            type="number"
                            min={1}
                            value={headerRowFirstInput()}
                            onChange={(event) => headerRowFirstInput(event.target.value)}
                            data-testid="csv-diff-header-row-first"
                        />
                    </HeaderRowControl>
                <HeaderRowControl>
                    Header row ({second.name})
                    <HeaderRowInput
                        type="number"
                        min={1}
                        value={headerRowSecondInput()}
                        onChange={(event) => headerRowSecondInput(event.target.value)}
                        data-testid="csv-diff-header-row-second"
                    />
                </HeaderRowControl>
                {/* Lossless toggle — ON = strict raw comparison, OFF
                    (default) = trimmed + numeric-canonicalized values */}
                <LosslessControl data-testid="csv-diff-lossless-control">
                    <LosslessCheckbox
                        type="checkbox"
                        checked={lossless()}
                        onChange={(event) => lossless(event.target.checked)}
                        data-testid="csv-diff-lossless"
                    />
                    Lossless
                </LosslessControl>
                </HeaderRowBar>
                <Muted data-testid="csv-diff-identical">The two CSV files are identical.</Muted>
            </CsvFrame>
        );
    }

    return (
        <CsvFrame data-testid="file-csv-diff">
            {/* Header-row selectors — which raw CSV line is the column
                header of each file (1-based; rows before it are ignored).
                Changing either value recomputes the whole comparison. */}
            <HeaderRowBar data-testid="csv-diff-header-row-bar">
                <HeaderRowControl>
                    Header row ({first.name})
                    <HeaderRowInput
                        type="number"
                        min={1}
                        value={headerRowFirstInput()}
                        onChange={(event) => headerRowFirstInput(event.target.value)}
                        data-testid="csv-diff-header-row-first"
                    />
                </HeaderRowControl>
                <HeaderRowControl>
                    Header row ({second.name})
                    <HeaderRowInput
                        type="number"
                        min={1}
                        value={headerRowSecondInput()}
                        onChange={(event) => headerRowSecondInput(event.target.value)}
                        data-testid="csv-diff-header-row-second"
                    />
                </HeaderRowControl>
                {/* Lossless toggle — ON = strict raw comparison, OFF
                    (default) = trimmed + numeric-canonicalized values */}
                <LosslessControl data-testid="csv-diff-lossless-control">
                    <LosslessCheckbox
                        type="checkbox"
                        checked={lossless()}
                        onChange={(event) => lossless(event.target.checked)}
                        data-testid="csv-diff-lossless"
                    />
                    Lossless
                </LosslessControl>
            </HeaderRowBar>

            {/* Summary — row counts per side */}
            <Section data-testid="csv-diff-summary">
                <SectionTitle>Summary</SectionTitle>
                <ListRow>
                    <ListMarker side="first">1</ListMarker>
                    <span>
                        {first.name}: {result.dataRowCountFirst} data row
                        {result.dataRowCountFirst === 1 ? '' : 's'}
                    </span>
                </ListRow>
                <ListRow>
                    <ListMarker side="second">2</ListMarker>
                    <span>
                        {second.name}: {result.dataRowCountSecond} data row
                        {result.dataRowCountSecond === 1 ? '' : 's'}
                    </span>
                </ListRow>
            </Section>

            {/* Missing columns — header names present in only one file */}
            {result.columnsOnlyInFirst.length > 0 || result.columnsOnlyInSecond.length > 0 ? (
                <Section data-testid="csv-diff-columns">
                    <SectionTitle>Missing columns</SectionTitle>
                    {result.columnsOnlyInFirst.map((column) => (
                        <ListRow key={`col-1-${column}`} data-testid="csv-diff-column">
                            <ListMarker side="first">1</ListMarker>
                            <span>{column}</span>
                            <Muted>only in {first.name}</Muted>
                        </ListRow>
                    ))}
                    {result.columnsOnlyInSecond.map((column) => (
                        <ListRow key={`col-2-${column}`} data-testid="csv-diff-column">
                            <ListMarker side="second">2</ListMarker>
                            <span>{column}</span>
                            <Muted>only in {second.name}</Muted>
                        </ListRow>
                    ))}
                </Section>
            ) : null}

            {/* Cell differences — paired rows with differing cell values.
                The per-couple match percent is merged INTO this table (one
                table per couple: a "match" line with key + percent + line
                numbers, then one line per differing cell). Value columns put
                the SECOND file (green) first, the FIRST file (red) after. */}
            {result.cellDifferences.length > 0 ? (
                <Section data-testid="csv-diff-cells">
                    <SectionTitle>Cell differences</SectionTitle>
                    <DiffTable>
                        <TableHead>Key</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead>Rows</TableHead>
                        <TableHead>Column</TableHead>
                        <TableHead>{second.name}</TableHead>
                        <TableHead>{first.name}</TableHead>
                        {result.cellDifferences.map((difference, index) => {
                            // First difference of a couple → emit the couple's
                            // "match" line above the cell line. Differences
                            // arrive sorted by first-file row number, then
                            // header order (csvDiff.ts emit phase), so a
                            // changed Rows pair marks a new couple.
                            const isNewCouple =
                                index === 0 ||
                                difference.rowNumberFirst !==
                                    result.cellDifferences[index - 1].rowNumberFirst ||
                                difference.rowNumberSecond !==
                                    result.cellDifferences[index - 1].rowNumberSecond;
                            // The couple's match percent comes from the
                            // rowMatches entry with the same line pair
                            const matchPercent = result.rowMatches.find(
                                (match) =>
                                    match.rowNumberFirst === difference.rowNumberFirst &&
                                    match.rowNumberSecond === difference.rowNumberSecond,
                            )?.matchPercent;
                            return (
                                <React.Fragment key={`cell-${index}`}>
                                    {isNewCouple ? (
                                        <>
                                            <TableCell data-testid="csv-diff-cell-row">
                                                {difference.rowKey}
                                            </TableCell>
                                            <MatchPercent percent={matchPercent ?? 0} muted>
                                                {matchPercent ?? 0}%
                                            </MatchPercent>
                                            <TableCell>
                                                {difference.rowNumberFirst} ↔{' '}
                                                {difference.rowNumberSecond}
                                            </TableCell>
                                            {/* Spanner cells keep the grid aligned:
                                                the match line occupies only the
                                                first three columns */}
                                            <TableCell />
                                            <TableCell />
                                            <TableCell />
                                        </>
                                    ) : (
                                        <>
                                            {/* Continuation rows leave the key /
                                                match / rows columns empty */}
                                            <TableCell />
                                            <TableCell />
                                            <TableCell />
                                        </>
                                    )}
                                    <TableCell>{difference.column}</TableCell>
                                    <ValueCell side="second">
                                        {difference.secondValue === '' ? '(empty)' : difference.secondValue}
                                    </ValueCell>
                                    <ValueCell side="first">
                                        {difference.firstValue === '' ? '(empty)' : difference.firstValue}
                                    </ValueCell>
                                </React.Fragment>
                            );
                        })}
                    </DiffTable>
                </Section>
            ) : null}

            {/* Missing rows — present in only one file */}
            {result.rowsOnlyInFirst.length > 0 || result.rowsOnlyInSecond.length > 0 ? (
                <Section data-testid="csv-diff-rows">
                    <SectionTitle>Missing rows</SectionTitle>
                    {result.rowsOnlyInFirst.map((row) => (
                        <ListRow key={`row-1-${row.rowNumber}`} data-testid="csv-diff-row">
                            <ListMarker side="first">1</ListMarker>
                            <span>
                                line {row.rowNumber}: {row.cells.length > 0 ? row.cells.join(', ') : '(empty row)'}
                            </span>
                            <Muted>only in {first.name}</Muted>
                        </ListRow>
                    ))}
                    {result.rowsOnlyInSecond.map((row) => (
                        <ListRow key={`row-2-${row.rowNumber}`} data-testid="csv-diff-row">
                            <ListMarker side="second">2</ListMarker>
                            <span>
                                line {row.rowNumber}: {row.cells.length > 0 ? row.cells.join(', ') : '(empty row)'}
                            </span>
                            <Muted>only in {second.name}</Muted>
                        </ListRow>
                    ))}
                </Section>
            ) : null}
        </CsvFrame>
    );
};
