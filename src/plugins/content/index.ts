// Content renderers — one plugin per file kind. Each hooks renderFile and
// contributes its view only for its own kind; the dashboard decides between
// direct render (one contributor) and tabs (two or more contributors).
export * from './TextPlugin';
export * from './ImagePlugin';
export * from './VideoPlugin';
export * from './BinaryPlugin';
