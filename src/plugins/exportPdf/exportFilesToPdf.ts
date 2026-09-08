import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { arrayEachAsync } from '@presource/core';
import type { FormatterFile } from '../../functions';

// ─── Page geometry (A4 portrait, points) ─────────────────────────────────────
// Cross-reference: used by buildFilesPdf below; the export button lives in
// the ExportPdfPlugin header slot (plugins/exportPdf/ExportPdfPlugin.tsx).
// ZERO margins by design — content renders edge to edge, no file-name title.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

// Body text drawn in Courier (monospace keeps plain-text alignment stable)
const BODY_SIZE = 10;
// Fixed line height for body text — vertical rhythm is deterministic
const LINE_HEIGHT = 14;

// First body-line baseline on a page: a full BODY_SIZE below the top edge so
// the ascent of the first line stays fully on the page
const BODY_TOP = PAGE_HEIGHT - BODY_SIZE;
// Lines that fit on one page: distance between first and last baseline
// (down to y = 0, the bottom edge), divided by line height (+1 — both
// endpoints count as lines)
const LINES_PER_PAGE = Math.floor(BODY_TOP / LINE_HEIGHT) + 1;

// Text starts at the very LEFT edge (x = 0). Courier's advance width is
// 0.6 × size = 6pt per char at 10pt → 595.28 / 6 ≈ 99 chars per line.
const MAX_CHARS_PER_LINE = 99;

// Muted slate tones matching the dashboard theme (#0f172a shell / #e2e8f0 text)
const TEXT_COLOR = rgb(0.09, 0.11, 0.17);
const MUTED_COLOR = rgb(0.42, 0.47, 0.55);

// ─── Text helpers ────────────────────────────────────────────────────────────

// pdf-lib's standard fonts encode with WinAnsi, which covers ASCII 32–126 and
// Latin-1 160–255. Every other code point (tab, control bytes, CJK, emoji,
// undefined WinAnsi slots) would make drawText THROW — so replace it with '?'
// (tab becomes a space). Line feeds are preserved as-is: wrapText splits on
// them AFTER sanitizing. Keeps arbitrary dropped-file content exportable.
export const sanitizeWinAnsiText = (text: string): string =>
    Array.from(text)
        .map((char) => {
            const code = char.codePointAt(0) ?? 0;
            if (char === '\t') return ' ';
            if (char === '\n') return '\n';
            if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) return char;
            return '?';
        })
        .join('');

// Hard-wraps text into body lines: split on newlines first, then chunk any
// line longer than maxChars. No word-boundary reflow — chunking at a fixed
// width keeps the mapping input→output fully deterministic. An empty string
// yields a single empty line (so its page is still generated).
export const wrapText = (text: string, maxChars: number): string[] => {
    const lines: string[] = [];
    for (const raw of sanitizeWinAnsiText(text).split('\n')) {
        if (raw.length <= maxChars) {
            lines.push(raw);
        } else {
            for (let start = 0; start < raw.length; start += maxChars) {
                lines.push(raw.slice(start, start + maxChars));
            }
        }
    }
    return lines.length ? lines : [''];
};

// Decodes a data URL (data:image/png;base64,XXXX) into raw bytes. Files with
// kind 'image'/'video' store their content as a data URL (see readTextFile.ts).
// Falls back to treating the whole string as base64 when no comma exists.
export const decodeDataUrl = (dataUrl: string): Uint8Array => {
    const base64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
};

// ─── PDF assembly ────────────────────────────────────────────────────────────

// Draws body lines from a starting baseline, using the fixed line height.
// x starts at 0 — flush with the left edge (no margin).
const drawBodyLines = (
    page: ReturnType<PDFDocument['addPage']>,
    font: Awaited<ReturnType<PDFDocument['embedFont']>>,
    lines: string[],
    startY: number,
    color = TEXT_COLOR,
) => {
    let y = startY;
    for (const line of lines) {
        page.drawText(line, { x: 0, y, size: BODY_SIZE, font, color });
        y -= LINE_HEIGHT;
    }
};

// Renders one sidebar file into the PDF document. Each file starts on a NEW
// page (first page reuses the blank page created with the document):
// - text   → wrapped Courier body, edge to edge, paginating when lines overflow
// - image  → PNG/JPEG scaled to FILL the entire page (cover: aspect ratio is
//            kept, the image is scaled so BOTH axes reach/past the page edges,
//            centered so any overflow clips evenly off both sides); other
//            image formats (svg/webp/…) get an "unsupported" note page
// - video / binary → a short note page (raw content is never dumped)
const appendFile = async (doc: PDFDocument, file: FormatterFile, bodyFont: BodyFont) => {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

    if (file.kind === 'text') {
        const lines = wrapText(file.content, MAX_CHARS_PER_LINE);
        drawBodyLines(page, bodyFont, lines.slice(0, LINES_PER_PAGE), BODY_TOP);
        // Continuation pages carry on from the top edge, full LINES_PER_PAGE
        let remaining = lines.slice(LINES_PER_PAGE);
        while (remaining.length > 0) {
            const continuation = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
            drawBodyLines(continuation, bodyFont, remaining.slice(0, LINES_PER_PAGE), BODY_TOP);
            remaining = remaining.slice(LINES_PER_PAGE);
        }
        return;
    }

    if (file.kind === 'image') {
        // Only the two formats pdf-lib can embed natively; anything else is
        // noted on the page instead of throwing mid-export
        const bytes = decodeDataUrl(file.content);
        const image =
            file.mime === 'image/png'
                ? await doc.embedPng(bytes)
                : file.mime === 'image/jpeg'
                  ? await doc.embedJpg(bytes)
                  : null;
        if (image) {
            // COVER fit: scale so the larger relative dimension exactly spans
            // the page — both axes reach (or pass) the page edges, no white
            // border anywhere. The overflowing axis is centered so the clip
            // is symmetric. Aspect ratio is always preserved.
            const scale = Math.max(PAGE_WIDTH / image.width, PAGE_HEIGHT / image.height);
            page.drawImage(image, {
                x: (PAGE_WIDTH - image.width * scale) / 2,
                y: (PAGE_HEIGHT - image.height * scale) / 2,
                width: image.width * scale,
                height: image.height * scale,
            });
            return;
        }
        drawBodyLines(
            page,
            bodyFont,
            [`${file.name}: unsupported image format (not embedded)`],
            BODY_TOP,
            MUTED_COLOR,
        );
        return;
    }

    // video and binary kinds — raw bytes are not representable in a PDF
    const note =
        file.kind === 'video'
            ? `${file.name}: video file (content not embedded in PDF)`
            : `${file.name}: binary file (content not embedded in PDF)`;
    drawBodyLines(page, bodyFont, [note], BODY_TOP, MUTED_COLOR);
};

// Cached font handle type for appendFile — embedded once per document
type BodyFont = Awaited<ReturnType<PDFDocument['embedFont']>>;

// Builds a single PDF from the sidebar files, in drop order. Always resolves
// to a document with at least one page (empty session → one note page), so
// save()/download never produce a zero-page (invalid) PDF.
export const buildFilesPdf = async (files: FormatterFile[]): Promise<PDFDocument> => {
    const doc = await PDFDocument.create();
    const bodyFont = await doc.embedFont(StandardFonts.Courier);

    if (files.length === 0) {
        // Unreachable from the UI (button is disabled with 0 files) but kept
        // as a safe default for direct callers
        const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        drawBodyLines(page, bodyFont, ['No files loaded.'], BODY_TOP, MUTED_COLOR);
        return doc;
    }

    await arrayEachAsync(files, async ({ value }) => {
        await appendFile(doc, value, bodyFont);
    });
    return doc;
};

// Builds the PDF and triggers an automatic browser download. The Blob URL is
// revoked right after the synthetic click — the download has already been
// handed to the browser by then.
export const downloadFilesPdf = async (
    files: FormatterFile[],
    fileName = 'formatter-export.pdf',
): Promise<void> => {
    const doc = await buildFilesPdf(files);
    const bytes = await doc.save();
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};
