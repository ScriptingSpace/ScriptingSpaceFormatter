import { styledComponent } from '@presource/react';
import type { DashboardPlugin } from '../core';

// Image preview — the image fits INSIDE the pane (never overflows or
// distorts): max 100% of both axes, object-fit: contain keeps aspect ratio.
// Centered by the pane's align/justify. Needs explicit casting for ref-less
// img attributes typing (styledComponent returns React.FC).
const ImageView = styledComponent('img', {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain' as const,
    display: 'block',
}) as unknown as React.FC<React.ImgHTMLAttributes<HTMLImageElement>>;

// IMAGE PLUGIN — content hook: renders the selected file's image preview
// (content is the FileReader data URL) whenever a file whose kind is
// 'image' is selected on the sidebar. Other kinds yield null.
export const imagePlugin: DashboardPlugin = {
    id: 'image',
    label: 'Image',
    renderFile: (file) =>
        file.kind === 'image' ? (
            <ImageView
                data-testid="file-content-image"
                src={file.content}
                alt={file.name}
            />
        ) : null,
};
