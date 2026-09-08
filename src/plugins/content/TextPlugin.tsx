import { styledComponent } from '@presource/react';
import type { DashboardPlugin } from '../core';

// Scrollable monospace view for a selected text file's raw content. Fills
// the whole content pane (the pane itself never scrolls — this element does).
const TextView = styledComponent('pre', {
    margin: 0,
    padding: 16,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box' as const,
    overflow: 'auto' as const,
    textAlign: 'left' as const,
    fontSize: 13,
    lineHeight: 1.6,
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace',
    color: '#e2e8f0',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
});

// TEXT PLUGIN — content hook: renders the selected file's raw text whenever
// a file whose kind is 'text' is selected on the sidebar. Files of any other
// kind yield null so the matching plugin (image / video / binary) takes
// over; if another plugin ALSO renders a text file, the dashboard switches
// to tabs automatically.
export const textPlugin: DashboardPlugin = {
    id: 'text',
    label: 'Text',
    renderFile: (file) =>
        file.kind === 'text' ? (
            <TextView data-testid="file-content-text">{file.content}</TextView>
        ) : null,
};
