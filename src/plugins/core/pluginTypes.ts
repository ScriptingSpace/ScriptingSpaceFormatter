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
// of these plugins and exposes three target areas (cross-reference:
// dashboards/FormatterDashboard.tsx — the executor):
//
// - `slots.header`  → rendered inside the dashboard header bar, in plugin
//                     sequence order (title block, export button, …)
// - `slots.sidebar` → rendered inside the dashboard's left column, in plugin
//                     sequence order (the file list, …)
// - `renderFile`    → called every time the FOCUSED sidebar file (the last
//                     one in the multi-selection) changes; every plugin that
//                     returns a node contributes to the content area. One
//                     contributor → direct render; two or more → the
//                     dashboard switches to TABS, one tab per plugin.
// - `onFilesDropped`→ called with every browser File dropped on the page, in
//                     plugin sequence order (the file-reader plugin uses it
//                     to read + classify + open each file).
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
    // File-selection hook: called with the active file when a sidebar entry
    // is selected. Return a React node to render in the content area, or
    // null / undefined to contribute nothing (then other plugins take over).
    // Pure render — no side effects, deterministic output for a given file.
    renderFile?: (file: FormatterFile) => React.ReactNode | null;
    // Drop hook: fired when files are dropped anywhere on the dashboard.
    // Receives every dropped browser File plus the session controls — the
    // file type reader plugin (plugins/fileReader) hooks this to read and
    // open the files.
    onFilesDropped?: (files: File[], controls: DashboardControls) => void;
};
