import {resolve} from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import {defineConfig} from 'vite-plus';
import type {Plugin} from 'vite-plus';
import {buildApp} from './src/server/app.ts';

/**
 * Mounts the mkserve API into the dev server, so `vp dev` alone runs the
 * whole app. Server sources are config dependencies, so editing them
 * restarts the dev server. The workspace is `$MKSERVE_ROOT`, defaulting to
 * the directory the command was run from (`$INIT_CWD` under pnpm).
 */
function mkserveApi(): Plugin {
  return {
    name: 'mkserve-api',
    apply: 'serve',
    async configureServer(server) {
      const root = resolve(
        process.env['MKSERVE_ROOT'] ?? process.env['INIT_CWD'] ?? '.'
      );
      const app = await buildApp({root, watch: true});
      await app.ready();
      server.httpServer?.once('close', () => void app.close());
      server.config.logger.info(`  mkserve workspace: ${root}`);
      server.middlewares.use((req, res, next) => {
        if (/^\/(api|@ws)\//.test(req.url ?? '')) {
          app.routing(req, res);
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  // Client SPA (`vp dev` / `vp build`).
  root: 'src/client',
  plugins: [tailwindcss(), mkserveApi()],
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
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
