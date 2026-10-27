import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  // MUI X (charts + data grid + pickers) is large; it is a local internal tool so a single bundle is fine.
  build: { chunkSizeWarningLimit: 1600 },
});
