import { arrayEach } from '@presource/core';
import type { DashboardPlugin } from '../core';
import { readTextFile } from './readTextFile';
import { clipboardFileName, dateStamp, isJsonText } from './clipboardText';

// FILE TYPE READER PLUGIN — hooks the dashboard's global drop callback. It is
// the only plugin that decides HOW dropped browser Files enter the session:
// each File is classified (detectFileKind) and read (readTextFile) into a
// FormatterFile, then opened as a sidebar entry through the shared store.
//
// PASTE ENTRY POINT — the dashboard forwards window `paste` events here too
// (cross-reference: dashboards/FormatterDashboard.tsx handlePaste). Pasted
// content enters the session as a file named after TODAY's date:
// - structured JSON (object/array) → [date].json (e.g. 2026-09-11.json)
// - any other text                 → [date].txt  (e.g. 2026-09-11.txt)
// Dropped FILES from the same paste event are loaded as themselves — the
// clipboard payload and any dropped file payloads are BOTH processed.
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

    // Paste hook: text from the clipboard becomes a [date].txt / [date].json
    // entry; files dropped alongside the paste (rare, but some OS paste
    // flows deliver copied files through the paste event's clipboardData)
    // go through the same read pipeline as a drop. The LAST entry opened
    // becomes the active one, so a combined paste focuses the last file.
    onPaste: (payload, { store }) => {
        // 1. Text payload → date-named text/json entry. Built FIRST so the
        //    file entries opened after it win focus (files are the richer
        //    payload); a text-only paste leaves the date entry focused.
        if (payload.text !== null && payload.text !== '') {
            // JSON detection is content-based (isJsonText) — an object or
            // array payload becomes .json, everything else stays .txt
            const extension = isJsonText(payload.text) ? 'json' : 'txt';
            // Existing names guard against same-day collisions: the second
            // paste on one day becomes [date]-2.[ext], not an overwrite
            const name = clipboardFileName(
                extension,
                store.files.map((entry) => entry.name),
                dateStamp(),
            );
            store.openFile({ name, kind: 'text', mime: 'text/plain', content: payload.text });
        }
        // 2. File payloads → identical pipeline to a drop (read + classify +
        //    open). Promise.all keeps the open order deterministic.
        Promise.all(payload.files.map(readTextFile)).then((opened) => {
            arrayEach(opened, (entry) => store.openFile(entry.value));
        });
    },
};
