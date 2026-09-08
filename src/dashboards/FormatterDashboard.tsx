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

// Header bar — modest breathing room (12px vertical / 16px horizontal);
// content stays edge-aligned (no maxWidth centering)
const HeaderBar = styledComponent('header', {
    padding: '12px 16px',
    background: '#0b1120',
    borderBottom: '1px solid #1e293b',
});

// Full-width header content
const HeaderInner = styledComponent('div', {
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

// Content region between header and footer. It is a non-scrolling frame
// split into two columns: the LEFT column is the file sidebar, the RIGHT
// pane renders the selected file's content (placeholder when nothing is
// selected).
const ContentArea = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden' as const,
});

// RIGHT pane — renders the selected file's content (or the placeholder when
// nothing is selected). alignItems/justifyContent only affect the centered
// placeholder; the content view itself fills the full pane.
const ContentPane = styledComponent('div', {
    flex: 1,
    minWidth: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
});

const ContentPlaceholder = styledComponent('div', {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center' as const,
    padding: 32,
});

// Scrollable monospace view for a selected text file's raw content. Fills
// the whole content pane (the pane itself never scrolls — this element does).
const TextView = styledComponent('pre', {
    margin: 0,
    padding: 16,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box' as const,
    overflow: 'auto' as const,
    textAlign: 'left' as const,
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    color: '#e2e8f0',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
});

// Image preview — the image fits INSIDE the pane (never overflows or
// distorts): max 100% of both axes, object-fit: contain keeps aspect ratio.
// Centered by the pane's align/justify. Needs explicit casting for ref-less
// img attributes typing (styledComponent returns React.FC).
const ImageView = styledComponent('img', {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain' as const,
    display: 'block',
}) as unknown as React.FC<React.ImgHTMLAttributes<HTMLImageElement>>;

// Video preview — native player with controls, same fit-inside rules as the
// image view so long/large videos never overflow the pane.
const VideoView = styledComponent('video', {
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'block',
}) as unknown as React.FC<React.VideoHTMLAttributes<HTMLVideoElement>>;

// Binary notice — shown when the selected file's kind is 'binary' (its raw
// content is never rendered; it stays in the session for future features).
const BinaryNotice = styledComponent('div', {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center' as const,
    padding: 32,
});

// Footer bar — modest breathing room (8px vertical / 16px horizontal) to
// match the header; content stays edge-aligned
const FooterBar = styledComponent('footer', {
    padding: '8px 16px',
    background: '#0b1120',
    borderTop: '1px solid #1e293b',
});

// Full-width footer content
const FooterInner = styledComponent('div', {
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

// Shell: renders header + (left file sidebar / right content pane) + footer,
// and handles drag & drop anywhere on the screen (handlers live on the
// full-viewport root element).
const DashboardShell = () => {
    // Capture the shared store during render — calling the accessor inside an
    // event handler would be an invalid hook call
    const store = formatterFileStore();

    // Resolve the active file for content rendering. Content renders ONLY
    // when exactly one file is selected (the current single-select model):
    // activeFileId must match exactly one entry. Multi-select rendering is a
    // deliberately different feature — not implemented here.
    const { files, activeFileId } = store;
    const activeFile =
        activeFileId && files.filter((entry) => entry.name === activeFileId).length === 1
            ? (files.find((entry) => entry.name === activeFileId) ?? null)
            : null;

    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        // Accept EVERY dropped file, not just the first — each becomes its own
        // sidebar entry. Promise.all keeps the read order deterministic so the
        // last file in the drop ends up as the active entry.
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length === 0) return;
        Promise.all(dropped.map(readTextFile)).then((opened) => {
            arrayEach(opened, (entry) => store.openFile(entry.value));
        });
    };

    // preventDefault on dragover is REQUIRED — without it the browser
    // cancels the drag and the drop event never fires. No visual feedback
    // (no outline): the drop simply adds files to the sidebar.
    const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
    };

    return (
        <DashboardRoot
            onDrop={handleDrop}
            onDragOver={handleDragOver}
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
            {/* Content area: LEFT column is the file sidebar, RIGHT pane
                renders the selected file's content (placeholder when nothing
                is selected). The page itself never scrolls. */}
            <ContentArea data-testid="content-area">
                <ConnectedFileSidebar />
                <ContentPane data-testid="content-pane">
                    {/* Single active file → render by its detected kind:
                        image → <img>, video → <video> player, text → text
                        view, binary → notice (raw content never rendered).
                        Nothing selected → placeholder. */}
                    {activeFile ? (
                        activeFile.kind === 'image' ? (
                            <ImageView
                                data-testid="file-content-image"
                                src={activeFile.content}
                                alt={activeFile.name}
                            />
                        ) : activeFile.kind === 'video' ? (
                            <VideoView
                                data-testid="file-content-video"
                                src={activeFile.content}
                                controls
                            />
                        ) : activeFile.kind === 'text' ? (
                            <TextView data-testid="file-content-text">
                                {activeFile.content}
                            </TextView>
                        ) : (
                            <BinaryNotice data-testid="file-content-binary">
                                {activeFile.name} is a binary file — preview is not available.
                            </BinaryNotice>
                        )
                    ) : (
                        <ContentPlaceholder data-testid="content-placeholder">
                            Formatter content will appear here.
                        </ContentPlaceholder>
                    )}
                </ContentPane>
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
