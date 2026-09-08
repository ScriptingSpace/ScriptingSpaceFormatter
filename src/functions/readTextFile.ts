import type { FormatterFile, FormatterFileKind } from './fileStore';

// Known plain-text MIME prefixes / exact types that should be read as text.
// Anything matching text/* is text; these extras are text-delivered as
// application/* but still human-readable source files.
const TEXT_MIME_EXACT = [
    'application/json',
    'application/xml',
    'application/javascript',
    'application/typescript',
    'application/x-yaml',
    'application/toml',
    'application/x-sh',
];

// Extension fallbacks for files delivered with an empty/unknown MIME type
// (common on Windows when no registry entry exists for the extension).
const TEXT_EXTENSIONS = [
    'txt', 'md', 'markdown', 'csv', 'tsv', 'log', 'json', 'xml', 'yml', 'yaml',
    'toml', 'ini', 'cfg', 'conf', 'env', 'js', 'jsx', 'ts', 'tsx', 'css',
    'scss', 'less', 'html', 'htm', 'svg', 'sh', 'bat', 'ps1', 'py', 'rb',
    'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'sql', 'gitignore',
];

// Classify a dropped browser File into a render kind:
// - 'image'  → MIME image/* (rendered in an <img>)
// - 'video'  → MIME video/* (rendered in a <video> player)
// - 'pdf'    → application/pdf MIME or .pdf extension (rendered by the PDF
//              reader plugin, src/plugins/pdfReader)
// - 'text'   → text-like MIME/extension (rendered as text)
// - 'binary' → everything else (content NOT rendered; notice shown)
export const detectFileKind = (file: File): FormatterFileKind => {
    const mime = (file.type || '').toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    // PDFs are recognized by MIME first; the extension fallback below catches
    // files delivered with an empty/unknown MIME type (common on Windows)
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('text/') || TEXT_MIME_EXACT.includes(mime)) return 'text';
    // Unknown / empty MIME → fall back to the file extension
    const extension = file.name.includes('.')
        ? (file.name.split('.').pop() ?? '').toLowerCase()
        : '';
    if (extension === 'pdf') return 'pdf';
    if (extension && TEXT_EXTENSIONS.includes(extension)) return 'text';
    // Everything else (application/octet-stream, audio, etc.) is binary
    return 'binary';
};

// Reads a browser File into the FormatterFile session shape, choosing the
// read strategy from the detected kind:
// - image / video / pdf → FileReader.readAsDataURL (the data URL feeds
//   <img>/<video> or the PDF reader plugin, which decodes it back to bytes)
// - everything else → FileReader.readAsText; if the decoded text contains a
//   NUL byte the file is downgraded from 'text' to 'binary' (sniffing catches
//   text-mislabeled binaries like .exe, .zip, .png with missing MIME).
// Used by the dashboard's global drop handler — every dropped file lands in
// the sidebar (src/components/FileSidebar.tsx) and renders by kind when
// selected (src/dashboards/FormatterDashboard.tsx).
export const readTextFile = (file: File): Promise<FormatterFile> =>
    new Promise<FormatterFile>((resolve, reject) => {
        const kind = detectFileKind(file);
        const mime = file.type || '';
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        if (kind === 'image' || kind === 'video' || kind === 'pdf') {
            // Media: keep the data URL as content — it is the render source
            reader.onload = () =>
                resolve({ name: file.name, kind, mime, content: String(reader.result ?? '') });
            reader.readAsDataURL(file);
        } else {
            reader.onload = () => {
                const text = String(reader.result ?? '');
                resolve({
                    name: file.name,
                    // NUL byte sniff → mislabeled binary (empty MIME/extension
                    // fallbacks can wrongly classify binary files as text)
                    kind: text.includes('\u0000') ? 'binary' : 'text',
                    mime,
                    content: text,
                });
            };
            reader.readAsText(file);
        }
    });
