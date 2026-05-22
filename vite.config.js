import { defineConfig } from 'vite';
import { resolve } from 'path';

const isProduction = process.env.NODE_ENV === 'production';

export default defineConfig({
  base: isProduction ? '/Skyhopper-Proxy/' : '/',
  // Targets that support top-level await (modern browsers / es2022+)
  esbuild: {
    target: 'es2022',
  },
  build: {
    target: 'es2022',
  },
});
