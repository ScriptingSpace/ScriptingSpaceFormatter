export * from './core';
export * from './fileReader';
export * from './header';
export * from './exportPdf';
export * from './sidebar';
export * from './content';
export * from './pdfReader';
export * from './compare';
export * from './yaml';
import { fileReaderPlugin } from './fileReader';
import { headerPlugin } from './header';
import { exportPdfPlugin } from './exportPdf';
import { sidebarPlugin } from './sidebar';
import { textPlugin } from './content/TextPlugin';
import { imagePlugin } from './content/ImagePlugin';
import { videoPlugin } from './content/VideoPlugin';
import { pdfReaderPlugin } from './pdfReader';
import { binaryPlugin } from './content/BinaryPlugin';
import { comparePlugin } from './compare';
import { yamlPlugin } from './yaml';
import type { DashboardPlugin } from './core';

// Default plugin sequence — the order IS the execution order:
// 1. drop hook runs fileReader first (files enter the session)
// 2. header slot renders the identity block; the header dropdown (rendered
//    by the dashboard AFTER the header-slot nodes) aggregates every plugin's
//    `menus` items — export-pdf contributes its export row there
// 3. sidebar slot renders the file list
// 4. renderFile hooks run text → image → video → pdf → binary → yaml;
//    exactly one kind matches per file for the built-ins, so the default
//    sequence renders directly — tabs only appear when the yaml plugin ALSO
//    contributes for the same file (an OpenAPI/Swagger document gets both a
//    Text tab and its spec tab).
// 5. renderSelection hooks run last (compare) — the compare tab mounts AFTER
//    the focused file's plugin tabs, exactly when two or more files are
//    selected.
export const defaultPlugins: DashboardPlugin[] = [
    fileReaderPlugin,
    headerPlugin,
    exportPdfPlugin,
    sidebarPlugin,
    textPlugin,
    imagePlugin,
    videoPlugin,
    pdfReaderPlugin,
    binaryPlugin,
    comparePlugin,
    yamlPlugin,
];
