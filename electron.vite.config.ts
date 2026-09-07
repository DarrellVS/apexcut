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
