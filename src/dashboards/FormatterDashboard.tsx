import React from 'react';
import { arrayEach } from '@presource/core';
import { styledComponent, useStateHook } from '@presource/react';
import { formatterFileStore, FormatterFileProvider, readTextFile } from '../functions';
import type { FormatterFile } from '../functions';
import { ConnectedFileSidebar } from '../components';

// ─── Styled shell ────────────────────────────────────────────────────────────

// Dashboard shell — dark, modern, three-area layout (header / content / footer).
// Locked to the exact viewport (100% × 100%) — the html/body/#root chain is
// zero-margin and overflow:hidden via src/app.css, so no window scrollbar.
const DashboardRoot = styledComponent('div', {
    height: '100%',
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: '#0f172a',
    color: '#e2e8f0',
    fontFamily:
        'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    boxSizing: 'border-box' as const,
    overflow: 'hidden' as const,
});

const HeaderBar = styledComponent('header', {
    padding: '20px 16px',
    background: '#0b1120',
    borderBottom: '1px solid #1e293b',
});

const HeaderInner = styledComponent('div', {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
});

const HeaderTitle = styledComponent('h1', {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#f8fafc',
});

const HeaderSubtitle = styledComponent('p', {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
});

// Content region between header and footer. It is a positioned, non-scrolling
// frame split into two columns: the LEFT pane is reserved for formatter
// output (intentionally empty for now), the RIGHT column is the file sidebar.
// The dashed drop outline is absolutely positioned inside this area.
const ContentArea = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    position: 'relative' as const,
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden' as const,
});

// LEFT pane — reserved for the formatter content. Deliberately left empty
// (placeholder only); future formatting features will render here.
const ContentPane = styledComponent('div', {
    flex: 1,
    minWidth: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
});

const ContentPlaceholder = styledComponent('div', {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center' as const,
    padding: 32,
});

// Dashed drop outline covering ONLY the content area (absolute inside
// ContentArea — not the viewport), inset 12px so it floats with breathing
// room from the header/footer borders and window edges. Only shown while NO
// file has been accepted yet. It intensifies (accent border + scrim + label)
// while a drag is in progress. pointerEvents: none keeps the UI underneath
// fully clickable.
const DropOutline = styledComponent<{ active: boolean }>('div', {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: ({ active }) => `3px dashed ${active ? '#38bdf8' : '#24344d'}`,
    background: ({ active }) => (active ? 'rgba(15, 23, 42, 0.75)' : 'transparent'),
    fontSize: 20,
    fontWeight: 600,
    color: '#7dd3fc',
    pointerEvents: 'none' as const,
    transition: 'border-color 150ms ease, background 150ms ease',
});

// Footer bar — third page area (header / content / footer)
const FooterBar = styledComponent('footer', {
    padding: '10px 16px',
    background: '#0b1120',
    borderTop: '1px solid #1e293b',
});

const FooterInner = styledComponent('div', {
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: 12,
    color: '#64748b',
});

// ─── Dashboard composition ───────────────────────────────────────────────────

// Top-level wrapper: owns the multi-file session state and shares it with the
// sidebar (and future content-pane features) through the FormatterFileProvider
// context (src/functions/fileStore.ts). Each accepted file becomes one sidebar
// entry; a re-drop of the same file name replaces that entry's content.
export const FormatterDashboard = React.memo(() => {
    // All accepted files, in drop order
    const files = useStateHook<FormatterFile[]>([]);
    // Currently selected sidebar entry (a file name), null when nothing is selected
    const activeFileId = useStateHook<string | null>(null);

    // Real session implementation injected into the file context.
    // Every mutation re-creates the array/object so subscribers see updates.
    const session = {
        files: files(),
        activeFileId: activeFileId(),
        openFile: (next: FormatterFile) => {
            const current = files();
            // Same name → replace that entry's content (re-load);
            // new name → append a new entry. Either way it becomes active.
            files(
                current.some((entry) => entry.name === next.name)
                    ? current.map((entry) => (entry.name === next.name ? next : entry))
                    : [...current, next],
            );
            activeFileId(next.name);
        },
        selectFile: (name: string) => activeFileId(name),
        updateContent: (name: string, content: string) => {
            files(files().map((entry) => (entry.name === name ? { ...entry, content } : entry)));
        },
        closeFile: (name: string) => {
            const remaining = files().filter((entry) => entry.name !== name);
            files(remaining);
            // If the removed entry was active, fall back to the most recent one
            if (activeFileId() === name) {
                activeFileId(remaining.length ? remaining[remaining.length - 1].name : null);
            }
        },
    };

    return (
        <FormatterFileProvider data={session}>
            <DashboardShell />
        </FormatterFileProvider>
    );
});

// Shell: renders header + (left content pane / right file sidebar) + footer,
// and handles drag & drop anywhere on the screen (handlers live on the
// full-viewport root element).
const DashboardShell = () => {
    // Local visual state — kept here (below the provider) so drag hover
    // doesn't churn the shared file context
    const dragOver = useStateHook(false);
    // Capture the shared store during render — calling the accessor inside an
    // event handler would be an invalid hook call
    const store = formatterFileStore();

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragOver(false);
        // Accept EVERY dropped file, not just the first — each becomes its own
        // sidebar entry. Promise.all keeps the read order deterministic so the
        // last file in the drop ends up as the active entry.
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length === 0) return;
        Promise.all(dropped.map(readTextFile)).then((opened) => {
            arrayEach(opened, (entry) => store.openFile(entry.value));
        });
    };

    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        dragOver(true);
    };

    // relatedTarget guard: ignore dragleave events fired when moving between
    // the root's own children (prevents overlay flicker)
    const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
        const related = event.relatedTarget as HTMLElement | null;
        if (related && event.currentTarget.contains(related)) return;
        dragOver(false);
    };

    return (
        <DashboardRoot
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            data-testid="dashboard-root"
        >
            <HeaderBar>
                <HeaderInner>
                    <HeaderTitle>Formatter Dashboard</HeaderTitle>
                    <HeaderSubtitle>
                        Drop files anywhere — they are collected in the sidebar.
                    </HeaderSubtitle>
                </HeaderInner>
            </HeaderBar>
            {/* Content area: LEFT pane reserved for formatter output
                (placeholder for now), RIGHT column is the file sidebar. The
                dashed outline lives INSIDE here (absolute); the page itself
                never scrolls. */}
            <ContentArea>
                <ContentPane data-testid="content-pane">
                    <ContentPlaceholder data-testid="content-placeholder">
                        Formatter content will appear here.
                    </ContentPlaceholder>
                </ContentPane>
                <ConnectedFileSidebar />
                {/* The dashed outline is the empty-state drop affordance: it
                    only shows while NO file has been accepted. Once files are
                    in the sidebar the outline disappears (dropping more files
                    still works — the root handles it). */}
                {store.files.length === 0 ? (
                    <DropOutline active={dragOver()} data-testid="drop-outline">
                        {dragOver() ? 'Drop to add files' : null}
                    </DropOutline>
                ) : null}
            </ContentArea>
            <FooterBar data-testid="dashboard-footer">
                <FooterInner>
                    <span>Formatter Dashboard</span>
                    <span>
                        {store.files.length} file{store.files.length === 1 ? '' : 's'} loaded
                    </span>
                </FooterInner>
            </FooterBar>
        </DashboardRoot>
    );
};
