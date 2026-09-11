import React from 'react';
import { styledComponent, useStateHook, useToggleHook } from '@presource/react';
import { csvDiff } from './csvDiff';
import type { CsvDiffResult } from './csvDiff';

// ─── Cell-differences → CSV serialization ────────────────────────────────────
// Builds the clipboard payload for the copy button: a header row (Key,
// Match, Rows, Column, <second file name>, <first file name>) followed by
// one row per differing cell — mirroring the on-screen table exactly.
// RFC-4180 quoting: a field containing a comma, double quote, or newline is
// wrapped in double quotes with internal quotes doubled, so pasting into a
// spreadsheet parses each value as one cell.
const csvEscapeField = (value: string): string => {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
};

const buildCellDifferencesCsv = (
    cellDifferences: CsvDiffResult['cellDifferences'],
    rowMatches: CsvDiffResult['rowMatches'],
    secondName: string,
    firstName: string,
): string => {
    const lines: string[] = [
        ['Key', 'Match', 'Rows', 'Column', secondName, firstName].map(csvEscapeField).join(','),
    ];
    cellDifferences.forEach((difference) => {
        // The couple's match percent comes from the rowMatches entry with
        // the same line pair (same lookup the table render uses)
        const matchPercent = rowMatches.find(
            (match) =>
                match.rowNumberFirst === difference.rowNumberFirst &&
                match.rowNumberSecond === difference.rowNumberSecond,
        )?.matchPercent;
        lines.push(
            [
                difference.rowKey,
                `${matchPercent ?? 0}%`,
                `${difference.rowNumberFirst} ↔ ${difference.rowNumberSecond}`,
                difference.column,
                difference.secondValue === '' ? '(empty)' : difference.secondValue,
                difference.firstValue === '' ? '(empty)' : difference.firstValue,
            ]
                .map(csvEscapeField)
                .join(','),
        );
    });
    // \r\n line endings — RFC-4180's canonical CSV row separator
    return lines.join('\r\n');
};

// ─── CSV comparison view ─────────────────────────────────────────────────────
// Renders the csvDiff result (csvDiff.ts) as a report with four sections:
// 1. Summary — row counts per file
// 2. Missing columns — header names present in only one file
// 3. Cell differences — paired rows with differing values in common
//    columns. Each row couple's match percent is shown IN THIS TABLE (a
//    dedicated "Matched rows" table was merged into it — one table per
//    couple instead of two). Column order: the SECOND-selected file's
//    value (green, the actively selected file) comes FIRST, the
//    FIRST-selected file's value (red) after it. A copy button next to the
//    section header copies the table as CSV (RFC-4180 quoting: values
//    containing commas/quotes/newlines are wrapped in double quotes) so it
//    can be pasted into a spreadsheet or elsewhere.
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

// Grid for the cell-differences table. One table row per DIFFERING CELL —
// flat, proper table (no per-couple header/continuation sub-rows).
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

// Match-percent cell in the cell-differences table — full green at 100%,
// amber below (partial match)
const MatchPercent = styledComponent<{ percent: number }>('span', {
    fontWeight: 700,
    color: ({ percent }) => (percent === 100 ? '#4ade80' : '#fbbf24'),
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

// Section header strip — title + inline icon button (the copy icon sits
// immediately AFTER the "Cell differences" title, not pushed to the far
// right). Used by the Cell differences section.
const SectionHeader = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginBottom: 6,
});

// Copy icon button — borderless icon-only button hugging the section title.
// No '&:hover' nesting — styledComponent's input map is a flat CSS
// property map (PrimaryInput), not an Emotion object-style sheet, so
// pseudo-selectors are not supported there.
const CopyIconButton = styledComponent('button', {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    fontSize: 13,
    lineHeight: 1,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer' as const,
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

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
    // Copy-button feedback — flips to true for a moment after a successful
    // copy so the button label reads "Copied" instead of "Copy CSV"
    const copied = useToggleHook(false);
    const copyCellDifferences = () => {
        const csv = buildCellDifferencesCsv(
            result.cellDifferences,
            result.rowMatches,
            second.name,
            first.name,
        );
        // navigator.clipboard is unavailable on non-secure origins (file://,
        // plain http) — fall back to the legacy execCommand path so the
        // button still works there
        const fallbackCopy = () => {
            const textarea = document.createElement('textarea');
            textarea.value = csv;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
            } finally {
                document.body.removeChild(textarea);
            }
        };
        const done = () => {
            copied(true);
            // Reset the "Copied" label after a short beat
            window.setTimeout(() => copied(false), 1500);
        };
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(csv).then(done, () => {
                fallbackCopy();
                done();
            });
        } else {
            fallbackCopy();
            done();
        }
    };
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
                Flat proper table: ONE table row per differing cell, every
                column filled (key, match%, rows, column, both values).
                Value columns put the SECOND file (green) first, the FIRST
                file (red) after. */}
            {result.cellDifferences.length > 0 ? (
                <Section data-testid="csv-diff-cells">
                    <SectionHeader>
                        <SectionTitle>Cell differences</SectionTitle>
                        {/* Copy icon button — sits immediately after the
                            section title. Serializes the table as CSV (same
                            columns/order as the on-screen table) and puts it
                            on the clipboard for pasting elsewhere. Feedback:
                            the glyph swaps to a checkmark for a moment. */}
                        <CopyIconButton
                            data-testid="csv-diff-cells-copy"
                            onClick={copyCellDifferences}
                            aria-label={copied() ? 'Copied' : 'Copy cell differences as CSV'}
                            title={copied() ? 'Copied' : 'Copy as CSV'}
                        >
                            {/* Clipboard glyph (⎘) / checkmark (✓) on success */}
                            {copied() ? '✓' : '⎘'}
                        </CopyIconButton>
                    </SectionHeader>
                    <DiffTable>
                        <TableHead>Key</TableHead>
                        <TableHead>Match</TableHead>
                        <TableHead>Rows</TableHead>
                        <TableHead>Column</TableHead>
                        <TableHead>{second.name}</TableHead>
                        <TableHead>{first.name}</TableHead>
                        {result.cellDifferences.map((difference, index) => {
                            // The couple's match percent comes from the
                            // rowMatches entry with the same line pair
                            const matchPercent = result.rowMatches.find(
                                (match) =>
                                    match.rowNumberFirst === difference.rowNumberFirst &&
                                    match.rowNumberSecond === difference.rowNumberSecond,
                            )?.matchPercent;
                            return (
                                <React.Fragment key={`cell-${index}`}>
                                    <TableCell data-testid="csv-diff-cell-row">{difference.rowKey}</TableCell>
                                    <MatchPercent percent={matchPercent ?? 0}>
                                        {matchPercent ?? 0}%
                                    </MatchPercent>
                                    <TableCell>
                                        {difference.rowNumberFirst} ↔ {difference.rowNumberSecond}
                                    </TableCell>
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
