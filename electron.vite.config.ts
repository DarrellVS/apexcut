import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const alias = {
  '@core': resolve('src/core'),
  '@shared': resolve('src/shared'),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { ...alias, '@main': resolve('src/main') } },
    build: {
      rollupOptions: {
        // the analysis worker is its own entry: out/main/workers/analyze.js
        input: {
          index: resolve('src/main/index.ts'),
          'workers/analyze': resolve('src/main/workers/analyze.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
  },
  renderer: {
    resolve: { alias: { ...alias, '@renderer': resolve('src/renderer/src') } },
    plugins: [vue(), tailwindcss()],
  },
});
