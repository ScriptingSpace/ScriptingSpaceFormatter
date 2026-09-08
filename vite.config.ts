import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Relative base so the built bundle works on GitHub Pages / any sub-path host
// (same convention as the sibling @scripting-space/scribble package).
export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: 'dist',
    },
});
