import { defineConfig } from 'eslint/config';
import tseslint from '@electron-toolkit/eslint-config-ts';
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier';
import eslintPluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out', 'test-results', 'playwright-report'] },
  tseslint.configs.recommended,
  eslintPluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
      },
    },
  },
  {
    files: ['**/*.{ts,mts,tsx,vue}'],
    rules: {
      'vue/require-default-prop': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': [
        'error',
        {
          script: {
            lang: 'ts',
          },
        },
      ],
    },
  },
  {
    // the renderer talks to main through `api` (@renderer/api), which copies arguments to plain data;
    // Vue reactive proxies passed straight to window.apexcut throw "An object could not be cloned"
    files: ['src/renderer/**/*.{ts,vue}'],
    ignores: ['src/renderer/src/env.d.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'window',
          property: 'apexcut',
          message:
            'Import { api } from @renderer/api instead; it makes arguments safe for the bridge.',
        },
      ],
    },
  },
  eslintConfigPrettier,
);
