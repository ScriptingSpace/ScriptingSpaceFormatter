import React from 'react';
import { styledComponent, useStateHook } from '@presource/react';
import { formatterFileStore } from '../../functions';
import type { FormatterFile } from '../../functions';

// ─── Sidebar chrome ──────────────────────────────────────────────────────────

// LEFT column content assigned by SidebarPlugin into the dashboard's sidebar
// slot (dashboards/FormatterDashboard.tsx provides the 280px column geometry;
// this root fills it 100%). The list scrolls internally — the page itself
// never scrolls (viewport lock in src/app.css). The divider sits on the
// RIGHT edge of the sidebar since the content lives to its right.
const SidebarRoot = styledComponent('aside', {
    width: '100%',
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

// Insertion indicator — a 2px accent line rendered BETWEEN two entries at
// the exact position where the dragged entry would land. A line (not an
// outline) is used because dropping INSERTS the entry at that slot; an
// outline on the hovered entry would wrongly suggest a "replace" semantic.
const DropLine = styledComponent('div', {
    height: 2,
    flexShrink: 0,
    borderRadius: 1,
    background: '#3b82f6',
    margin: '0 4px',
});

// One entry per accepted file. The active entry gets the raised background +
// bright text; the rest stay muted and clickable. Every entry is draggable:
// dragging one between others shows the DropLine insertion indicator and
// dropping reorders the list. `dragging` dims the entry in flight.
const FileEntry = styledComponent<{
    active: boolean;
    dragging: boolean;
}>(
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
        // Dimmed while its own drag is in flight — a subtle "this one moves" cue
        opacity: ({ dragging }) => (dragging ? 0.4 : 1),
    },
// The entry element only needs the style props plus passthrough HTML
// attributes (children are rendered via FileName/EntryClose)
) as unknown as React.FC<
    {
        active: boolean;
        dragging: boolean;
        children: React.ReactNode;
    } & React.HTMLAttributes<HTMLDivElement>
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
    // Fired when a dragged entry is dropped between others — reorders the
    // list so the dragged entry is INSERTED at `toIndex` (0..files.length,
    // measured against the list BEFORE the move)
    onMove: (fromName: string, toIndex: number) => void;
};

// Sidebar listing every file accepted by the dashboard. Files enter ONLY by
// dropping them onto the page (the dashboard's global drop handler reads them
// via readTextFile → openFile). Clicking an entry selects it — the dashboard
// then renders that file's content in the pane to the sidebar's right.
// Entries can also be dragged BETWEEN each other to re-order the list: the
// pointer's position relative to the hovered entry's vertical midpoint picks
// the insertion slot, a DropLine marks it between the two entries, and
// dropping fires onMove(fromName, toIndex).
export const FileSidebar = ({ files, activeFileId, onSelect, onClose, onMove }: FileSidebarProps) => {
    // HTML5 drag state — the entry being dragged (a file name) and the
    // insertion index (0..files.length) where the DropLine currently sits.
    // insertAt is null when no valid drop position is hovered.
    const dragName = useStateHook<string | null>(null);
    const insertAt = useStateHook<number | null>(null);

    // Resets both drag trackers — shared by drop and dragend
    const endDrag = () => {
        dragName(null);
        insertAt(null);
    };

    const handleKeyDown = (name: string) => (event: React.KeyboardEvent<HTMLDivElement>) => {
        // Enter and Space both select the entry when keyboard-focused
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(name);
        }
    };

    // Per-entry HTML5 drag handlers. dataTransfer.setData is required for
    // Firefox to initiate a drag; the move effect signals reordering intent.
    const dragHandlers = (name: string, index: number) => ({
        draggable: true,
        onDragStart: (event: React.DragEvent<HTMLDivElement>) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', name);
            dragName(name);
        },
        onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
            if (!dragName()) return;
            // preventDefault is required or the browser cancels the drop
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            // Insert-above vs insert-below is decided by the pointer's
            // position relative to the entry's vertical midpoint (jsdom
            // rects are zero-sized → tests pass explicit clientY values)
            const rect = event.currentTarget.getBoundingClientRect();
            const before = event.clientY < rect.top + rect.height / 2;
            const target = before ? index : index + 1;
            // Suppress the line when the insertion would not change the
            // order — dropping immediately before/after itself is a no-op
            const fromIndex = files.findIndex((entry) => entry.name === dragName());
            insertAt(target === fromIndex || target === fromIndex + 1 ? null : target);
        },
        onDrop: (event: React.DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            event.stopPropagation();
            // Guard against dropped foreign payloads: only accept a drop
            // whose drag started on one of OUR entries (dragName set) AND
            // has a valid insertion slot (insertAt not null)
            const from = dragName();
            const at = insertAt();
            if (from && at !== null) onMove(from, at);
            endDrag();
        },
        onDragEnd: endDrag,
    });

    // List-level dragleave: clears the DropLine when the pointer truly
    // exits the list. Leave events bubble from child entries mid-traversal,
    // so only clear when the related target is outside the list (jsdom
    // provides no relatedTarget → null → clears, which tests rely on).
    const handleListDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        const next = event.relatedTarget as Node | null;
        if (!next || !event.currentTarget.contains(next)) insertAt(null);
    };

    return (
        <SidebarRoot data-testid="file-sidebar">
            <SidebarHeader>
                Files{files.length > 0 ? ` (${files.length})` : ''}
            </SidebarHeader>
            <FileList data-testid="file-list" onDragLeave={handleListDragLeave}>
                {files.length === 0 ? (
                    <EmptyHint data-testid="file-list-empty">
                        No files yet — drop files anywhere on the page to add them here.
                    </EmptyHint>
                ) : (
                    <>
                        {files.map((entry, index) => (
                            <React.Fragment key={entry.name}>
                                {/* Insertion line BEFORE this entry (index slot) */}
                                {insertAt() === index && <DropLine data-testid="drop-line" />}
                                <FileEntry
                                    active={entry.name === activeFileId}
                                    dragging={dragName() === entry.name}
                                    onClick={() => onSelect(entry.name)}
                                    onKeyDown={handleKeyDown(entry.name)}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={entry.name === activeFileId}
                                    data-testid={`sidebar-file-${entry.name}`}
                                    {...dragHandlers(entry.name, index)}
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
                            </React.Fragment>
                        ))}
                        {/* Insertion line AFTER the last entry (index == length) */}
                        {insertAt() === files.length && <DropLine data-testid="drop-line" />}
                    </>
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
            onMove={store.moveFile}
        />
    );
};
