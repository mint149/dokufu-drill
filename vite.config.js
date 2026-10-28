import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths: the same build is served from /, /next/ and /vX.Y.Z/ on GitHub Pages.
  base: './',
  build: {
    // Score libraries are large but loaded only when needed, each as its own chunk:
    // VexFlow with its music font (~720 kB, rhythm mode) and OpenSheetMusicDisplay (~1.4 MB, 曲 tab).
    chunkSizeWarningLimit: 1500,
  },
});
