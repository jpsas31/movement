import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/static/',
  server: {
    proxy: {
      // Forward /api/* to the Python backend
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'static',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        debug: resolve(__dirname, 'debug.html'),
      },
    },
  },
});
