import { styledComponent } from '@presource/react';
import type { DashboardPlugin } from '../core';

// Binary notice — shown when the selected file's kind is 'binary' (its raw
// content is never rendered; it stays in the session for future features).
const BinaryNotice = styledComponent('div', {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center' as const,
    padding: 32,
});

// BINARY PLUGIN — content hook: shows a notice (never the raw content)
// whenever a file whose kind is 'binary' is selected on the sidebar. Other
// kinds yield null.
export const binaryPlugin: DashboardPlugin = {
    id: 'binary',
    label: 'Binary',
    renderFile: (file) =>
        file.kind === 'binary' ? (
            <BinaryNotice data-testid="file-content-binary">
                {file.name} is a binary file — preview is not available.
            </BinaryNotice>
        ) : null,
};
