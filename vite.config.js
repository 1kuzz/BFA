import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds the report dashboard's React source into a single classic script
// (no ESM import/export, no code-splitting) so it drops in as ui/report.js
// exactly like the vendored xlsx bundle does - no build step for extension
// users, only for whoever edits ui/src/report.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'ui',
    emptyOutDir: false,
    assetsDir: '.',
    rollupOptions: {
      input: { report: 'ui/src/report/main.jsx' },
      output: {
        format: 'iife',
        entryFileNames: 'report.js',
        assetFileNames: 'report.[ext]'
      }
    }
  }
});
