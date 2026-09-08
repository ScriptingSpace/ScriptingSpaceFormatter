import React from 'react';
import { styledComponent } from '@presource/react';
import { formatterFileStore } from '../functions';
import type { FormatterFile } from '../functions';

// ─── Sidebar chrome ──────────────────────────────────────────────────────────

// LEFT column of the dashboard (first flex child of ContentArea in
// dashboards/FormatterDashboard.tsx). Fixed width so the content pane to its
// right keeps the remaining space. The list scrolls internally — the page
// itself never scrolls (viewport lock in src/app.css). The divider sits on
// the RIGHT edge of the sidebar since the content lives to its right.
const SidebarRoot = styledComponent('aside', {
    width: 280,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    boxSizing: 'border-box' as const,
    background: '#0b1120',
    borderRight: '1px solid #1e293b',
    overflow: 'hidden' as const,
});

const SidebarHeader = styledComponent('div', {
    padding: '12px 16px',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: '#64748b',
    borderBottom: '1px solid #1e293b',
    flexShrink: 0,
});

// Scrollable file list — the only element inside the sidebar that scrolls
const FileList = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
});

const EmptyHint = styledComponent('div', {
    padding: 16,
    fontSize: 12,
    lineHeight: 1.6,
    color: '#475569',
});

// One entry per accepted file. The active entry gets the raised background +
// bright text; the rest stay muted and clickable.
const FileEntry = styledComponent<{ active: boolean }>(
    'div',
    {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px',
        fontSize: 13,
        borderRadius: 8,
        border: '1px solid transparent',
        background: ({ active }) => (active ? '#16233b' : 'transparent'),
        color: ({ active }) => (active ? '#e2e8f0' : '#94a3b8'),
        cursor: 'pointer',
        userSelect: 'none' as const,
        transition: 'background 150ms ease, color 150ms ease',
        minWidth: 0,
    },
// The entry element only needs the active style prop plus passthrough HTML
// attributes (children are rendered via FileName/EntryClose)
) as unknown as React.FC<
    { active: boolean; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>
>;

// Truncates long file names with an ellipsis so the close button never gets
// pushed out of the entry row
const FileName = styledComponent('span', {
    overflow: 'hidden' as const,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
});

const EntryClose = styledComponent('button', {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 16,
    height: 16,
    padding: 0,
    fontSize: 12,
    lineHeight: 1,
    borderRadius: 4,
    border: 'none',
    background: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
    flexShrink: 0,
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// ─── Sidebar composition ─────────────────────────────────────────────────────

export type FileSidebarProps = {
    // All accepted files, in drop order — rendered one entry per file
    files: FormatterFile[];
    // Currently selected entry (a file name), null when nothing is selected
    activeFileId: string | null;
    // Fired when an entry body is clicked — selects that file
    onSelect: (name: string) => void;
    // Fired when an entry's × is clicked — removes that file from the sidebar
    onClose: (name: string) => void;
};

// Sidebar listing every file accepted by the dashboard. Files enter ONLY by
// dropping them onto the page (the dashboard's global drop handler reads them
// via readTextFile → openFile). Clicking an entry selects it — the dashboard
// then renders that file's content in the pane to the sidebar's right.
export const FileSidebar = ({ files, activeFileId, onSelect, onClose }: FileSidebarProps) => {
    const handleKeyDown = (name: string) => (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter and Space both select the entry when keyboard-focused
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(name);
        }
    };

    return (
        <SidebarRoot data-testid="file-sidebar">
            <SidebarHeader>
                Files{files.length > 0 ? ` (${files.length})` : ''}
            </SidebarHeader>
            <FileList data-testid="file-list">
                {files.length === 0 ? (
                    <EmptyHint data-testid="file-list-empty">
                        No files yet — drop files anywhere on the page to add them here.
                    </EmptyHint>
                ) : (
                    files.map((entry) => (
                        <FileEntry
                            key={entry.name}
                            active={entry.name === activeFileId}
                            onClick={() => onSelect(entry.name)}
                            onKeyDown={handleKeyDown(entry.name)}
                            role="button"
                            tabIndex={0}
                            aria-pressed={entry.name === activeFileId}
                            data-testid={`sidebar-file-${entry.name}`}
                        >
                            <FileName>{entry.name}</FileName>
                            <EntryClose
                                type="button"
                                aria-label={`Remove ${entry.name}`}
                                // Stop propagation so removing a file doesn't
                                // also select it
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onClose(entry.name);
                                }}
                                data-testid={`remove-file-${entry.name}`}
                            >
                                ×
                            </EntryClose>
                        </FileEntry>
                    ))
                )}
            </FileList>
        </SidebarRoot>
    );
};

// Session-wired variant used by the dashboard: reads the shared file session
// from the provider (src/functions/fileStore.ts) so the dashboard shell stays
// a dumb layout without prop-drilling the session.
export const ConnectedFileSidebar = () => {
    // Capture the store during render — calling the accessor inside an event
    // handler would be an invalid hook call
    const store = formatterFileStore();
    return (
        <FileSidebar
            files={store.files}
            activeFileId={store.activeFileId}
            onSelect={store.selectFile}
            onClose={store.closeFile}
        />
    );
};
