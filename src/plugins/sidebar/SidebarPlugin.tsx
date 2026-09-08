import type { DashboardPlugin } from '../core';
import { ConnectedFileSidebar } from './FileSidebar';

// SIDEBAR PLUGIN — assigns the file list into the dashboard's sidebar slot.
// The ConnectedFileSidebar reads the shared file session itself via
// formatterFileStore() (src/functions/fileStore.ts), so the dashboard shell
// needs no prop wiring for it. It renders no file content (no renderFile),
// so it never contributes a content tab.
export const sidebarPlugin: DashboardPlugin = {
    id: 'sidebar',
    slots: {
        sidebar: <ConnectedFileSidebar />,
    },
};
