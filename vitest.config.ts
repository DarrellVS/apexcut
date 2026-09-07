import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/core/**', 'src/shared/**'] },
  },
});
