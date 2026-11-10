import { defineConfig } from 'vite';

// Content script build: single self-contained IIFE, no module imports at
// runtime. Runs after the main build; must not wipe dist or re-copy public/.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    lib: {
      entry: 'src/content/index.ts',
      formats: ['iife'],
      name: 'gazeContent',
      fileName: () => 'content.js',
    },
  },
});
