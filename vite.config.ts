import path from 'node:path';
import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  envDir: '..',
  resolve: {
    alias: {
      '@': path.resolve('client/src'),
      '@client': path.resolve('client'),
      '@shared': path.resolve('shared'),
    },
  },
  build: { outDir: '../dist/client', emptyOutDir: true },
  server: { fs: { allow: [path.resolve('.')] } },
});
