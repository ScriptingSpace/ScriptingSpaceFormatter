import { localContextStore } from '@presource/react';

// A file accepted by the dashboard. `name` doubles as the stable sidebar
// entry id: dropping a file whose name matches an existing entry replaces
// that entry's content (re-load); a new name appends a new entry.
export type FormatterFile = {
    name: string;
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
});
