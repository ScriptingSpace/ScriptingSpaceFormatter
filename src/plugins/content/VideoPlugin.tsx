import React from 'react';
import { styledComponent } from '@presource/react';
import type { DashboardPlugin } from '../core';

// Video preview — native player with controls, same fit-inside rules as the
// image view so long/large videos never overflow the pane.
const VideoView = styledComponent('video', {
    maxWidth: '100%',
    maxHeight: '100%',
    display: 'block',
}) as unknown as React.FC<React.VideoHTMLAttributes<HTMLVideoElement>>;

// VIDEO PLUGIN — content hook: renders the selected file in a native video
// player (content is the FileReader data URL) whenever a file whose kind is
// 'video' is selected on the sidebar. Other kinds yield null.
export const videoPlugin: DashboardPlugin = {
    id: 'video',
    label: 'Video',
    renderFile: (file) =>
        file.kind === 'video' ? (
            <VideoView data-testid="file-content-video" src={file.content} controls />
        ) : null,
};
