import React, { useEffect } from 'react';
import { arrayCreate } from '@presource/core';
import { styledComponent, useReferenceHook, useStateHook, useToggleHook } from '@presource/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { decodeDataUrl } from '../exportPdf/exportFilesToPdf';
import { usePdfDocument } from './usePdfDocument';

// ─── Zoom / rotation constants ───────────────────────────────────────────────

// Zoom bounds (multiplier, 1 = 100%) and multiplicative step per click —
// geometric stepping keeps equal numbers of clicks equidistant in log space
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.2;

// Clamp helper — zoom never leaves the [MIN_ZOOM, MAX_ZOOM] window
const clampZoom = (value: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

// Rotations cycle through quarter turns only
type Rotation = 0 | 90 | 180 | 270;

// Horizontal padding of the scroll area (mirrors ScrollArea's padding below).
// The fit-width computation must reserve it: `clientWidth` INCLUDES padding,
// so a frame sized to the raw clientWidth would overflow by 2 × padding.
export const SCROLL_PAD = 16;

// Pure fit-width scale: how much the page-1 base viewport must grow so its
// width fills the scroll area's CONTENT box (clientWidth minus both paddings).
// Exported for deterministic unit tests. Guards:
// - no base dimensions yet / unmeasurable container → 1 (transient 100%)
// - degenerate available width → 1
// - result clamped to the same zoom window as manual zooming
export const computeFitScale = (
    containerWidth: number,
    base: { width: number; height: number } | null,
    rotation: Rotation,
): number => {
    if (!base || containerWidth <= 0) return 1;
    // Quarter turns swap the page axes — fit the ROTATED width
    const baseWidth = rotation === 90 || rotation === 270 ? base.height : base.width;
    const available = containerWidth - SCROLL_PAD * 2;
    if (available <= 0) return 1;
    return clampZoom(available / baseWidth);
};

// ─── Styled shell (dashboard dark theme: #0b1120 chrome / #0f172a body) ──────

// Viewer root — fills the content pane the dashboard hands it (100% × 100%)
const ViewerRoot = styledComponent('div', {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    background: '#0f172a',
    color: '#e2e8f0',
    overflow: 'hidden' as const,
    minHeight: 0,
});

// Toolbar — wraps (narrow panes) instead of clipping controls
const Toolbar = styledComponent('div', {
    display: 'flex',
    flexDirection: 'row' as const,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: 8,
    padding: '8px 12px',
    flexShrink: 0,
    background: '#0b1120',
    borderBottom: '1px solid #1e293b',
});

// Toolbar divider — groups the control clusters (page / zoom / search)
const ToolbarDivider = styledComponent('span', {
    width: 1,
    height: 20,
    background: '#1e293b',
    flexShrink: 0,
});

// Generic small toolbar button. `active` marks toggles (fit-width); disabled
// state comes from the standard button attribute via the cast below.
const ToolButton = styledComponent<{ active: boolean }>(
    'button',
    {
        padding: '4px 10px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        borderRadius: 6,
        border: '1px solid #1e293b',
        background: ({ active }: { active: boolean }) => (active ? '#1d4ed8' : '#16233b'),
        color: '#cbd5e1',
        cursor: 'pointer',
        flexShrink: 0,
    },
    // Same cast pattern as TabButton (FormatterDashboard.tsx) / ExportPdfButton —
    // the element only needs standard button attributes plus `active`
) as unknown as React.FC<{ active?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>>;

// Muted numeric readouts (page indicator, zoom %, match count) — tabular
// numerals keep the width stable while paging
const ToolLabel = styledComponent('span', {
    fontSize: 12,
    color: '#94a3b8',
    fontVariantNumeric: 'tabular-nums' as const,
    whiteSpace: 'nowrap' as const,
});

// Page jump input — fixed width, centered digits
const PageInput = styledComponent('input', {
    width: 48,
    padding: '4px 6px',
    fontSize: 12,
    fontFamily: 'inherit',
    textAlign: 'center' as const,
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: '#0f172a',
    color: '#e2e8f0',
    outline: 'none' as const,
}) as unknown as React.FC<React.InputHTMLAttributes<HTMLInputElement>>;

// Search input — grows with the toolbar, never squeezes the buttons out
const SearchInput = styledComponent('input', {
    flex: 1,
    minWidth: 120,
    padding: '4px 8px',
    fontSize: 12,
    fontFamily: 'inherit',
    borderRadius: 6,
    border: '1px solid #1e293b',
    background: '#0f172a',
    color: '#e2e8f0',
    outline: 'none' as const,
}) as unknown as React.FC<React.InputHTMLAttributes<HTMLInputElement>>;

// Scrollable page column — the only scrolling region in the viewer (the
// dashboard's root has overflow hidden, so this owns the scrollbar).
// NO align-items center: a flex-centered child WIDER than the container
// overflows on BOTH sides, and the left overflow is unreachable by scrolling
// (the "off-centered fit-width page" bug). Children center themselves with
// margin auto instead — auto margins collapse to 0 on overflow, so an
// oversized page stays flush-left and fully scrollable.
const ScrollArea = styledComponent('div', {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
    overflowX: 'auto' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
    padding: SCROLL_PAD,
}) as unknown as React.FC<
    React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }
>;

// Page frame — white "paper" behind the transparent canvas. Width/height come
// from the computed pdf.js viewport as STRING pixel values (function values
// pass through styleStructure, which would convert raw numbers to rem).
// Cast adds `ref` — styledComponent's React.FC type omits it, but Emotion's
// styled() forwards refs at runtime (same pattern as the doc comment in
// presource/react styled-component).
const PageFrame = styledComponent<{ width: string; height: string }>('div', {
    position: 'relative' as const,
    background: '#ffffff',
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.45)',
    flexShrink: 0,
    // Horizontal centering via auto margins — when the frame is WIDER than
    // the container the margins collapse to 0 (flush left, scrollable right)
    // instead of flex-centering it into the unscrollable left overflow
    margin: '0 auto' as const,
    width: ({ width }) => width,
    height: ({ height }) => height,
}) as unknown as React.FC<
    { width: string; height: string } & React.HTMLAttributes<HTMLDivElement> & {
        ref?: React.Ref<HTMLDivElement>;
    }
>;

// Canvas fill — the canvas is sized to the viewport by pdf.js; CSS stretches
// it to the frame so the backing store resolution (device-pixel-ratio) can
// differ from the layout size
const PageCanvas = styledComponent('canvas', {
    display: 'block' as const,
    width: '100%',
    height: '100%',
});

// Loading / error / pre-render notice — centered, muted
const Notice = styledComponent('div', {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center' as const,
    padding: 32,
    margin: 'auto' as const,
});

// ─── Per-page canvas renderer ────────────────────────────────────────────────

export type PdfPageCanvasProps = {
    doc: PDFDocumentProxy;
    pageNumber: number;
    scale: number;
    rotation: Rotation;
};

// Renders ONE page onto its canvas. Rendering is lazy: an IntersectionObserver
// flips `visible` the first time the frame approaches the viewport (with a
// 256px pre-render margin); once visible it stays rendered. Re-renders happen
// whenever scale / rotation change while visible.
const PdfPageCanvas = ({ doc, pageNumber, scale, rotation }: PdfPageCanvasProps) => {
    // Frame element — observed for visibility and used to size the page
    const frame = useReferenceHook<HTMLDivElement | null>(null);
    // Viewport dimensions (CSS px) — null until the page proxy resolves
    const dims = useStateHook<{ width: number; height: number } | null>(null);
    // Lazy-render gate — see the observer effect below
    const visible = useStateHook(false);

    // Visibility observer. Environments without IntersectionObserver (jsdom
    // tests, ancient browsers) render everything immediately — correctness
    // over laziness.
    useEffect(() => {
        if (typeof IntersectionObserver === 'undefined') {
            visible(true);
            return;
        }
        const node = frame();
        if (!node) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    visible(true);
                    // Once rendered, keep it — disconnect to stop observing
                    observer.disconnect();
                }
            },
            // Pre-render pages just outside the viewport so scrolling feels seamless
            { rootMargin: '256px' },
        );
        observer.observe(node);
        return () => observer.disconnect();
        // Mount-only — `visible`/`frame` are stable useStateHook handles
    }, []);

    // Render effect: load the page proxy, size the frame, paint the canvas at
    // device-pixel-ratio resolution. Cancelled on cleanup (scale/rotation
    // change or unmount) so in-flight paints never write into a stale canvas.
    useEffect(() => {
        if (!visible()) return;
        let cancelled = false;
        // RenderTask has .cancel(); kept as a loose shape to avoid importing
        // the RenderTask type into every signature
        let task: { cancel: () => void } | null = null;

        doc
            .getPage(pageNumber)
            .then((page) => {
                if (cancelled) return;
                const viewport = page.getViewport({ scale, rotation });
                // Size the frame FIRST so the scrollbar/intersection state is
                // correct even while the paint is still in flight
                dims({ width: Math.floor(viewport.width), height: Math.floor(viewport.height) });
                const canvas = frame()?.querySelector('canvas');
                if (!canvas) return;
                // Backing store at device pixel ratio (capped at 2 — beyond
                // that the memory cost dwarfs the visual gain)
                const ratio = Math.min(window.devicePixelRatio || 1, 2);
                canvas.width = Math.floor(viewport.width * ratio);
                canvas.height = Math.floor(viewport.height * ratio);
                const context = canvas.getContext('2d');
                if (!context) return;
                const renderTask = page.render({
                    canvasContext: context,
                    viewport,
                    // Scale the paint by the same ratio the backing store uses
                    transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
                });
                task = renderTask;
                // Cancelled renders reject — swallow (cleanup already handled it)
                return renderTask.promise.catch(() => undefined);
            })
            .catch(() => {
                // Page-level failure stays silent here; document-level errors
                // surface through usePdfDocument's error state
            });

        return () => {
            cancelled = true;
            task?.cancel();
        };
        // deps: visible is read via the stable handle, so it must be listed
        // via its current VALUE to re-fire when the gate opens
    }, [doc, pageNumber, scale, rotation, visible()]);

    return (
        <PageFrame
            data-testid={`pdf-page-${pageNumber}`}
            // Unknown dims yet → zero-size frame; the observer still fires and
            // the first render sizes it (placeholder spinner omitted on purpose)
            width={dims() ? `${dims()!.width}px` : '0px'}
            height={dims() ? `${dims()!.height}px` : '0px'}
            ref={frame as unknown as React.Ref<HTMLDivElement>}
        >
            {/* MUST be the styled PageCanvas (CSS width/height 100%) — a plain
                canvas displays at its ATTRIBUTE (backing-store) size, which is
                viewport × devicePixelRatio: on any DPR > 1 machine it paints
                past the frame and creates a phantom horizontal scrollbar */}
            <PageCanvas data-testid={`pdf-canvas-${pageNumber}`} />
        </PageFrame>
    );
};

// ─── Viewer ──────────────────────────────────────────────────────────────────

export type PdfViewerProps = {
    // Original file name — reused verbatim for the download button
    name: string;
    // PDF content as a data URL (the readTextFile strategy for kind 'pdf')
    content: string;
};

export const PdfViewer = ({ name, content }: PdfViewerProps) => {
    // Document lifecycle from the data URL
    const document = usePdfDocument(content);
    const { status, doc, numPages, error } = document;

    // ── View state ──
    const zoom = useStateHook(1); // multiplier when NOT fitting width
    const fitWidth = useToggleHook(true); // default: fit the pane width
    const rotation = useStateHook<Rotation>(0);
    const currentPage = useStateHook(1);
    const pageInput = useStateHook(''); // jump-box text

    // Fit computation inputs: page-1 base dimensions (scale 1) + container width
    const baseDims = useStateHook<{ width: number; height: number } | null>(null);
    const containerWidth = useStateHook(0);
    const scrollArea = useReferenceHook<HTMLDivElement | null>(null);
    // pageNumber → wrapper element map, filled by the page refs
    const pageNodes = useReferenceHook<Map<number, HTMLDivElement>>(new Map());

    // ── Search state ──
    const searchQuery = useStateHook('');
    // null = no results computed yet (idle or still searching)
    const search = useStateHook<{ pages: number[]; total: number } | null>(null);
    const matchIndex = useStateHook(0);

    // Effective scale: fit-width derives from the container (via the pure
    // computeFitScale helper — reserves the scroll paddings), otherwise zoom
    const scale = fitWidth()
        ? computeFitScale(containerWidth(), baseDims(), rotation())
        : zoom();

    // ── Effects ──

    // Page-1 base dimensions, needed by the fit-width computation
    useEffect(() => {
        if (!doc) return;
        let cancelled = false;
        doc
            .getPage(1)
            .then((page) => {
                if (cancelled) return;
                const viewport = page.getViewport({ scale: 1 });
                baseDims({ width: viewport.width, height: viewport.height });
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [doc]);

    // Container width for fit-width — ResizeObserver where available, window
    // resize fallback otherwise (jsdom has neither clientWidth nor observer)
    useEffect(() => {
        const node = scrollArea();
        if (!node) return;
        const measure = () => containerWidth(node.clientWidth);
        measure();
        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', measure);
            return () => window.removeEventListener('resize', measure);
        }
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
        // Re-measure when the scroll area mounts (status flips loading → ready)
    }, [status]);

    // Reset view state whenever a NEW document becomes ready (file switch)
    useEffect(() => {
        if (status !== 'ready') return;
        currentPage(1);
        pageInput('');
        searchQuery('');
        search(null);
        matchIndex(0);
        // currentPage etc. are stable handles — only the document identity matters
    }, [doc]);

    // Full-text search: per-page getTextContent → case-insensitive substring
    // count. Results = pages containing ≥1 match + the total match count.
    const query = searchQuery();
    useEffect(() => {
        if (!doc) return;
        const needle = query.trim().toLowerCase();
        if (!needle) {
            search(null);
            return;
        }
        let cancelled = false;
        const run = async () => {
            const pages: number[] = [];
            let total = 0;
            // Sequential page walk — pdf.js text extraction is fast, and
            // sequential order keeps `pages` sorted for match navigation
            for (let pageNumber = 1; pageNumber <= numPages; pageNumber += 1) {
                const page = await doc.getPage(pageNumber);
                const text = await page.getTextContent();
                // TextItem carries `str`; TextMarkedContent items do not —
                // filter them out instead of concatenating "undefined"
                const pageText = text.items
                    .map((item) => (typeof (item as { str?: unknown }).str === 'string' ? (item as { str: string }).str : ''))
                    .join(' ')
                    .toLowerCase();
                let position = pageText.indexOf(needle);
                let count = 0;
                while (position !== -1) {
                    count += 1;
                    position = pageText.indexOf(needle, position + needle.length);
                }
                if (count > 0) {
                    pages.push(pageNumber);
                    total += count;
                }
                if (cancelled) return;
            }
            if (cancelled) return;
            search({ pages, total });
            matchIndex(0);
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [doc, numPages, query]);

    // ── Handlers ──

    // Scrolls the target page's frame into view; the scroll listener then
    // syncs `currentPage` from the scroll position (single source of truth)
    const goToPage = (target: number) => {
        if (!Number.isFinite(target) || target < 1 || target > numPages) return;
        const node = pageNodes().get(target);
        // jsdom has no scrollIntoView — guarded so tests can drive navigation
        if (node && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ block: 'start' });
        }
        currentPage(target);
    };

    // Scroll → current page: whichever page frame straddles the vertical
    // midpoint of the scroll area is "current"
    const handleScroll = () => {
        const container = scrollArea();
        if (!container || !numPages) return;
        const midpoint = container.scrollTop + container.clientHeight / 2;
        let best = 1;
        pageNodes().forEach((node, pageNumber) => {
            if (node.offsetTop <= midpoint && pageNumber > best) best = pageNumber;
        });
        if (best !== currentPage()) currentPage(best);
    };

    // Zoom buttons exit fit-width mode (an explicit zoom is a manual choice)
    const zoomBy = (factor: number) => {
        fitWidth(false);
        zoom(clampZoom(zoom() * factor));
    };

    const rotateBy = () => rotation(((rotation() + 90) % 360) as Rotation);

    // Match navigation wraps around; jumps through pages containing matches
    const matchPages = search()?.pages ?? [];
    const stepMatch = (direction: 1 | -1) => {
        if (matchPages.length === 0) return;
        const next =
            (matchIndex() + direction + matchPages.length) % matchPages.length;
        matchIndex(next);
        goToPage(matchPages[next]);
    };

    // Download: decode → blob → synthetic anchor click (same lifecycle the
    // Export PDF button uses). The object URL is revoked right after the
    // click — the browser has already accepted the download by then.
    const handleDownload = () => {
        const bytes = decodeDataUrl(content);
        const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const anchor = globalThis.document.createElement('a');
        anchor.href = url;
        anchor.download = name.endsWith('.pdf') ? name : `${name}.pdf`;
        globalThis.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    };

    // ── Derived labels ──
    const zoomPercent = `${Math.round(scale * 100)}%`;
    const searchTotal = search()?.total ?? 0;
    const searchLabel = query.trim()
        ? search() === null
            ? 'Searching…'
            : searchTotal === 0
              ? 'No matches'
              : `${searchTotal} match${searchTotal === 1 ? '' : 'es'}`
        : '';

    return (
        <ViewerRoot data-testid="pdf-viewer">
            <Toolbar data-testid="pdf-toolbar">
                {/* Page navigation cluster */}
                <ToolButton
                    type="button"
                    active={false}
                    data-testid="pdf-page-prev"
                    aria-label="Previous page"
                    disabled={status !== 'ready' || currentPage() <= 1}
                    onClick={() => goToPage(currentPage() - 1)}
                >
                    ‹
                </ToolButton>
                <ToolLabel data-testid="pdf-page-indicator">
                    {status === 'ready' ? `${currentPage()} / ${numPages}` : '– / –'}
                </ToolLabel>
                <ToolButton
                    type="button"
                    active={false}
                    data-testid="pdf-page-next"
                    aria-label="Next page"
                    disabled={status !== 'ready' || currentPage() >= numPages}
                    onClick={() => goToPage(currentPage() + 1)}
                >
                    ›
                </ToolButton>
                <PageInput
                    data-testid="pdf-page-input"
                    aria-label="Jump to page"
                    value={pageInput()}
                    placeholder="Page"
                    onChange={(event) => pageInput(event.currentTarget.value)}
                    // Enter commits the jump; blur keeps the typed text
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            goToPage(Number.parseInt(pageInput(), 10));
                        }
                    }}
                />
                <ToolbarDivider />
                {/* Zoom cluster */}
                <ToolButton
                    type="button"
                    active={false}
                    data-testid="pdf-zoom-out"
                    aria-label="Zoom out"
                    disabled={status !== 'ready'}
                    onClick={() => zoomBy(1 / ZOOM_STEP)}
                >
                    −
                </ToolButton>
                <ToolLabel data-testid="pdf-zoom-label">{zoomPercent}</ToolLabel>
                <ToolButton
                    type="button"
                    active={false}
                    data-testid="pdf-zoom-in"
                    aria-label="Zoom in"
                    disabled={status !== 'ready'}
                    onClick={() => zoomBy(ZOOM_STEP)}
                >
                    +
                </ToolButton>
                <ToolButton
                    type="button"
                    active={fitWidth()}
                    data-testid="pdf-fit-width"
                    aria-pressed={fitWidth()}
                    disabled={status !== 'ready'}
                    onClick={() => fitWidth(!fitWidth())}
                >
                    Fit width
                </ToolButton>
                <ToolButton
                    type="button"
                    active={false}
                    data-testid="pdf-rotate"
                    aria-label="Rotate clockwise"
                    disabled={status !== 'ready'}
                    onClick={rotateBy}
                >
                    Rotate
                </ToolButton>
                <ToolbarDivider />
                {/* Search cluster */}
                <SearchInput
                    data-testid="pdf-search-input"
                    aria-label="Search document"
                    value={searchQuery()}
                    placeholder="Search document…"
                    disabled={status !== 'ready'}
                    onChange={(event) => searchQuery(event.currentTarget.value)}
                />
                {searchLabel ? (
                    <ToolLabel data-testid="pdf-search-status">{searchLabel}</ToolLabel>
                ) : null}
                <ToolButton
                    type="button"
                    active={false}
                    data-testid="pdf-search-prev"
                    aria-label="Previous match"
                    disabled={matchPages.length === 0}
                    onClick={() => stepMatch(-1)}
                >
                    ↑
                </ToolButton>
                <ToolButton
                    type="button"
                    active={false}
                    data-testid="pdf-search-next"
                    aria-label="Next match"
                    disabled={matchPages.length === 0}
                    onClick={() => stepMatch(1)}
                >
                    ↓
                </ToolButton>
                <ToolbarDivider />
                {/* Download cluster */}
                <ToolButton
                    type="button"
                    active={false}
                    data-testid="pdf-download"
                    disabled={status !== 'ready'}
                    onClick={handleDownload}
                >
                    Download
                </ToolButton>
            </Toolbar>

            {/* Body: loading / error / page column. The `!doc` guard doubles
                as the type narrowing for the ready branch (status === 'ready'
                implies a document, but TS cannot see that through the hook). */}
            {status === 'loading' ? (
                <Notice data-testid="pdf-loading">Loading PDF…</Notice>
            ) : status === 'error' || !doc ? (
                <Notice data-testid="pdf-error">
                    {name}: {error ?? 'The PDF could not be opened.'}
                </Notice>
            ) : (
                <ScrollArea
                    data-testid="pdf-scroll"
                    ref={scrollArea as unknown as React.Ref<HTMLDivElement>}
                    onScroll={handleScroll}
                >
                    {arrayCreate(numPages).map((_, index) => {
                        const pageNumber = index + 1;
                        return (
                            <div
                                key={pageNumber}
                                ref={(node) => {
                                    // Register/unregister the wrapper for
                                    // scroll tracking and page jumps
                                    if (node) pageNodes().set(pageNumber, node);
                                    else pageNodes().delete(pageNumber);
                                }}
                            >
                                <PdfPageCanvas
                                    doc={doc}
                                    pageNumber={pageNumber}
                                    scale={scale}
                                    rotation={rotation()}
                                />
                            </div>
                        );
                    })}
                </ScrollArea>
            )}
        </ViewerRoot>
    );
};
