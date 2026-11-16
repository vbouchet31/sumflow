/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Relative base so the build works on GitHub Pages whatever the repo name.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    // `npm run bench` runs Vitest in "bench" mode to pick up bench/*.bench.ts instead.
    include: mode === 'bench' ? ['bench/**/*.bench.ts'] : ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
}));
