import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/Skyhopper-Proxy/',
  // Targets that support top-level await (modern browsers / es2022+)
  esbuild: {
    target: 'es2022',
  },
  build: {
    target: 'es2022',
  },
});
