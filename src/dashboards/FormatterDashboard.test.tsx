import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormatterDashboard } from './FormatterDashboard';
import { defaultPlugins } from '../plugins';
import type { DashboardPlugin } from '../plugins';

// ─── pdf.js mock (via the LOCAL access layer — see PdfViewer.test.tsx for why
// mocking 'pdfjs-dist' directly does not work through the re-export) ─────────
// One page, 612×792, static text — enough to drive the PDF reader end-to-end.
const pdfjs = vi.hoisted(() => {
    const fakePage = {
        getViewport: ({ scale }: { scale: number }) => ({
            width: 612 * scale,
            height: 792 * scale,
            scale,
        }),
        render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
        getTextContent: async () => ({ items: [{ str: 'dropped pdf text' }] }),
    };
    const fakeDoc = {
        numPages: 2,
        getPage: async (pageNumber: number) => fakePage,
        destroy: async () => undefined,
    };
    return { getDocument: vi.fn(() => ({ promise: Promise.resolve(fakeDoc) })) };
});
vi.mock('../plugins/pdfReader/pdfjs', () => ({
    getDocument: pdfjs.getDocument,
    GlobalWorkerOptions: { workerSrc: '' },
    configurePdfWorker: async () => undefined,
}));

// Extra content plugin used by the tabs tests — renders for the SAME text
// files as the built-in text plugin, forcing the two-plugin (tabs) path.
const formatterDemoPlugin: DashboardPlugin = {
    id: 'formatter-demo',
    label: 'Formatter',
    renderFile: (file) =>
        file.kind === 'text' ? (
            <div data-testid="file-content-formatter">{`formatted:${file.content}`}</div>
        ) : null,
};

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

    it('places the sidebar column as the LEFT child and the content pane to its right', () => {
        render(<FormatterDashboard />);

        // Sidebar column (which contains the sidebar plugin's file list) is
        // the first flex child of the content area (left), the content pane
        // comes right after it (right)
        const children = Array.from(
            screen.getByTestId('content-area').children,
        ) as HTMLElement[];
        expect(children[0].getAttribute('data-testid')).toBe('sidebar-column');
        expect(children[1].getAttribute('data-testid')).toBe('content-pane');
        // The sidebar plugin assigned the file list into the left column
        expect(
            screen.getByTestId('sidebar-column').contains(screen.getByTestId('file-sidebar')),
        ).toBe(true);
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

    it('renders a dropped video in a video player with controls', async () => {        render(<FormatterDashboard />);

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

    it('renders a dropped PDF with the pdf reader plugin (pdf.js viewer)', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['%PDF-1.4 fake'], 'doc.pdf', { type: 'application/pdf' })],
            },
        });

        // PDF kind → the pdf reader plugin renders its full viewer: page
        // indicator, page frames and canvases come from the mocked pdf.js
        await waitFor(() => {
            expect(screen.getByTestId('pdf-viewer')).toBeDefined();
        });
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
        expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        expect(screen.getByTestId('pdf-page-2')).toBeDefined();
        expect(screen.queryByTestId('file-content-binary')).toBeNull();
        expect(screen.queryByTestId('content-placeholder')).toBeNull();
        // The decoded data-URL bytes reached pdf.js getDocument
        await waitFor(() => {
            expect(pdfjs.getDocument).toHaveBeenCalled();
        });
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

    it('disables the Export PDF button while the sidebar is empty', () => {
        render(<FormatterDashboard />);

        const button = screen.getByTestId('export-pdf-button') as HTMLButtonElement;
        // No files yet → nothing to convert, button is disabled and shows the
        // idle label on the right side of the header
        expect(button.disabled).toBe(true);
        expect(button.textContent).toBe('Export PDF');
    });

    it('converts all sidebar files into one automatically downloaded PDF on click', async () => {
        // jsdom has no object URL implementation — stub the URL lifecycle and
        // capture the synthetic anchor click that triggers the download
        URL.createObjectURL = vi.fn(() => 'blob:mock-pdf-url');
        URL.revokeObjectURL = vi.fn();
        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clicked.push(this);
        });

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

        // Enabled once at least one file is loaded
        const button = screen.getByTestId('export-pdf-button') as HTMLButtonElement;
        expect(button.disabled).toBe(false);

        fireEvent.click(button);

        // The export builds one PDF from BOTH files and auto-downloads it
        await waitFor(() => {
            expect(clicked).toHaveLength(1);
        });
        expect(clicked[0].download).toBe('formatter-export.pdf');
        expect(clicked[0].href).toBe('blob:mock-pdf-url');
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe('application/pdf');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-pdf-url');

        // After the async export completes, the button returns to idle
        await waitFor(() => {
            expect((screen.getByTestId('export-pdf-button') as HTMLButtonElement).textContent).toBe(
                'Export PDF',
            );
        });
    });

    // Minimal dataTransfer stub — jsdom does not implement DataTransfer
    const makeDataTransfer = () => ({
        setData: () => {},
        getData: () => '',
        effectAllowed: 'all',
        dropEffect: 'none',
    });

    // jsdom has no DragEvent — testing-library's fireEvent.dragOver falls
    // back to a plain Event and drops clientY. Dispatch a raw dragover with
    // clientY injected (10 → bottom half of the zero-sized jsdom rect).
    const fireDragOver = (target: HTMLElement, clientY: number) => {
        const event = new Event('dragover', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clientY', { value: clientY });
        Object.defineProperty(event, 'dataTransfer', { value: makeDataTransfer() });
        fireEvent(target, event);
    };

    it('re-orders sidebar entries by dragging one onto another, keeping the selection', async () => {
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
        await waitFor(() => {
            expect(screen.getByTestId('sidebar-file-gamma.txt')).toBeDefined();
        });

        // Drag alpha (first entry) onto the BOTTOM half of gamma (last entry)
        // → insertion slot after gamma (index 3)
        fireEvent.dragStart(screen.getByTestId('sidebar-file-alpha.txt'), {
            dataTransfer: makeDataTransfer(),
        });
        fireDragOver(screen.getByTestId('sidebar-file-gamma.txt'), 10);
        expect(screen.getByTestId('drop-line')).toBeDefined();
        fireEvent.drop(screen.getByTestId('sidebar-file-gamma.txt'), {
            dataTransfer: makeDataTransfer(),
        });

        // Order is now beta, gamma, alpha
        await waitFor(() => {
            const entries = screen.getAllByTestId(/^sidebar-file-/);
            expect(entries.map((entry) => entry.getAttribute('data-testid'))).toEqual([
                'sidebar-file-beta.txt',
                'sidebar-file-gamma.txt',
                'sidebar-file-alpha.txt',
            ]);
        });

        // Reordering is selection-neutral: gamma (last drop) stays active
        expect(screen.getByTestId('sidebar-file-gamma.txt').getAttribute('aria-pressed')).toBe(
            'true',
        );
    });

    // ─── Multi-plugin render → tabs ──────────────────────────────────────────

    it('renders a single-plugin file directly with no tabs', async () => {
        render(<FormatterDashboard />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['hello'], 'open.txt', { type: 'text/plain' })] },
        });

        // Default sequence: only the text plugin renders a text file → the
        // node mounts directly in the pane, no tab bar
        await waitFor(() => {
            expect(screen.getByTestId('file-content-text').textContent).toBe('hello');
        });
        expect(screen.queryByTestId('content-tabs')).toBeNull();
        expect(screen.queryByTestId('content-tab-text')).toBeNull();
    });

    it('adds tabs in the content area when two plugins render the same selected file', async () => {
        render(<FormatterDashboard plugins={[...defaultPlugins, formatterDemoPlugin]} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['hello'], 'open.txt', { type: 'text/plain' })] },
        });

        // Both the text plugin and the injected demo plugin contribute →
        // the pane switches to tabs, one tab per contributor in sequence
        // order (text first, formatter-demo second)
        await waitFor(() => {
            expect(screen.getByTestId('content-tabs')).toBeDefined();
        });
        expect(screen.getByTestId('content-tab-text').textContent).toBe('Text');
        expect(screen.getByTestId('content-tab-formatter-demo').textContent).toBe('Formatter');

        // Default active tab = the FIRST contributor (text): only its panel
        // is mounted
        expect(screen.getByTestId('content-tab-panel-text')).toBeDefined();
        expect(screen.queryByTestId('content-tab-panel-formatter-demo')).toBeNull();
        expect(screen.getByTestId('file-content-text').textContent).toBe('hello');
        expect(screen.queryByTestId('file-content-formatter')).toBeNull();
    });

    it('switches the tab panel when another plugin tab is clicked', async () => {
        render(<FormatterDashboard plugins={[...defaultPlugins, formatterDemoPlugin]} />);

        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: { files: [new File(['hello'], 'open.txt', { type: 'text/plain' })] },
        });
        await waitFor(() => {
            expect(screen.getByTestId('content-tabs')).toBeDefined();
        });

        // Click the Formatter tab → its panel replaces the text panel
        fireEvent.click(screen.getByTestId('content-tab-formatter-demo'));

        expect(screen.getByTestId('content-tab-panel-formatter-demo')).toBeDefined();
        expect(screen.queryByTestId('content-tab-panel-text')).toBeNull();
        expect(screen.getByTestId('file-content-formatter').textContent).toBe('formatted:hello');
        expect(screen.queryByTestId('file-content-text')).toBeNull();

        // Back to the Text tab → text panel again
        fireEvent.click(screen.getByTestId('content-tab-text'));
        expect(screen.getByTestId('content-tab-panel-text')).toBeDefined();
        expect(screen.getByTestId('file-content-text').textContent).toBe('hello');
        expect(screen.queryByTestId('file-content-formatter')).toBeNull();
    });

    it('shows only the single-plugin render (no tabs) for files the extra plugin skips', async () => {
        render(<FormatterDashboard plugins={[...defaultPlugins, formatterDemoPlugin]} />);

        // Image file → only the image plugin contributes (formatter-demo
        // yields null for non-text kinds) → direct render, no tabs
        fireEvent.drop(screen.getByTestId('dashboard-root'), {
            dataTransfer: {
                files: [new File(['fake-png-bytes'], 'logo.png', { type: 'image/png' })],
            },
        });

        await waitFor(() => {
            expect(screen.getByTestId('file-content-image')).toBeDefined();
        });
        expect(screen.queryByTestId('content-tabs')).toBeNull();
    });
});
