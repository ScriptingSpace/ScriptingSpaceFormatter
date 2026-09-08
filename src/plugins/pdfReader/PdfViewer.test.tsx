import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';

// ─── pdf.js mock (hoisted before the module imports) ─────────────────────────
// Two pages, deterministic viewports and per-page text. `render` records its
// params so paint behavior can be asserted without a real canvas.
//
// The mock targets the LOCAL access layer ('./pdfjs') — NOT 'pdfjs-dist'
// directly. pdfjs-dist is externalized (untransformed node_modules ESM), and
// mocked external modules lose their named bindings when another module
// re-imports them by name (verified: `import { getDocument } from 'pdfjs-dist'`
// inside pdfjs.ts resolves to undefined). ./pdfjs is the single module that
// touches pdfjs-dist, so mocking it covers the whole plugin tree.

const pdfjs = vi.hoisted(() => {
    const renderCalls: { pageNumber: number; transform?: number[] }[] = [];

    // Builds a fake page proxy: 612×792 pt at scale 1 (US Letter portrait),
    // quarter-turn rotation swaps the axes, fixed text payload per page
    const makePage = (pageNumber: number, text: string) => ({
        getViewport: ({ scale, rotation }: { scale: number; rotation?: number }) => {
            const swap = rotation === 90 || rotation === 270;
            return {
                width: (swap ? 792 : 612) * scale,
                height: (swap ? 612 : 792) * scale,
                scale,
                rotation,
            };
        },
        render: (params: { transform?: number[] }) => {
            renderCalls.push({ pageNumber, transform: params.transform });
            return { promise: Promise.resolve(), cancel: () => {} };
        },
        getTextContent: async () => ({
            items: [{ str: text }, { type: 'beginMarkedContent' }],
        }),
    });

    const pages = [makePage(1, 'alpha bravo'), makePage(2, 'charlie delta')];
    const doc = {
        numPages: pages.length,
        getPage: async (pageNumber: number) => pages[pageNumber - 1],
        destroy: vi.fn(async () => undefined),
    };
    const getDocument = vi.fn(() => ({ promise: Promise.resolve(doc) }));

    return { getDocument, doc, renderCalls, pages };
});

vi.mock('./pdfjs', () => ({
    getDocument: pdfjs.getDocument,
    GlobalWorkerOptions: { workerSrc: '' },
    configurePdfWorker: async () => undefined,
}));

import { usePdfDocument } from './usePdfDocument';
import { PdfViewer, computeFitScale, SCROLL_PAD } from './PdfViewer';
import { pdfReaderPlugin } from './PdfReaderPlugin';
import type { FormatterFile } from '../../functions';

// Valid data URL payload for the fake document — the bytes are never parsed
// by the mocked pdf.js, only the decoding path is exercised
const DATA_URL = 'data:application/pdf;base64,AQIDBA==';

const pdfFile = (): FormatterFile => ({
    name: 'doc.pdf',
    kind: 'pdf',
    mime: 'application/pdf',
    content: DATA_URL,
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    pdfjs.renderCalls.length = 0;
});

// ─── computeFitScale (pure) ──────────────────────────────────────────────────

// Page-1 base viewport used across the fit tests: US Letter, 612×792
const BASE = { width: 612, height: 792 };

describe('computeFitScale', () => {
    it('fills the container content box (clientWidth minus BOTH scroll paddings)', () => {
        // 1000px container − 2×16 padding = 968 usable → 968 / 612
        expect(computeFitScale(1000, BASE, 0)).toBeCloseTo(968 / 612, 12);
    });

    it('fits the ROTATED width for quarter-turn rotations', () => {
        // 90°/270° swap the page axes — base width becomes the page HEIGHT
        expect(computeFitScale(1000, BASE, 90)).toBeCloseTo(968 / 792, 12);
        expect(computeFitScale(1000, BASE, 270)).toBeCloseTo(968 / 792, 12);
        // 180° keeps the width axis
        expect(computeFitScale(1000, BASE, 180)).toBeCloseTo(968 / 612, 12);
    });

    it('returns the 100% fallback before base dimensions are known', () => {
        expect(computeFitScale(1000, null, 0)).toBe(1);
    });

    it('returns the 100% fallback for unmeasurable (0) containers', () => {
        // jsdom clientWidth is always 0 → the viewer renders at 100% there
        expect(computeFitScale(0, BASE, 0)).toBe(1);
    });

    it('returns the 100% fallback when the paddings alone exceed the container', () => {
        // 20px container − 32px padding < 0 → degenerate, never divide
        expect(computeFitScale(20, BASE, 0)).toBe(1);
        expect(computeFitScale(SCROLL_PAD * 2, BASE, 0)).toBe(1);
    });

    it('clamps the fit scale to the manual zoom bounds', () => {
        // Huge container → capped at MAX_ZOOM (400%), never 16×
        expect(computeFitScale(10000, BASE, 0)).toBe(4);
        // Tiny container → floored at MIN_ZOOM (25%), never 11%
        expect(computeFitScale(100, BASE, 0)).toBe(0.25);
    });
});

// ─── usePdfDocument ──────────────────────────────────────────────────────────

// Probe component exposing the hook state through the DOM
const HookProbe = ({ content }: { content: string }) => {
    const state = usePdfDocument(content);
    return (
        <div
            data-testid="probe"
            data-status={state.status}
            data-num-pages={state.numPages}
            data-error={state.error ?? ''}
        />
    );
};

describe('usePdfDocument', () => {
    it('transitions loading → ready with the document page count', async () => {
        render(<HookProbe content={DATA_URL} />);

        expect(screen.getByTestId('probe').getAttribute('data-status')).toBe('loading');

        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-status')).toBe('ready');
        });
        expect(screen.getByTestId('probe').getAttribute('data-num-pages')).toBe('2');
        expect(screen.getByTestId('probe').getAttribute('data-error')).toBe('');
    });

    it('passes the DECODED bytes of the data URL to getDocument', async () => {
        render(<HookProbe content={DATA_URL} />);

        await waitFor(() => {
            expect(pdfjs.getDocument).toHaveBeenCalled();
        });
        const payload = (
            pdfjs.getDocument.mock.calls as unknown as [{ data: Uint8Array }][]
        )[0][0].data;
        // 'AQIDBA==' decodes to bytes 1, 2, 3, 4
        expect(Array.from(payload)).toEqual([1, 2, 3, 4]);
    });

    it('moves to the error state when the document fails to load', async () => {
        // One-shot failure: the promise rejects for THIS render only
        pdfjs.getDocument.mockImplementationOnce(() => ({
            promise: Promise.reject(new Error('Invalid PDF structure')),
        }));

        render(<HookProbe content={DATA_URL} />);

        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-status')).toBe('error');
        });
        expect(screen.getByTestId('probe').getAttribute('data-error')).toBe(
            'Invalid PDF structure',
        );
        expect(screen.getByTestId('probe').getAttribute('data-num-pages')).toBe('0');
    });

    it('destroys the document when the data URL changes or the hook unmounts', async () => {
        const { unmount } = render(<HookProbe content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-status')).toBe('ready');
        });

        unmount();
        expect(pdfjs.doc.destroy).toHaveBeenCalledTimes(1);
    });
});

// ─── PdfViewer ───────────────────────────────────────────────────────────────

describe('PdfViewer', () => {
    it('renders the toolbar and one lazy canvas per page once ready', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);

        // Loading state first, then the full toolbar + page frames
        expect(screen.getByTestId('pdf-loading')).toBeDefined();
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });

        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
        expect(screen.getByTestId('pdf-page-2')).toBeDefined();
        expect(screen.getByTestId('pdf-canvas-1')).toBeDefined();
        expect(screen.getByTestId('pdf-canvas-2')).toBeDefined();
        // Default zoom: fit-width is on, container width is 0 in jsdom → 100%
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('100%');
    });

    it('sizes page frames from the pdf.js viewport', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        // Wait for the exact computed frame size — 612×792 at scale 1
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('612px');
        });
        expect(screen.getByTestId('pdf-page-1').getAttribute('height')).toBe('792px');
    });

    it('refits frames to the container content box (clientWidth − 2 paddings) on resize', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        // jsdom clientWidth is 0 → transient 100% fallback first
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('612px');
        });

        // Simulate a real layout measurement on the mounted scroll area.
        // jsdom has no ResizeObserver → the viewer listens for window resizes.
        const scroll = screen.getByTestId('pdf-scroll');
        Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 1000 });
        fireEvent(window, new Event('resize'));

        // Fit scale = (1000 − 2×16) / 612 → frame width floors to 968px;
        // height floors to 792 × (968/612) = 1252.705… → 1252px
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('968px');
        });
        expect(screen.getByTestId('pdf-page-1').getAttribute('height')).toBe('1252px');

        // Shrink the container → frames shrink with it (never grow past it).
        // 612 × (468/612) = 467.999… → floored to 467px
        Object.defineProperty(scroll, 'clientWidth', { configurable: true, value: 500 });
        fireEvent(window, new Event('resize'));
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('467px');
        });

        delete (scroll as { clientWidth?: unknown }).clientWidth;
    });

    it('constrains canvases to the frame via CSS (never paints at backing-store size)', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-canvas-1')).toBeDefined();
        });

        // The canvas MUST carry the styled-component class (CSS width/height
        // 100%). A plain <canvas> would render at its attribute (backing-store)
        // size — viewport × devicePixelRatio — which on DPR > 1 machines
        // bleeds past the page frame and creates a phantom horizontal
        // scrollbar (the "off-centered fit-width page" regression).
        const canvas = screen.getByTestId('pdf-canvas-1');
        expect(canvas.className).toContain('css-');
        // The attribute size (backing store) may exceed the frame — the CSS
        // size is what the browser displays, and it is percentage-based
        expect(canvas.getAttribute('width')).toBe('612');
    });

    it('navigates pages with the prev/next buttons and clamps at the bounds', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
        });

        // Prev on the first page is disabled — no clamping needed
        expect((screen.getByTestId('pdf-page-prev') as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByTestId('pdf-page-next'));
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('2 / 2');

        // Next on the last page is disabled
        expect((screen.getByTestId('pdf-page-next') as HTMLButtonElement).disabled).toBe(true);

        fireEvent.click(screen.getByTestId('pdf-page-prev'));
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
    });

    it('jumps to a page through the page input on Enter', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
        });

        const input = screen.getByTestId('pdf-page-input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '2' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('2 / 2');
    });

    it('ignores out-of-range and non-numeric page jumps', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
        });

        const input = screen.getByTestId('pdf-page-input') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '99' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');

        fireEvent.change(input, { target: { value: 'abc' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
    });

    it('zooms in and out in steps, leaving fit-width mode', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('100%');
        });

        // Fit width starts ON; the first explicit zoom leaves fit mode
        expect(screen.getByTestId('pdf-fit-width').getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByTestId('pdf-zoom-in'));
        expect(screen.getByTestId('pdf-fit-width').getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('120%');

        fireEvent.click(screen.getByTestId('pdf-zoom-in'));
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('144%');

        // One step back: 144 / 1.2 = 120 (float artifacts rounded away)
        fireEvent.click(screen.getByTestId('pdf-zoom-out'));
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('120%');
    });

    it('clamps zoom at the 25%–400% bounds', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('100%');
        });

        // Down-steps round to: 83% → 69% → 58% → 48% → 40% → 33% → 28%,
        // and the 8th click (23.3) clamps at exactly 25%
        for (let index = 0; index < 7; index += 1) {
            fireEvent.click(screen.getByTestId('pdf-zoom-out'));
        }
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('28%');
        fireEvent.click(screen.getByTestId('pdf-zoom-out'));
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('25%');

        // Up-steps from 25% never display above the ceiling — clamps at 400%
        // (25 × 1.2^15 = 462.6 → clamped on the 15th click)
        for (let index = 0; index < 16; index += 1) {
            fireEvent.click(screen.getByTestId('pdf-zoom-in'));
        }
        expect(screen.getByTestId('pdf-zoom-label').textContent).toBe('400%');
    });

    it('re-renders pages with a device-pixel-ratio transform', async () => {
        // jsdom's canvas has no 2d context (getContext returns null) — stub it
        // so the pdf.js render call actually fires and can be asserted
        const contextSpy = vi
            .spyOn(HTMLCanvasElement.prototype, 'getContext')
            .mockReturnValue({ fillRect: () => {} } as unknown as CanvasRenderingContext2D);

        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(pdfjs.renderCalls.length).toBe(2);
        });

        // jsdom devicePixelRatio is 1 → no dpr transform is passed
        expect(pdfjs.renderCalls[0].transform).toBeUndefined();
        expect(pdfjs.renderCalls[0].pageNumber).toBe(1);
        expect(pdfjs.renderCalls[1].pageNumber).toBe(2);
        contextSpy.mockRestore();
    });

    it('rotates pages in quarter turns and swaps the frame axes', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('612px');
        });

        fireEvent.click(screen.getByTestId('pdf-rotate'));

        // 90° rotation: 612×792 becomes 792×612
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('792px');
        });
        expect(screen.getByTestId('pdf-page-1').getAttribute('height')).toBe('612px');

        // Three more clicks wrap back to 0° — original frame returns
        fireEvent.click(screen.getByTestId('pdf-rotate'));
        fireEvent.click(screen.getByTestId('pdf-rotate'));
        fireEvent.click(screen.getByTestId('pdf-rotate'));
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1').getAttribute('width')).toBe('612px');
        });
        expect(screen.getByTestId('pdf-page-1').getAttribute('height')).toBe('792px');
    });

    it('shows an error notice when the document cannot be opened', async () => {
        pdfjs.getDocument.mockImplementationOnce(() => ({
            promise: Promise.reject(new Error('Invalid PDF structure')),
        }));

        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);

        await waitFor(() => {
            expect(screen.getByTestId('pdf-error')).toBeDefined();
        });
        expect(screen.getByTestId('pdf-error').textContent).toBe(
            'doc.pdf: Invalid PDF structure',
        );
        // No page frames render in the error state
        expect(screen.queryByTestId('pdf-page-1')).toBeNull();
    });

    it('searches page text and reports match counts', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });

        // No status while the query is empty
        expect(screen.queryByTestId('pdf-search-status')).toBeNull();

        fireEvent.change(screen.getByTestId('pdf-search-input'), {
            target: { value: 'BRAVO' },
        });

        // Case-insensitive: 'BRAVO' matches page 1 only, one occurrence
        await waitFor(() => {
            expect(screen.getByTestId('pdf-search-status').textContent).toBe('1 match');
        });
        // A page with a match becomes the current page (jumped automatically)
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');
        // Match navigation is armed
        expect((screen.getByTestId('pdf-search-next') as HTMLButtonElement).disabled).toBe(false);
    });

    it('reports no matches and keeps match navigation disabled', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });

        fireEvent.change(screen.getByTestId('pdf-search-input'), {
            target: { value: 'zebra' },
        });

        await waitFor(() => {
            expect(screen.getByTestId('pdf-search-status').textContent).toBe('No matches');
        });
        expect((screen.getByTestId('pdf-search-next') as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByTestId('pdf-search-prev') as HTMLButtonElement).disabled).toBe(true);
    });

    it('cycles match navigation across the pages containing matches', async () => {
        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });

        // Both pages contain 'a' — 3 on page 1 ("alpha bravo") + 2 on page 2
        // ("charlie delta") = 5 occurrences across 2 matching pages
        fireEvent.change(screen.getByTestId('pdf-search-input'), {
            target: { value: 'a' },
        });
        await waitFor(() => {
            expect(screen.getByTestId('pdf-search-status').textContent).toBe('5 matches');
        });
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');

        // Next match → page 2, wraps back to page 1
        fireEvent.click(screen.getByTestId('pdf-search-next'));
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('2 / 2');
        fireEvent.click(screen.getByTestId('pdf-search-next'));
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('1 / 2');

        // Prev match from page 1 wraps backwards to page 2
        fireEvent.click(screen.getByTestId('pdf-search-prev'));
        expect(screen.getByTestId('pdf-page-indicator').textContent).toBe('2 / 2');
    });

    it('downloads the document as a PDF blob with the original file name', async () => {
        // jsdom lacks object URLs — stub the lifecycle and capture the click
        URL.createObjectURL = vi.fn(() => 'blob:mock-pdf-url');
        URL.revokeObjectURL = vi.fn();
        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clicked.push(this);
        });

        render(<PdfViewer name="doc.pdf" content={DATA_URL} />);
        await waitFor(() => {
            expect(screen.getByTestId('pdf-page-1')).toBeDefined();
        });

        fireEvent.click(screen.getByTestId('pdf-download'));

        expect(clicked).toHaveLength(1);
        expect(clicked[0].download).toBe('doc.pdf');
        expect(clicked[0].href).toBe('blob:mock-pdf-url');
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe('application/pdf');
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-pdf-url');
    });
});

// ─── pdfReaderPlugin ─────────────────────────────────────────────────────────

describe('pdfReaderPlugin', () => {
    it('contributes the PDF viewer for kind pdf files with a data URL', () => {
        const node = pdfReaderPlugin.renderFile?.(pdfFile());
        expect(node).not.toBeNull();
        // Render the node and confirm it mounts the viewer
        render(<>{node}</>);
        expect(screen.getByTestId('pdf-viewer')).toBeDefined();
        expect(pdfReaderPlugin.id).toBe('pdf');
        expect(pdfReaderPlugin.label).toBe('PDF');
    });

    it('contributes nothing for other file kinds', () => {
        expect(
            pdfReaderPlugin.renderFile?.({ ...pdfFile(), kind: 'text', content: 'plain' }),
        ).toBeNull();
        expect(
            pdfReaderPlugin.renderFile?.({ ...pdfFile(), kind: 'image', content: 'data:image/png;base64,AA' }),
        ).toBeNull();
        expect(pdfReaderPlugin.renderFile?.({ ...pdfFile(), kind: 'binary', content: '' })).toBeNull();
    });

    it('shows the unavailable-content notice when the content is not a data URL', () => {
        const node = pdfReaderPlugin.renderFile?.({ ...pdfFile(), content: '' });
        render(<>{node}</>);
        expect(screen.queryByTestId('pdf-viewer')).toBeNull();
        expect(screen.getByTestId('file-content-pdf-notice').textContent).toBe(
            'doc.pdf cannot be previewed — the PDF content is unavailable.',
        );
    });
});
