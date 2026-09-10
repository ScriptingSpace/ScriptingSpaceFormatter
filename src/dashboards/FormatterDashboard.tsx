import React from 'react';
import { arrayEach } from '@presource/core';
import { styledComponent, useStateHook, useReferenceHook } from '@presource/react';
import { formatterFileStore, FormatterFileProvider } from '../functions';
import { defaultPlugins } from '../plugins';
import type { DashboardPlugin, DashboardMenuItem } from '../plugins';
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

// ─── Header dropdown menu ────────────────────────────────────────────────────

// The header's right-side action area: a single dropdown button whose menu
// aggregates EVERY plugin's `menus` contributions (one row per item, in
// plugin sequence order). Plugins no longer render standalone header
// controls — they add items into this menu instead.

// Wrapper for the trigger + panel — `position: relative` anchors the
// absolutely-positioned panel below the button
const HeaderMenuArea = styledComponent('div', {
    position: 'relative' as const,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end' as const,
});

// Dropdown trigger — matches the shell's button styling family
const HeaderMenuButton = styledComponent('button', {
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    borderRadius: 8,
    border: '1px solid #3b82f6',
    background: '#2563eb',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
}) as unknown as React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>>;

// Chevron glyph inside the trigger — rotates 180° while the menu is open
const HeaderMenuChevron = styledComponent<{ open: boolean }>('span', {
    fontSize: 10,
    lineHeight: 1,
    display: 'inline-block' as const,
    transform: ({ open }) => (open ? 'rotate(180deg)' : 'rotate(0deg)'),
    transition: 'transform 150ms ease',
});

// The dropdown panel — absolutely positioned under the trigger, right-aligned
// so it never overflows the header's right edge. Rows are stacked vertically.
const HeaderMenuPanel = styledComponent('div', {
    position: 'absolute' as const,
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: 220,
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
    padding: 6,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    zIndex: 10,
});

// One menu row — a full-width clickable strip; hover raises it slightly.
// The row itself is a plain <div role="menuitem"> so the ITEM decides its
// inner layout (label + inline error, etc.). NOTE: styledComponent's input
// type only accepts React.CSSProperties keys — no nested selectors — so the
// hover highlight is applied via the row's onMouseOver/onMouseOut handlers
// driven by a `hovered` prop (cross-reference: presource/react
// styled-component.tsx PrimaryInput type, line 79).
const HeaderMenuRow = styledComponent<{ hovered: boolean }>('div', {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    fontSize: 13,
    borderRadius: 6,
    color: '#e2e8f0',
    cursor: 'pointer',
    userSelect: 'none' as const,
    background: ({ hovered }) => (hovered ? '#16233b' : 'transparent'),
});

// Full-width invisible button wrapper INSIDE a row — the actual click
// target (a real <button> for a11y/testability) stretched over the row
const HeaderMenuRowButton = styledComponent('button', {
    all: 'unset' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    cursor: 'pointer',
    color: 'inherit',
    font: 'inherit',
});

// ─── Multi-select file options ───────────────────────────────────────────────

// When TWO OR MORE files are selected on the sidebar, the pane switches to
// file options: one option per selected file, in SELECTION order. The option
// bar sits on top; the FOCUSED file's (last selected) content fills the
// remaining space.

// Full-size column wrapper for the file-options layout — the ContentPane
// centers single contributions, so the multi-select layout needs its own
// fill-everything container.
const FileOptions = styledComponent('div', {
    width: '100%',
    height: '100%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
});

const FileOptionBar = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row',
    gap: 4,
    padding: '8px 16px 0',
    flexShrink: 0,
    borderBottom: '1px solid #1e293b',
    background: '#0b1120',
});

// One option per selected file. The FOCUSED option (last selected) gets the
// raised background + bright text; the rest stay muted and clickable —
// clicking one focuses it without changing the selection membership.
const FileOptionButton = styledComponent<{ active: boolean }>(
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
// (type/onClick/data-testid) — the same cast pattern as TabButton above
) as unknown as React.FC<
    { active: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>
>;

// Panel below the option bar — fills the remaining space and centers its
// content (media previews), while 100%-sized children (text view) fill it.
const FileOptionPanel = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden' as const,
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

// ─── Header dropdown menu component ─────────────────────────────────────────

// The header's single dropdown. Aggregates every plugin's `menus` items into
// one panel (one row per item, in plugin sequence order). Open/close is
// owned here; items decide per-action whether to close via closeMenu().
const HeaderMenu = ({ items }: { items: DashboardMenuItem[] }) => {
    // Open state of the dropdown panel
    const open = useStateHook(false);

    // Ref for the outside-click dismiss: any pointer-down OUTSIDE the menu
    // area closes the panel. Document-level listener is armed only while
    // open so closed-state clicks never fight the opening click.
    // (styledComponent returns React.FC without ref typing — cast like the
    // presource knowledge.md ForwardRefExoticComponent pattern.)
    const areaRef = useReferenceHook<HTMLDivElement | null>(null);
    const AreaWithRef = HeaderMenuArea as unknown as React.FC<
        React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }
    >;
    React.useEffect(() => {
        if (!open()) return;
        const handlePointerDown = (event: MouseEvent) => {
            const area = areaRef();
            // Click inside the trigger/panel → leave the menu alone (rows
            // handle their own clicks; the trigger toggles)
            if (area && area.contains(event.target as Node)) return;
            open(false);
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [open()]);

    return (
        <AreaWithRef ref={areaRef} data-testid="header-menu">
            <HeaderMenuButton
                type="button"
                aria-haspopup="menu"
                aria-expanded={open()}
                onClick={() => open(!open())}
                data-testid="header-menu-button"
            >
                Actions
                <HeaderMenuChevron open={open()} aria-hidden={true}>
                    ▼
                </HeaderMenuChevron>
            </HeaderMenuButton>
            {/* Panel mounts ONLY while open — rows (and their store reads)
                exist in the DOM solely during the open state. Hover tracking
                lives on the row wrapper (styledComponent has no nested
                selector support — see the HeaderMenuRow comment). */}
            {open() ? (
                <HeaderMenuPanel role="menu" data-testid="header-menu-panel">
                    {items.map((item) => (
                        <HeaderMenuRowItem key={item.id} item={item} closeMenu={() => open(false)} />
                    ))}
                </HeaderMenuPanel>
            ) : null}
        </AreaWithRef>
    );
};

// One menu row with its own hover tracking — isolated per row so hovering
// one row does not re-render the whole menu
const HeaderMenuRowItem = ({
    item,
    closeMenu,
}: {
    item: DashboardMenuItem;
    closeMenu: () => void;
}) => {
    // Hover state drives the row highlight (no CSS nested selectors in
    // styledComponent inputs)
    const hovered = useStateHook(false);
    const Row = HeaderMenuRow as unknown as React.FC<
        { hovered: boolean } & React.HTMLAttributes<HTMLDivElement>
    >;
    return (
        <Row
            hovered={hovered()}
            role="menuitem"
            onMouseOver={() => hovered(true)}
            onMouseOut={() => hovered(false)}
            data-testid={`menu-item-${item.id}`}
        >
            <item.render closeMenu={closeMenu} />
        </Row>
    );
};

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
// on the page (onFilesDropped) and the multi-selection (renderFile renders
// the FOCUSED — last selected — file). Each accepted file becomes one
// sidebar entry; a re-drop of the same file name replaces that entry's
// content. Sidebar entries are a MULTI-selection: clicking toggles a name
// in/out; with several selected the content pane shows one option per file.
export const FormatterDashboard = React.memo(
    ({ plugins = defaultPlugins }: FormatterDashboardProps) => {
        // All accepted files, in drop order
        const files = useStateHook<FormatterFile[]>([]);
        // Multi-select: ALL currently selected sidebar entries (file names),
        // in SELECTION order — the LAST entry is the focused one whose
        // content the pane renders
        const activeFileIds = useStateHook<string[]>([]);

        // Real session implementation injected into the file context.
        // Every mutation re-creates the array/object so subscribers see updates.
        const session = {
            files: files(),
            activeFileIds: activeFileIds(),
            openFile: (next: FormatterFile) => {
                const current = files();
                // Same name → replace that entry's content (re-load);
                // new name → append a new entry. Either way it becomes the
                // ONLY selected one (a drop activates the latest file).
                files(
                    current.some((entry) => entry.name === next.name)
                        ? current.map((entry) => (entry.name === next.name ? next : entry))
                        : [...current, next],
                );
                activeFileIds([next.name]);
            },
            // Sidebar entry click: TOGGLE the name in/out of the selection.
            // Clicking an unselected entry ADDS it (and makes it focused, i.e.
            // the last entry); clicking a selected one REMOVES it. When the
            // focused (last) entry is removed this way, focus falls back to
            // the new last entry.
            selectFile: (name: string) => {
                const current = activeFileIds();
                if (current.includes(name)) {
                    const next = current.filter((entry) => entry !== name);
                    activeFileIds(next);
                } else {
                    activeFileIds([...current, name]);
                }
            },
            // Content-area file-option click: move an already-selected name
            // to the END of the selection (making it the focused/rendered
            // one) without changing selection membership. Unselected names
            // are a no-op — options only exist for selected files.
            focusFile: (name: string) => {
                const current = activeFileIds();
                if (!current.includes(name)) return;
                activeFileIds([...current.filter((entry) => entry !== name), name]);
            },
            // Sidebar background click: clear the selection entirely — the
            // content pane falls back to its placeholder (no active file)
            deselectFiles: () => activeFileIds([]),
            updateContent: (name: string, content: string) => {
                files(files().map((entry) => (entry.name === name ? { ...entry, content } : entry)));
            },
            closeFile: (name: string) => {
                const remaining = files().filter((entry) => entry.name !== name);
                files(remaining);
                // Drop the removed entry from the selection; if it was the
                // focused (last) one, focus falls back to the new last entry
                // — matching the single-select fallback behavior
                const selection = activeFileIds().filter((entry) => entry !== name);
                if (selection.length === 0 && remaining.length > 0) {
                    activeFileIds([remaining[remaining.length - 1].name]);
                } else {
                    activeFileIds(selection);
                }
            },
            // Sidebar drag & drop reorder: remove the `from` entry and INSERT it
            // at `toIndex`. The index is measured against the ORIGINAL list, so
            // once the dragged entry is spliced out, positions after it shift
            // down by one — compensated when fromIndex < toIndex. Guarded no-ops:
            // unknown names / out-of-range indexes / unchanged order never write
            // state. The selection is name-based, so reordering never changes
            // which files are selected or focused.
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

    // Resolve the FOCUSED file for content rendering. Multi-select model:
    // activeFileIds holds ALL selected names in selection order — the LAST
    // entry is the focused one whose content the pane renders. Each name
    // must match exactly one entry (stale names never render). An empty
    // selection → the placeholder.
    const { files, activeFileIds } = store;
    const focusedName = activeFileIds[activeFileIds.length - 1] ?? null;
    const activeFile =
        focusedName && files.filter((entry) => entry.name === focusedName).length === 1
            ? (files.find((entry) => entry.name === focusedName) ?? null)
            : null;

    // ── Plugin execution: content hook ──
    // Sequence-run every plugin's renderFile against the focused file and
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

    // ── Plugin execution: selection hook ──
    // Fires ONLY when two or more files are selected. Plugins hooked into
    // renderSelection contribute extra content tabs that mount AFTER the
    // focused file's plugin tabs (e.g. the compare plugin's "Compare" tab).
    const selectionContext = {
        files,
        activeFileIds,
        // Resolved exactly like activeFile above — null when the focused
        // name is stale (no exact single match)
        focusedFile: activeFile,
    };
    const selectionRendered: { pluginId: string; label: string; node: React.ReactNode }[] = [];
    if (activeFileIds.length >= 2) {
        arrayEach(plugins, ({ value: plugin }) => {
            if (!plugin.renderSelection) return;
            const node = plugin.renderSelection(selectionContext);
            // null / undefined → the plugin contributes no selection tab
            if (node !== null && node !== undefined) {
                selectionRendered.push({
                    pluginId: plugin.id,
                    label: plugin.label ?? plugin.id,
                    node,
                });
            }
        });
    }

    // Selection-tab fallback: whenever selection-level tabs exist the
    // visible id resolves against the MERGED tab list (plugin tabs + selection
    // tabs) — the selected tab stays visible even when it is a selection tab;
    // stale selections fall back to the FIRST tab (the focused file's first
    // plugin tab, or the first selection tab when no plugin contributes).
    const allTabs = rendered.concat(selectionRendered);
    const visibleSelectionId =
        selectionRendered.length > 0
            ? allTabs.some((entry) => entry.pluginId === selectedTab())
                ? (selectedTab() as string)
                : allTabs[0].pluginId
            : visibleId;

    // ── Plugin execution: static slots ──
    // Gather header / sidebar slot assignments in plugin sequence order.
    const headerNodes: { pluginId: string; node: React.ReactNode }[] = [];
    const sidebarNodes: { pluginId: string; node: React.ReactNode }[] = [];
    // Gather header-dropdown menu items in plugin sequence order — every
    // plugin can contribute rows into the shared dropdown
    const menuItems: DashboardMenuItem[] = [];
    arrayEach(plugins, ({ value: plugin }) => {
        if (plugin.slots?.header) headerNodes.push({ pluginId: plugin.id, node: plugin.slots.header });
        if (plugin.slots?.sidebar) sidebarNodes.push({ pluginId: plugin.id, node: plugin.slots.sidebar });
        arrayEach(plugin.menus ?? [], ({ value: item }) => {
            menuItems.push(item);
        });
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

    // Global paste: a window-level `paste` listener forwards the clipboard
    // payload to every plugin hooked into onPaste (the file-reader plugin
    // opens the text as [date].txt / [date].json and any clipboard files
    // through the normal read pipeline). The listener is a DOCUMENT-level
    // effect rather than a React prop because paste targets can be anywhere
    // (body focus, not just inside the dashboard tree). Listeners fire in
    // registration order — plugins are invoked in sequence order.
    React.useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const clipboard = event.clipboardData;
            if (!clipboard) return;
            // 'text/plain' covers plain AND json text — JSON is detected by
            // CONTENT later (isJsonText), not by a separate clipboard flavor
            const text = clipboard.getData('text/plain');
            // Files ride clipboardData.items; collect every file entry
            const clipboardFiles: File[] = [];
            arrayEach(Array.from(clipboard.items), ({ value: item }) => {
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) clipboardFiles.push(file);
                }
            });
            // Nothing usable in the clipboard → no plugin round-trip
            if (text === '' && clipboardFiles.length === 0) return;
            arrayEach(plugins, ({ value: plugin }) => {
                plugin.onPaste?.(
                    { text: text === '' ? null : text, files: clipboardFiles },
                    { store },
                );
            });
        };
        document.addEventListener('paste', handlePaste);
        return () => document.removeEventListener('paste', handlePaste);
    }, [plugins, store]);

    return (
        <DashboardRoot
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            data-testid="dashboard-root"
        >
            {/* Header: plugins' header-slot nodes, in sequence order, then
                the shared dropdown aggregating every plugin's menu items */}
            <HeaderBar data-testid="dashboard-header">
                {headerNodes.map(({ pluginId, node }) => (
                    <React.Fragment key={pluginId}>{node}</React.Fragment>
                ))}
                <HeaderMenu items={menuItems} />
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
                    {/* Nothing selected → placeholder. With selections:
                        ONE selected file → render its content directly (the
                        single-select view). TWO OR MORE selected files →
                        file options: one option per selected file, in
                        selection order; the FOCUSED (last) file's content
                        fills the panel. Plugin tabs still win when several
                        plugins contribute for the focused file — the tab
                        layout nests INSIDE the focused file's panel.
                        Selection-level tabs (renderSelection, e.g. the
                        compare plugin's "Compare" tab) mount AFTER the
                        focused file's plugin tabs — only while two or more
                        files are selected. */}
                    {rendered.length === 0 &&
                    selectionRendered.length === 0 &&
                    activeFileIds.length === 0 ? (
                        <ContentPlaceholder data-testid="content-placeholder">
                            Formatter content will appear here.
                        </ContentPlaceholder>
                    ) : rendered.length === 0 && selectionRendered.length === 0 ? (
                        // Selection exists but the focused file has no
                        // contributions and no selection-level tabs (e.g.
                        // kind binary with no plugin) → keep the pane empty
                        // rather than showing the "nothing selected"
                        // placeholder
                        null
                    ) : activeFileIds.length <= 1 ? (
                        rendered.length === 1 ? (
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
                        )
                    ) : (
                        <FileOptions data-testid="file-options">
                            <FileOptionBar data-testid="file-option-bar">
                                {/* Options render in SIDEBAR order (files array
                                    order), NOT selection order — clicking an
                                    option only moves FOCUS, it must never
                                    reshuffle the bar. Filtering the sidebar
                                    list by selection membership keeps the bar
                                    stable no matter which file was focused
                                    last. */}
                                {files
                                    .filter((entry) => activeFileIds.includes(entry.name))
                                    .map(({ name }) => (
                                        <FileOptionButton
                                            key={name}
                                            type="button"
                                            active={name === focusedName}
                                            // Focus (render) this file without
                                            // changing the selection membership
                                            onClick={() => store.focusFile(name)}
                                            data-testid={`file-option-${name}`}
                                        >
                                            {name}
                                        </FileOptionButton>
                                    ))}
                            </FileOptionBar>
                            {/* The focused file's contributions render inside
                                the panel — with the same single/tabs split as
                                the single-select view above. Selection-level
                                contributions (renderSelection, e.g. the
                                compare plugin) mount as EXTRA tabs AFTER the
                                focused file's plugin tabs, exactly when two
                                or more files are selected. */}
                            <FileOptionPanel data-testid={`file-option-panel-${focusedName}`}>
                                {rendered.length === 0 && selectionRendered.length === 0
                                    ? null
                                    : rendered.length + selectionRendered.length === 1
                                      ? (rendered[0]?.node ?? selectionRendered[0].node)
                                      : (
                                          // Tab list = focused file's plugin tabs
                                          // (sequence order) followed by the
                                          // selection tabs (sequence order)
                                          <ContentTabs data-testid="content-tabs">
                                              <TabBar>
                                                  {allTabs.map(({ pluginId, label }) => (
                                                      <TabButton
                                                          key={pluginId}
                                                          type="button"
                                                          active={pluginId === visibleSelectionId}
                                                          onClick={() => selectedTab(pluginId)}
                                                          data-testid={`content-tab-${pluginId}`}
                                                      >
                                                          {label}
                                                      </TabButton>
                                                  ))}
                                              </TabBar>
                                              {/* Only the active tab's node is mounted */}
                                              <TabPanel data-testid={`content-tab-panel-${visibleSelectionId}`}>
                                                  {allTabs.find((entry) => entry.pluginId === visibleSelectionId)?.node}
                                              </TabPanel>
                                          </ContentTabs>
                                      )}
                            </FileOptionPanel>
                        </FileOptions>
                    )}
                </ContentPane>
            </ContentArea>
            <FooterBar data-testid="dashboard-footer">
                <FooterInner>
                    {/* Left side: product name with the version suffix.
                        The version comes from the compile-time __APP_VERSION__
                        constant injected by vite.config.ts `define` (declared
                        ambient in src/vite-env.d.ts). It lives with the title
                        so users can see which release they are running right
                        where the product is named. The lib build
                        (tsconfig.build.json) never sees the constant since the
                        footer lives in this app-only dashboard file. */}
                    <span>
                        Formatter Dashboard v{__APP_VERSION__}
                    </span>
                    {/* Right side: loaded file count */}
                    <span>
                        {store.files.length} file{store.files.length === 1 ? '' : 's'} loaded
                    </span>
                </FooterInner>
            </FooterBar>
        </DashboardRoot>
    );
};
