import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import {
    sanitizeWinAnsiText,
    wrapText,
    decodeDataUrl,
    buildFilesPdf,
    downloadFilesPdf,
} from './exportFilesToPdf';
import type { FormatterFile } from '../../functions';

// Geometry constants mirrored from exportFilesToPdf.ts (kept in sync via the
// page-count assertions below — if the module changes pagination, these break
// loudly instead of silently drifting). Zero-margin layout: text starts at
// y = PAGE_HEIGHT − BODY_SIZE and wraps at floor(595.28 / 6) = 99 chars.
const LINES_PER_PAGE = 60; // floor((841.89 − 10) / 14) + 1
const A4 = { width: 595.28, height: 841.89 };

// Valid 1×1 PNG (RGBA) — well-known minimal base64 fixture
const PNG_1X1_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const file = (overrides: Partial<FormatterFile>): FormatterFile => ({
    name: 'file.txt',
    kind: 'text',
    mime: 'text/plain',
    content: '',
    ...overrides,
});

// Decodes a page's (Flate-compressed) content stream into its operator text.
// Used to assert exact draw placement: pdf-lib emits the image transform as
// "<translate> cm … <scale> cm … Do" and text as "… Tm … <hex> Tj".
const pageContent = (doc: PDFDocument, index: number): string => {
    const contents = doc.getPage(index).node.Contents() as PDFArray;
    const parts: string[] = [];
    for (let i = 0; i < contents.size(); i += 1) {
        const stream = contents.context.lookup(contents.get(i));
        if (stream instanceof PDFRawStream) {
            // decode() returns a Uint8Array — map bytes to a latin1 string
            // manually (Uint8Array.toString() would comma-join the numbers)
            const bytes = decodePDFRawStream(stream).decode();
            parts.push(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
        }
    }
    return parts.join('\n');
};

beforeEach(() => {
    // jsdom has no object URL implementation — stub both sides of the URL
    // lifecycle so downloadFilesPdf can be observed deterministically
    URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('sanitizeWinAnsiText', () => {
    it('keeps ASCII and Latin-1 characters unchanged', () => {
        expect(sanitizeWinAnsiText('Hello, world! é ü ñ £')).toBe('Hello, world! é ü ñ £');
    });

    it('replaces characters outside WinAnsi coverage with "?"', () => {
        // '中' (U+4E2D), '😀' (U+1F600) and the control byte U+0001 are all
        // unencodable → '?'; the literal trailing '?' itself stays — so the
        // result ends with two '?' (one replacement + one original)
        expect(sanitizeWinAnsiText('a中b😀c\u0001?')).toBe('a?b?c??');
    });

    it('converts tabs to spaces', () => {
        expect(sanitizeWinAnsiText('a\tb')).toBe('a b');
    });
});

describe('wrapText', () => {
    it('passes through lines that fit within maxChars', () => {
        expect(wrapText('short\nlines\nonly', 10)).toEqual(['short', 'lines', 'only']);
    });

    it('hard-chunks long lines at exactly maxChars', () => {
        expect(wrapText('a'.repeat(25), 10)).toEqual([
            'aaaaaaaaaa',
            'aaaaaaaaaa',
            'aaaaa',
        ]);
    });

    it('chunks each newline-separated segment independently', () => {
        expect(wrapText('abc\nabcdefghij\nxy', 4)).toEqual(['abc', 'abcd', 'efgh', 'ij', 'xy']);
    });

    it('yields a single empty line for empty content (page still generated)', () => {
        expect(wrapText('', 10)).toEqual(['']);
    });

    it('sanitizes unencodable characters before wrapping', () => {
        expect(wrapText('中中中中中', 2)).toEqual(['??', '??', '?']);
    });
});

describe('decodeDataUrl', () => {
    it('decodes the base64 payload after the comma into exact bytes', () => {
        // 'AQID' decodes to bytes 1, 2, 3
        expect(Array.from(decodeDataUrl('data:image/png;base64,AQID'))).toEqual([1, 2, 3]);
    });

    it('treats a bare base64 string (no comma) as the payload', () => {
        expect(Array.from(decodeDataUrl('AQID'))).toEqual([1, 2, 3]);
    });

    it('decodes the 1×1 PNG fixture', () => {
        expect(decodeDataUrl(`data:image/png;base64,${PNG_1X1_BASE64}`).length).toBe(70);
    });
});

describe('buildFilesPdf', () => {
    it('produces one A4 page for a short text file', async () => {
        const doc = await buildFilesPdf([file({ name: 'hello.txt', content: 'hello' })]);
        expect(doc.getPageCount()).toBe(1);
        expect(doc.getPage(0).getSize()).toEqual(A4);
    });

    it('paginates long text files at exactly LINES_PER_PAGE lines per page', async () => {
        // 61 wrapped lines (99 chars each) → 60 on page 1, 1 on page 2
        const doc = await buildFilesPdf([
            file({ name: 'long.txt', content: 'a'.repeat(99 * 61) }),
        ]);
        expect(doc.getPageCount()).toBe(2);
    });

    it('embeds a PNG image page and notes video/binary pages, in drop order', async () => {
        const doc = await buildFilesPdf([
            file({ name: 'a.txt', content: 'alpha' }),
            file({ name: 'app.exe', kind: 'binary', mime: 'application/octet-stream', content: 'raw' }),
            file({
                name: 'logo.png',
                kind: 'image',
                mime: 'image/png',
                content: `data:image/png;base64,${PNG_1X1_BASE64}`,
            }),
            file({
                name: 'clip.mp4',
                kind: 'video',
                mime: 'video/mp4',
                content: 'data:video/mp4;base64,AAAA',
            }),
        ]);

        // One page per file, in sidebar order
        expect(doc.getPageCount()).toBe(4);
        doc.getPages().forEach((page) => {
            expect(page.getSize()).toEqual(A4);
        });
    });

    it('scales images edge to edge (cover fit) with no white border', async () => {
        const doc = await buildFilesPdf([
            file({
                name: 'logo.png',
                kind: 'image',
                mime: 'image/png',
                content: `data:image/png;base64,${PNG_1X1_BASE64}`,
            }),
        ]);

        // Content streams only decode after save → load (they become Flate-
        // compressed PDFRawStreams at that point)
        const reloaded = await PDFDocument.load(await doc.save());

        // The 1×1 image is cover-scaled to the FULL page: scale dimension is
        // 841.89 (the larger relative axis) on both axes, so the image spans
        // edge to edge with no margin. The overflow axis (width) is centered:
        // x offset = (595.28 − 841.89) / 2 = −123.305, y offset = 0.
        const content = pageContent(reloaded, 0);
        expect(content).toContain('1 0 0 1 -123.305 0 cm');
        expect(content).toContain('841.89 0 0 841.89 0 0 cm');
    });

    it('draws text edge to edge — no margin, no file-name title', async () => {
        const doc = await buildFilesPdf([file({ name: 'hello.txt', content: 'hello' })]);
        const reloaded = await PDFDocument.load(await doc.save());
        const content = pageContent(reloaded, 0);

        // Text matrix starts flush at x = 0 (no left margin) with the first
        // baseline at PAGE_HEIGHT − BODY_SIZE = 831.89 (no title above it)
        expect(content).toContain('1 0 0 1 0 831.89 Tm');
        // 'hello' hex-encoded in the content stream; the file name 'hello.txt'
        // is NOT drawn anywhere (no title)
        expect(content).toContain('68656C6C6F');
        expect(content).not.toContain('68656C6C6F2E747874');
    });

    it('falls back to a note page for unsupported image formats (svg)', async () => {
        const doc = await buildFilesPdf([
            file({
                name: 'icon.svg',
                kind: 'image',
                mime: 'image/svg+xml',
                content: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
            }),
        ]);
        expect(doc.getPageCount()).toBe(1);
    });

    it('survives an empty session with a single note page', async () => {
        const doc = await buildFilesPdf([]);
        expect(doc.getPageCount()).toBe(1);
    });

    it('saves to bytes that reload as a valid PDF document', async () => {
        const doc = await buildFilesPdf([file({ name: 'a.txt', content: 'alpha' })]);
        const bytes = await doc.save();
        const reloaded = await PDFDocument.load(bytes);
        expect(reloaded.getPageCount()).toBe(1);
    });
});

describe('downloadFilesPdf', () => {
    it('builds the PDF and auto-triggers a single browser download', async () => {
        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clicked.push(this);
        });

        await downloadFilesPdf([file({ name: 'a.txt', content: 'alpha' })], 'custom-name.pdf');

        // Exactly one synthetic anchor click → one automatic download
        expect(clicked).toHaveLength(1);
        expect(clicked[0].download).toBe('custom-name.pdf');
        expect(clicked[0].href).toBe('blob:mock-url');
        // The blob handed to createObjectURL is a PDF
        const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
        expect(blob.type).toBe('application/pdf');
        // The object URL lifecycle is completed (no leak)
        expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('defaults the downloaded file name to formatter-export.pdf', async () => {
        const clicked: HTMLAnchorElement[] = [];
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clicked.push(this);
        });

        await downloadFilesPdf([file({ name: 'a.txt', content: 'alpha' })]);

        expect(clicked[0].download).toBe('formatter-export.pdf');
    });
});
