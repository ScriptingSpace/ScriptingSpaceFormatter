import React from 'react';
import { styledComponent } from '@presource/react';
import { csvDiff } from './csvDiff';
import type { CsvDiffResult } from './csvDiff';

// ─── CSV comparison view ─────────────────────────────────────────────────────
// Renders the csvDiff result (csvDiff.ts) as a report with five sections:
// 1. Summary — row counts per file
// 2. Missing columns — header names present in only one file
// 3. Matched rows — paired row couples (row ↔ row) with their match
//    percent. 100% rows exist in both files (possibly at a different
//    position); partial matches show how close the paired rows are.
// 4. Cell differences — paired rows with differing values in common
//    columns
// 5. Missing rows — rows present in only one file (no acceptable match
//    anywhere in the other file)
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

// Grid for tabular report sections — matched rows and cell differences.
// Matched rows:   first line ↔ second line | match%
// Cell diffs:     key | rows | column | first value | second value
const MatchTable = styledComponent('div', {
    display: 'grid' as const,
    gridTemplateColumns: 'minmax(120px, max-content) minmax(80px, max-content)',
    width: 'max-content' as const,
    minWidth: '100%',
    gap: '2px 12px',
});

const DiffTable = styledComponent('div', {
    display: 'grid' as const,
    gridTemplateColumns:
        'minmax(60px, max-content) minmax(90px, max-content) minmax(90px, max-content) minmax(0, 1fr) minmax(0, 1fr)',
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

// Match-percent cell — full green at 100%, amber below (partial match)
const MatchPercent = styledComponent<{ percent: number }>('span', {
    fontWeight: 700,
    color: ({ percent }) => (percent === 100 ? '#4ade80' : '#fbbf24'),
});

// Value cell tinted by which side it came from (matches the diff view's
// red = removed / green = added convention)
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

// ─── Component ───────────────────────────────────────────────────────────────
// Recomputes the diff on every render — pure and deterministic for a given
// (first, second) content pair.
export const FileCsvDiffView = ({
    first,
    second,
}: {
    first: { name: string; content: string };
    second: { name: string; content: string };
}) => {
    const result: CsvDiffResult = csvDiff(first.content, second.content);

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
                <Muted data-testid="csv-diff-identical">The two CSV files are identical.</Muted>
            </CsvFrame>
        );
    }

    return (
        <CsvFrame data-testid="file-csv-diff">
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

            {/* Matched rows — row ↔ row couples with match percent. Rendered
                whenever any pair exists (even all-100%: with other sections
                present the coupling information is the report's backbone) */}
            {result.rowMatches.length > 0 ? (
                <Section data-testid="csv-diff-matches">
                    <SectionTitle>Matched rows</SectionTitle>
                    <MatchTable>
                        <TableHead>Rows ({first.name} ↔ {second.name})</TableHead>
                        <TableHead>Match</TableHead>
                        {result.rowMatches.map((match) => (
                            <React.Fragment key={`match-${match.rowNumberFirst}`}>
                                <TableCell data-testid="csv-diff-match-row">
                                    line {match.rowNumberFirst} ↔ line {match.rowNumberSecond}
                                </TableCell>
                                <MatchPercent percent={match.matchPercent}>
                                    {match.matchPercent}%
                                </MatchPercent>
                            </React.Fragment>
                        ))}
                    </MatchTable>
                </Section>
            ) : null}

            {/* Cell differences — paired rows with differing cell values */}
            {result.cellDifferences.length > 0 ? (
                <Section data-testid="csv-diff-cells">
                    <SectionTitle>Cell differences</SectionTitle>
                    <DiffTable>
                        <TableHead>Key</TableHead>
                        <TableHead>Rows</TableHead>
                        <TableHead>Column</TableHead>
                        <TableHead>{first.name}</TableHead>
                        <TableHead>{second.name}</TableHead>
                        {result.cellDifferences.map((difference, index) => (
                            <React.Fragment key={`cell-${index}`}>
                                <TableCell data-testid="csv-diff-cell-row">{difference.rowKey}</TableCell>
                                <TableCell>
                                    {difference.rowNumberFirst} ↔ {difference.rowNumberSecond}
                                </TableCell>
                                <TableCell>{difference.column}</TableCell>
                                <ValueCell side="first">{difference.firstValue === '' ? '(empty)' : difference.firstValue}</ValueCell>
                                <ValueCell side="second">{difference.secondValue === '' ? '(empty)' : difference.secondValue}</ValueCell>
                            </React.Fragment>
                        ))}
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
