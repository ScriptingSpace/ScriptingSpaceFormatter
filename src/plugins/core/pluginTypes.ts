import type React from 'react';
import type { FormatterFile, FormatterFileContext } from '../../functions';

// Controls the dashboard hands to every plugin callback. Plugins never own
// the session — they mutate it through the shared store (src/functions/
// fileStore.ts), exactly like the pre-plugin implementation did.
export type DashboardControls = {
    // Shared file session: openFile / selectFile / closeFile / moveFile /
    // updateContent — implemented by FormatterDashboard and injected via the
    // FormatterFileProvider context
    store: FormatterFileContext;
};

// Contract every dashboard plugin fulfils. The dashboard executes a sequence
// of these plugins and exposes four target areas (cross-reference:
// dashboards/FormatterDashboard.tsx — the executor):
//
// - `slots.header`  → rendered inside the dashboard header bar, in plugin
//                     sequence order (title block, …)
// - `slots.sidebar` → rendered inside the dashboard's left column, in plugin
//                     sequence order (the file list, …)
// - `menus`         → items contributed into the dashboard's header DROPDOWN
//                     (HeaderMenu), in plugin sequence order. Each item
//                     renders its own row content; item components read the
//                     shared store themselves via formatterFileStore().
// - `renderFile`    → called every time the FOCUSED sidebar file (the last
//                     one in the multi-selection) changes; every plugin that
//                     returns a node contributes to the content area. One
//                     contributor → direct render; two or more → the
//                     dashboard switches to TABS, one tab per plugin.
// - `onFilesDropped`→ called with every browser File dropped on the page, in
//                     plugin sequence order (the file-reader plugin uses it
//                     to read + classify + open each file).

// Props every menu-item row renderer receives from the dashboard's dropdown.
export type DashboardMenuItemProps = {
    // Closes the dropdown — call it after a successful action (e.g. an
    // export that started downloading). NOT calling it keeps the menu open,
    // which is how items show inline validation errors inside the dropdown.
    closeMenu: () => void;
};

// One dropdown menu item contributed by a plugin.
export type DashboardMenuItem = {
    // Unique item id (unique across ALL plugins — it doubles as the menu
    // row's testid suffix and the React key)
    id: string;
    // Human label — reserved for a11y summaries / compact renderings
    label: string;
    // Row renderer. Reads the shared store itself via formatterFileStore()
    // when it needs session access (it renders inside the
    // FormatterFileProvider). Decides via closeMenu() whether the dropdown
    // closes after its action.
    render: React.ComponentType<DashboardMenuItemProps>;
};

// Context passed to the selection-level render hook. Describes the CURRENT
// multi-selection (two or more selected sidebar files):
// - `files`         → all accepted files, in SIDEBAR (drop) order
// - `activeFileIds` → the selection in SELECTION order (last = focused)
// - `focusedFile`   → the focused (last selected) file, resolved exactly like
//                     the content pane resolves it (dashboards/
//                     FormatterDashboard.tsx) — null when stale
export type DashboardSelectionContext = {
    files: FormatterFile[];
    activeFileIds: string[];
    focusedFile: FormatterFile | null;
};

export type DashboardPlugin = {
    // Unique plugin id — doubles as the content tab key when several
    // plugins render the same selected file
    id: string;
    // Human label shown on the content tab (defaults to the plugin id)
    label?: string;
    // Static slot assignment — plain React nodes, rendered unconditionally
    // while the plugin is part of the executed sequence. Components that
    // need session access read the store themselves via formatterFileStore()
    // (they render inside the FormatterFileProvider).
    slots?: {
        header?: React.ReactNode;
        sidebar?: React.ReactNode;
    };
    // Header dropdown menu contributions — rendered one row per item inside
    // the dashboard's dropdown, in plugin sequence order
    menus?: DashboardMenuItem[];
    // File-selection hook: called with the active file when a sidebar entry
    // is selected. Return a React node to render in the content area, or
    // null / undefined to contribute nothing (then other plugins take over).
    // Pure render — no side effects, deterministic output for a given file.
    renderFile?: (file: FormatterFile) => React.ReactNode | null;
    // Selection-level hook: called ONLY when TWO OR MORE sidebar files are
    // selected. Return a React node to render as an extra content tab AFTER
    // the focused file's plugin tabs (cross-reference: dashboards/
    // FormatterDashboard.tsx — the file-options layout mounts selection
    // tabs next to the plugin tabs inside the focused file's panel).
    // Returning null / undefined contributes nothing.
    renderSelection?: (context: DashboardSelectionContext) => React.ReactNode | null;
    // Drop hook: fired when files are dropped anywhere on the dashboard.
    // Receives every dropped browser File plus the session controls — the
    // file type reader plugin (plugins/fileReader) hooks this to read and
    // open the files.
    onFilesDropped?: (files: File[], controls: DashboardControls) => void;
};
