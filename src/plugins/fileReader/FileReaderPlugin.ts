import { arrayEach } from '@presource/core';
import type { DashboardPlugin } from '../core';
import { readTextFile } from './readTextFile';

// FILE TYPE READER PLUGIN — hooks the dashboard's global drop callback. It is
// the only plugin that decides HOW dropped browser Files enter the session:
// each File is classified (detectFileKind) and read (readTextFile) into a
// FormatterFile, then opened as a sidebar entry through the shared store.
export const fileReaderPlugin: DashboardPlugin = {
    id: 'file-reader',

    // Drop hook: reads EVERY dropped file, not just the first — each becomes
    // its own sidebar entry. Promise.all keeps the read order deterministic
    // so the last file in the drop ends up as the active entry (openFile
    // activates the entry it opens).
    onFilesDropped: (dropped, { store }) => {
        Promise.all(dropped.map(readTextFile)).then((opened) => {
            arrayEach(opened, (entry) => store.openFile(entry.value));
        });
    },
};
