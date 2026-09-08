import React from 'react';
import { arrayEach } from '@presource/core';
import { styledComponent, useStateHook } from '@presource/react';
import { formatterFileStore, FormatterFileProvider } from '../functions';
import { defaultPlugins } from '../plugins';
import type { DashboardPlugin } from '../plugins';
import type { FormatterFile } from '../functions';

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
// content stays edge-aligned (no maxWidth centering). Laid out as a row:
// plugins' header-slot nodes render inside it in sequence order (identity
// block with flex:1 LEFT, export button RIGHT).
const HeaderBar = styledComponent('header', {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    padding: '12px 16px',
    background: '#0b1120',
    borderBottom: '1px solid #1e293b',
});

// Content region between header and footer. It is a non-scrolling frame
// split into two columns: the LEFT column is the sidebar slot area, the
// RIGHT pane renders what the plugins contribute for the selected file.
const ContentArea = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden' as const,
});

// LEFT column — the sidebar slot area. The column owns the geometry (fixed
// 280px, divider on its right edge); sidebar plugins fill it 100% wide.
const SidebarColumn = styledComponent('div', {
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

// RIGHT pane — renders the plugins' content contributions (or the placeholder
// when nothing is selected / no plugin rendered). alignItems/justifyContent
// only affect the centered placeholder and media previews; 100%-sized views
// (text) fill the full pane.
const ContentPane = styledComponent('div', {
    flex: 1,
    minWidth: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
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

// ─── Content tabs (multi-plugin render) ──────────────────────────────────────

// When TWO OR MORE plugins contribute content for the same selected file,
// the pane switches to tabs: one tab per contributing plugin, in plugin
// sequence order. The tab bar sits on top; the active plugin's node fills
// the remaining space.

// Full-size column wrapper for the tabbed layout — the ContentPane centers
// single contributions, so the tabbed layout needs its own fill-everything
// container.
const ContentTabs = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
});

const TabBar = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row',
    gap: 4,
    padding: '8px 16px 0',
    flexShrink: 0,
    borderBottom: '1px solid #1e293b',
    background: '#0b1120',
});

// One tab per contributing plugin. Active tab gets the raised background +
// bright text; the rest stay muted and clickable.
const TabButton = styledComponent<{ active: boolean }>(
    'button',
    {
        padding: '6px 14px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: '8px 8px 0 0',
        border: '1px solid #1e293b',
        borderBottom: 'none' as const,
        background: ({ active }) => (active ? '#0f172a' : 'transparent'),
        color: ({ active }) => (active ? '#e2e8f0' : '#64748b'),
        cursor: 'pointer',
    },
// The element only needs the style prop plus passthrough button attributes
// (type/onClick/data-testid) — the same cast pattern as ExportPdfButton in
// plugins/exportPdf/ExportPdfPlugin.tsx
) as unknown as React.FC<
    { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
>;

// Panel below the tab bar — fills the remaining space and centers its
// content (media previews), while 100%-sized children (text view) fill it.
const TabPanel = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
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

export type FormatterDashboardProps = {
    // Plugin sequence the dashboard executes. Defaults to defaultPlugins —
    // tests and consumers can inject extra plugins to add header/sidebar
    // assignments or additional content contributions (which trigger tabs).
    plugins?: DashboardPlugin[];
};

// Top-level executor: owns the multi-file session state and runs the plugin
// sequence. It exposes three target areas to the plugins — header slot,
// sidebar slot and the content area — plus two callback hooks: files dropped
// on the page (onFilesDropped) and a sidebar file selected (renderFile).
// Each accepted file becomes one sidebar entry; a re-drop of the same file
// name replaces that entry's content.
export const FormatterDashboard = React.memo(
    ({ plugins = defaultPlugins }: FormatterDashboardProps) => {
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
            // Sidebar background click: clear the selection entirely — the
            // content pane falls back to its placeholder (no active file)
            deselectFiles: () => activeFileId(null),
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
            // Sidebar drag & drop reorder: remove the `from` entry and INSERT it
            // at `toIndex`. The index is measured against the ORIGINAL list, so
            // once the dragged entry is spliced out, positions after it shift
            // down by one — compensated when fromIndex < toIndex. Guarded no-ops:
            // unknown names / out-of-range indexes / unchanged order never write
            // state. The active selection is name-based, so reordering never
            // changes which file is active.
            moveFile: (fromName: string, toIndex: number) => {
                const current = files();
                const fromIndex = current.findIndex((entry) => entry.name === fromName);
                if (fromIndex === -1 || toIndex < 0 || toIndex > current.length) return;
                const reordered = [...current];
                // Remove the dragged entry first — splice re-indexes the rest
                const [moved] = reordered.splice(fromIndex, 1);
                reordered.splice(fromIndex < toIndex ? toIndex - 1 : toIndex, 0, moved);
                // Skip the state write entirely when the order is unchanged
                if (reordered.every((entry, index) => entry.name === current[index].name)) return;
                files(reordered);
            },
        };

        return (
            <FormatterFileProvider data={session}>
                <DashboardShell plugins={plugins} />
            </FormatterFileProvider>
        );
    },
);

// ─── Plugin execution + shell layout ─────────────────────────────────────────

// Shell: runs the plugin sequence against the shared session and renders
// header + (left sidebar slot area / right content pane) + footer. It also
// handles drag & drop anywhere on the screen by firing every plugin hooked
// into onFilesDropped (handlers live on the full-viewport root element).
const DashboardShell = ({ plugins }: { plugins: DashboardPlugin[] }) => {
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

    // ── Plugin execution: content hook ──
    // Sequence-run every plugin's renderFile against the active file and
    // collect the contributions in plugin order. One contribution → direct
    // render; two or more → tabs.
    const rendered: { pluginId: string; label: string; node: React.ReactNode }[] = [];
    if (activeFile) {
        arrayEach(plugins, ({ value: plugin }) => {
            if (!plugin.renderFile) return;
            const node = plugin.renderFile(activeFile);
            // null / undefined → the plugin contributes nothing for this file
            if (node !== null && node !== undefined) {
                rendered.push({ pluginId: plugin.id, label: plugin.label ?? plugin.id, node });
            }
        });
    }

    // Active tab = the selected plugin id. Falls back to the first
    // contributor whenever the selection is stale (file changed / plugin set
    // changed / initial render), so the tab state never points at a missing
    // panel.
    const selectedTab = useStateHook<string | null>(null);
    const visibleId = rendered.some((entry) => entry.pluginId === selectedTab())
        ? (selectedTab() as string)
        : rendered.length
          ? rendered[0].pluginId
          : null;

    // ── Plugin execution: static slots ──
    // Gather header / sidebar slot assignments in plugin sequence order.
    const headerNodes: { pluginId: string; node: React.ReactNode }[] = [];
    const sidebarNodes: { pluginId: string; node: React.ReactNode }[] = [];
    arrayEach(plugins, ({ value: plugin }) => {
        if (plugin.slots?.header) headerNodes.push({ pluginId: plugin.id, node: plugin.slots.header });
        if (plugin.slots?.sidebar) sidebarNodes.push({ pluginId: plugin.id, node: plugin.slots.sidebar });
    });

    // Global drop: fire every plugin hooked into onFilesDropped, in sequence
    // order. Each plugin decides what to do with the dropped browser Files
    // (the file-reader plugin reads and opens them as sidebar entries).
    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length === 0) return;
        arrayEach(plugins, ({ value: plugin }) => {
            plugin.onFilesDropped?.(dropped, { store });
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
            {/* Header: plugins' header-slot nodes, in sequence order */}
            <HeaderBar data-testid="dashboard-header">
                {headerNodes.map(({ pluginId, node }) => (
                    <React.Fragment key={pluginId}>{node}</React.Fragment>
                ))}
            </HeaderBar>
            {/* Content area: LEFT column holds the plugins' sidebar slots,
                RIGHT pane renders the content contributions for the selected
                file (placeholder when nothing is selected / contributed).
                The page itself never scrolls. */}
            <ContentArea data-testid="content-area">
                <SidebarColumn data-testid="sidebar-column">
                    {sidebarNodes.map(({ pluginId, node }) => (
                        <React.Fragment key={pluginId}>{node}</React.Fragment>
                    ))}
                </SidebarColumn>
                <ContentPane data-testid="content-pane">
                    {/* No contributions → placeholder. One → render it
                        directly. Two or more → tabs, one per contributing
                        plugin, in sequence order. */}
                    {rendered.length === 0 ? (
                        <ContentPlaceholder data-testid="content-placeholder">
                            Formatter content will appear here.
                        </ContentPlaceholder>
                    ) : rendered.length === 1 ? (
                        rendered[0].node
                    ) : (
                        <ContentTabs data-testid="content-tabs">
                            <TabBar>
                                {rendered.map(({ pluginId, label }) => (
                                    <TabButton
                                        key={pluginId}
                                        type="button"
                                        active={pluginId === visibleId}
                                        onClick={() => selectedTab(pluginId)}
                                        data-testid={`content-tab-${pluginId}`}
                                    >
                                        {label}
                                    </TabButton>
                                ))}
                            </TabBar>
                            {/* Only the active plugin's node is mounted */}
                            <TabPanel data-testid={`content-tab-panel-${visibleId}`}>
                                {rendered.find((entry) => entry.pluginId === visibleId)?.node}
                            </TabPanel>
                        </ContentTabs>
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
