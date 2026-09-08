import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { FormatterDashboard } from './FormatterDashboard';

afterEach(() => {
    cleanup();
});

describe('FormatterDashboard', () => {
    it('renders the dashboard header and the empty content pane placeholder', () => {
        render(<FormatterDashboard />);

        // The title also appears in the footer — assert on the header heading
        expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Formatter Dashboard');
        expect(
            screen.getByText('Drop files anywhere — they are collected in the sidebar.'),
        ).toBeDefined();
        // Nothing selected yet → placeholder in the content pane
        expect(screen.getByTestId('content-placeholder').textContent).toBe(
            'Formatter content will appear here.',
        );
        expect(screen.queryByTestId('file-content-text')).toBeNull();
    });

    it('places the sidebar as the LEFT column and the content pane to its right', () => {
        render(<FormatterDashboard />);

        // Sidebar is the first flex child of the content area (left),
        // content pane comes right after it (right)
        const children = Array.from(
            screen.getByTestId('content-area').children,
        ) as HTMLElement[];
        expect(children[0].getAttribute('data-testid')).toBe('file-sidebar');
        expect(children[1].getAttribute('data-testid')).toBe('content-pane');
    });

    it('renders the sidebar with the empty-state hint when no file is accepted (drop-only flow)', () => {
        render(<FormatterDashboard />);

        expect(screen.getByTestId('file-sidebar')).toBeDefined();
        expect(screen.getByTestId('file-list-empty')).toBeDefined();
        expect(screen.queryByTestId('sidebar-file-anything.txt')).toBeNull();
        // The dashed drop outline was removed — no outline testid exists
        expect(screen.queryByTestId('drop-outline')).toBeNull();
    });

    it('adds a file dropped anywhere on the dashboard to the sidebar (global drop)', async () => {
        render(<FormatterDashboard />);

        const file = new File(['dropped anywhere'], 'anywhere.txt', { type: 'text/plain' });
        // Drop targets the full-viewport root — files can enter anywhere
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [file] },
        });

        // The file session opens as its own sidebar entry and becomes active
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-anywhere.txt')).toBeDefined();
        });
        expect(screen.queryByTestId('file-list-empty')).toBeNull();
        expect(
            screen.getByTestId('sidebar-file-anywhere.txt').getAttribute('aria-pressed'),
        ).toBe('true');
    });

    it('renders no dashed outline at any point in the session', async () => {
        render(<FormatterDashboard />);

        // Outline removed entirely — absent both before and after a drop
        expect(screen.queryByTestId('drop-outline')).toBeNull();

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['content'], 'open.txt', { type: 'text/plain' })],
            },
        });

        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-open.txt')).toBeDefined();
        });
        expect(screen.queryByTestId('drop-outline')).toBeNull();
    });

    it('gives each accepted file its own sidebar entry, activating the latest drop', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['first'], 'one.txt', { type: 'text/plain' })] },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-one.txt')).toBeDefined();
        });

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['second'], 'two.txt', { type: 'text/plain' })] },
        });

        // Two entries; the latest drop is the active one
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-two.txt').getAttribute('aria-pressed')).toBe(
                'true',
            );
        });
        expect(screen.getByTestId('sidebar-file-one.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );
    });

    it('loads every file in a single multi-file drop, not just the first', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                    new File(['gamma'], 'gamma.txt', { type: 'text/plain' }),
                ],
            },
        });

        // All three files get their own sidebar entry, in drop order
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-alpha.txt')).toBeDefined();
        });
        expect(screen.getByTestId('sidebar-file-beta.txt')).toBeDefined();
        expect(screen.getByTestId('sidebar-file-gamma.txt')).toBeDefined();

        // The last file in the drop is the active entry
        expect(screen.getByTestId('sidebar-file-gamma.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
    });

    it('re-dropping an accepted file name replaces its entry instead of duplicating it', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['first'], 'one.txt', { type: 'text/plain' })] },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-one.txt')).toBeDefined();
        });

        // Same name dropped again → still exactly one entry for that name
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['second'], 'one.txt', { type: 'text/plain' })] },
        });

        await waitFor(() => {
            expect(screen.getByTestId('dashboard-footer').textContent).toBe(
                'Formatter Dashboard1 file loaded',
            );
        });
        expect(screen.getAllByTestId('sidebar-file-one.txt')).toHaveLength(1);
    });

    it('selects a sidebar entry on click and highlights it', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-beta.txt')).toBeDefined();
        });

        // Clicking an earlier entry re-selects it
        fireEvent.click(screen.getByTestId('sidebar-file-alpha.txt'));

        expect(screen.getByTestId('sidebar-file-alpha.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
        expect(screen.getByTestId('sidebar-file-beta.txt').getAttribute('aria-pressed')).toBe(
            'false',
        );
    });

    it('renders the dropped file content in the content pane when it is selected', async () => {
        render(<FormatterDashboard />);

        // The latest drop becomes active → its content renders immediately
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['hello world'], 'open.txt', { type: 'text/plain' })] },
        });

        await waitFor(() => {
            expect(screen.getByTestId('file-content-text').textContent).toBe('hello world');
        });
        // Placeholder is gone while a single file's content is rendered
        expect(screen.queryByTestId('content-placeholder')).toBeNull();
    });

    it('clicking a different sidebar entry swaps the rendered content', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha text'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta text'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });
        // Latest drop (beta) is active → beta content renders
        await waitFor(() => {
            expect(screen.getByTestId('file-content-text').textContent).toBe('beta text');
        });

        // Click alpha → alpha content renders instead
        fireEvent.click(screen.getByTestId('sidebar-file-alpha.txt'));

        expect(screen.getByTestId('file-content-text').textContent).toBe('alpha text');
    });

    it('renders a dropped image as an <img> preview instead of text', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['fake-png-bytes'], 'logo.png', { type: 'image/png' })],
            },
        });

        // Image kind → the img preview renders (src is a data URL), and no
        // text view or placeholder is shown
        await waitFor(() => {
            expect(screen.getByTestId('file-content-image')).toBeDefined();
        });
        const image = screen.getByTestId('file-content-image') as HTMLImageElement;
        expect(image.getAttribute('alt')).toBe('logo.png');
        expect(image.getAttribute('src')?.startsWith('data:image/png;base64,')).toBe(true);
        expect(screen.queryByTestId('file-content-text')).toBeNull();
        expect(screen.queryByTestId('content-placeholder')).toBeNull();
    });

    it('renders a dropped video in a video player with controls', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['fake-mp4-bytes'], 'clip.mp4', { type: 'video/mp4' })],
            },
        });

        // Video kind → the native video player renders with controls enabled
        await waitFor(() => {
            expect(screen.getByTestId('file-content-video')).toBeDefined();
        });
        const video = screen.getByTestId('file-content-video') as HTMLVideoElement;
        expect(video.getAttribute('controls')).not.toBeNull();
        expect(video.getAttribute('src')?.startsWith('data:video/mp4;base64,')).toBe(true);
        expect(screen.queryByTestId('file-content-text')).toBeNull();
        expect(screen.queryByTestId('content-placeholder')).toBeNull();
    });

    it('shows a binary notice (not raw content) for binary files', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['\u0000\u0001\u0002'], 'app.exe', {
                        type: 'application/octet-stream',
                    }),
                ],
            },
        });

        // Binary kind → notice only; the raw content must NOT be rendered
        await waitFor(() => {
            expect(screen.getByTestId('file-content-binary')).toBeDefined();
        });
        expect(screen.getByTestId('file-content-binary').textContent).toBe(
            'app.exe is a binary file — preview is not available.',
        );
        expect(screen.queryByTestId('file-content-text')).toBeNull();
        expect(screen.queryByTestId('content-placeholder')).toBeNull();
    });

    it('swaps render mode when clicking entries of different kinds', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['plain text'], 'readme.txt', { type: 'text/plain' }),
                    new File(['fake-png-bytes'], 'logo.png', { type: 'image/png' }),
                ],
            },
        });
        // Latest drop (image) is active → image preview renders
        await waitFor(() => {
            expect(screen.getByTestId('file-content-image')).toBeDefined();
        });

        // Click the text entry → render mode swaps to the text view
        fireEvent.click(screen.getByTestId('sidebar-file-readme.txt'));

        expect(screen.getByTestId('file-content-text').textContent).toBe('plain text');
        expect(screen.queryByTestId('file-content-image')).toBeNull();

        // Back to the image entry → image preview again
        fireEvent.click(screen.getByTestId('sidebar-file-logo.png'));
        expect(screen.getByTestId('file-content-image')).toBeDefined();
        expect(screen.queryByTestId('file-content-text')).toBeNull();
    });

    it('falls back to the placeholder when the active file is removed', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha text'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta text'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('file-content-text').textContent).toBe('beta text');
        });

        // Remove beta → alpha (latest remaining) becomes active → its content
        fireEvent.click(screen.getByTestId('remove-file-beta.txt'));
        await waitFor(() => {
            expect(screen.getByTestId('file-content-text').textContent).toBe('alpha text');
        });

        // Remove alpha → nothing left → placeholder returns
        fireEvent.click(screen.getByTestId('remove-file-alpha.txt'));
        await waitFor(() => {
            expect(screen.getByTestId('content-placeholder').textContent).toBe(
                'Formatter content will appear here.',
            );
        });
        expect(screen.queryByTestId('file-content-text')).toBeNull();
    });

    it('removes a sidebar entry via its close button and falls back to the latest remaining entry', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-beta.txt')).toBeDefined();
        });

        // Remove beta (the active entry) → alpha becomes active again
        fireEvent.click(screen.getByTestId('remove-file-beta.txt'));

        await waitFor(() => {
            expect(screen.queryByTestId('sidebar-file-beta.txt')).toBeNull();
        });
        expect(screen.getByTestId('sidebar-file-alpha.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
    });

    it('keeps the drop handler armed during dragover (preventDefault) with no visual outline', () => {
        render(<FormatterDashboard />);

        // dragover must be cancelable — without preventDefault the browser
        // would cancel the drag and the drop event would never fire.
        // fireEvent returns false when the handler calls preventDefault,
        // which is exactly what we expect here.
        const root = screen.getByTestId('dashboard-root');
        expect(fireEvent.dragOver(root)).toBe(false);
        // No outline feedback — nothing appears in the DOM while dragging
        expect(screen.queryByTestId('drop-outline')).toBeNull();
    });

    it('renders the footer with the loaded file count', async () => {
        render(<FormatterDashboard />);

        // Empty session → zero files
        expect(screen.getByTestId('dashboard-footer').textContent).toBe(
            'Formatter Dashboard0 files loaded',
        );

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [
                    new File(['alpha'], 'alpha.txt', { type: 'text/plain' }),
                    new File(['beta'], 'beta.txt', { type: 'text/plain' }),
                ],
            },
        });

        await waitFor(() => {
            expect(screen.getByTestId('dashboard-footer').textContent).toBe(
                'Formatter Dashboard2 files loaded',
            );
        });
    });
});
