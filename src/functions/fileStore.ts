import { localContextStore } from '@presource/react';

// Render classification for an accepted file — decides HOW the content pane
// renders it when the entry is selected (dashboards/FormatterDashboard.tsx):
// - 'image'  → rendered in an <img> (content is a data URL)
// - 'video'  → rendered in a <video controls> player (content is a data URL)
// - 'text'   → rendered as plain text (content is decoded text)
// - 'pdf'    → rendered by the PDF reader plugin (plugins/pdfReader) —
//              content is a data URL decoded and fed to pdf.js
// - 'binary' → NOT rendered; a notice is shown instead
export type FormatterFileKind = 'image' | 'video' | 'text' | 'pdf' | 'binary';

// A file accepted by the dashboard. `name` doubles as the stable sidebar
// entry id: dropping a file whose name matches an existing entry replaces
// that entry's content (re-load); a new name appends a new entry.
// `kind` is detected by the file-reader plugin (src/plugins/fileReader/
// readTextFile.ts) from the browser File's MIME type / extension (with a
// NUL-byte sniff fallback).
export type FormatterFile = {
    name: string;
    kind: FormatterFileKind;
    // Original MIME type as reported by the browser (may be '' — e.g.
    // unknown extensions); used as the <img>/<video> fallback source type
    mime: string;
    // Image/video → data URL; text → decoded text; binary → raw text dump
    // (never rendered, kept for future formatter features)
    content: string;
};

// Shared file session contract. The dashboard owns the real implementation
// and injects it via the provider `data` prop; the sidebar (and any future
// content-pane feature) consumes it through formatterFileStore(). Defaults
// are no-ops / empty so consumers render safely even without a provider.
export type FormatterFileContext = {
    // All accepted files, in drop order
    files: FormatterFile[];
    // Currently selected entry (a file name), null when nothing is selected
    activeFileId: string | null;
    // Drop entry point: appends (or replaces same-name) and selects the entry
    openFile: (file: FormatterFile) => void;
    // Sidebar click: make this file the active one
    selectFile: (name: string) => void;
    // Update one open file's content (future formatter output target)
    updateContent: (name: string, content: string) => void;
    // Sidebar close (×): remove the file; if it was active, select the latest
    closeFile: (name: string) => void;
    // Sidebar drag & drop reordering: INSERT the `fromName` entry at
    // `toIndex` (0..files.length, measured against the list BEFORE the
    // move). No-op when the name is unknown, the index is out of range, or
    // the insertion would not change the order.
    moveFile: (fromName: string, toIndex: number) => void;
};

// Cross-reference: FormatterDashboard.tsx wraps the tree in the provider and
// owns the state; components/FileSidebar.tsx consumes it.
export const {
    ContextProvider: FormatterFileProvider,
    contextStore: formatterFileStore,
} = localContextStore<FormatterFileContext>({
    files: [],
    activeFileId: null,
    openFile: () => {},
    selectFile: () => {},
    updateContent: () => {},
    closeFile: () => {},
    moveFile: () => {},
});
