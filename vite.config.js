import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths: the same build is served from /, /next/ and /vX.Y.Z/ on GitHub Pages.
  base: './',
  build: {
    // VexFlow with its music font is ~720 kB; it is a separate chunk loaded only by the rhythm mode.
    chunkSizeWarningLimit: 1000,
  },
});
