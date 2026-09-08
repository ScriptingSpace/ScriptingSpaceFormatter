export * from './core';
export * from './fileReader';
export * from './header';
export * from './exportPdf';
export * from './sidebar';
export * from './content';
import { fileReaderPlugin } from './fileReader';
import { headerPlugin } from './header';
import { exportPdfPlugin } from './exportPdf';
import { sidebarPlugin } from './sidebar';
import { textPlugin } from './content/TextPlugin';
import { imagePlugin } from './content/ImagePlugin';
import { videoPlugin } from './content/VideoPlugin';
import { binaryPlugin } from './content/BinaryPlugin';
import type { DashboardPlugin } from './core';

// Default plugin sequence — the order IS the execution order:
// 1. drop hook runs fileReader first (files enter the session)
// 2. header slot renders the identity block, then the export button (flex:1
//    on the identity block pushes the button to the right edge)
// 3. sidebar slot renders the file list
// 4. renderFile hooks run text → image → video → binary; exactly one kind
//    matches per file, so the default sequence renders directly — tabs only
//    appear when a custom plugin also contributes for the same file.
export const defaultPlugins: DashboardPlugin[] = [
    fileReaderPlugin,
    headerPlugin,
    exportPdfPlugin,
    sidebarPlugin,
    textPlugin,
    imagePlugin,
    videoPlugin,
    binaryPlugin,
];
