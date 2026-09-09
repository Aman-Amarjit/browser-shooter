import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    host: true,
    fs: {
      // Allow Vite dev server to serve files from the root-level models/ directory at /models/*
      allow: [
        path.resolve(__dirname, '..'),  // whole project root
      ]
    }
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src')
    }
  },
  build: {
    target: 'es2022'
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  }
});

