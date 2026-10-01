import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite-plus';

export default defineConfig({
  // Client SPA (`vp dev` / `vp build`).
  root: 'src/client',
  plugins: [tailwindcss()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  // `vp dev` serves the client; API calls go to a running `mkserve`.
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/@ws': 'http://127.0.0.1:3000',
    },
  },

  // Server + CLI bundle (`vp pack`).
  pack: {
    entry: ['src/cli.ts'],
    format: ['esm'],
    platform: 'node',
    dts: false,
    outDir: 'dist',
  },

  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
  },

  // oxlint: rules follow the Google TypeScript Style Guide (docs/SPEC.md §9a).
  lint: {
    ignorePatterns: ['dist/**'],
    plugins: ['typescript', 'import', 'oxc', 'unicorn'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: 'error',
      'import/no-default-export': 'error',
      'typescript/no-explicit-any': 'error',
      'typescript/no-non-null-assertion': 'error',
      'typescript/no-namespace': 'error',
      'typescript/ban-ts-comment': 'error',
      'typescript/consistent-type-definitions': ['error', 'interface'],
      'typescript/consistent-type-imports': 'error',
      'typescript/array-type': ['error', {default: 'array-simple'}],
    },
    overrides: [
      {
        // Tool config files must default-export.
        files: ['*.config.ts'],
        rules: {'import/no-default-export': 'off'},
      },
    ],
  },

  // oxfmt: mirrors Google's `gts` Prettier settings.
  fmt: {
    // Fixtures are test inputs; keep them byte-for-byte.
    ignorePatterns: ['dist/**', 'test/fixtures/**'],
    printWidth: 80,
    semi: true,
    singleQuote: true,
    bracketSpacing: false,
    trailingComma: 'es5',
    arrowParens: 'avoid',
  },
});
