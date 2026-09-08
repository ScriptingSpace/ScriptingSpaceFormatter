import type { FormatterFile } from './fileStore';

// Reads a browser File as plain text and resolves with the FormatterFile
// session shape. Used by the dashboard's global drop handler — every dropped
// file lands in the sidebar (src/components/FileSidebar.tsx).
export const readTextFile = (file: File): Promise<FormatterFile> =>
    new Promise<FormatterFile>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, content: String(reader.result ?? '') });
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
