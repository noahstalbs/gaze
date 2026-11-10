import { defineConfig } from 'vite';

// Main build: side panel page, camera-grant page, background service worker.
// The content script is built separately (vite.content.config.ts) because it
// must be a single self-contained IIFE — MV3 content scripts are not modules.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    modulePreload: false,
    rollupOptions: {
      input: {
        sidepanel: 'sidepanel.html',
        grant: 'grant.html',
        background: 'src/background.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
