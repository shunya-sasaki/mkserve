# mkserve — Specification

## 1. Overview

`mkserve` is a Node.js CLI that starts a local web server rendering the Markdown files in a workspace (default: cwd) with a file tree sidebar and live reload.

## 2. CLI (citty)

```
mkserve [dir] [--port <n>] [--host <h>] [--open] [--no-watch]
```

| Option                 | Alias | Default     | Description                                                                                           |
| ---------------------- | ----- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `dir` (positional)     | –     | `.`         | Workspace root                                                                                        |
| `--port`               | `-p`  | `3000`      | Port. If omitted and 3000 is busy, try next free port; if explicitly given and busy → exit with error |
| `--host`               | –     | `127.0.0.1` | Bind address (localhost-only by default)                                                              |
| `--open`               | `-o`  | `false`     | Open browser after start                                                                              |
| `--watch`              | –     | `true`      | `--no-watch` disables hot reload                                                                      |
| `--version` / `--help` |       |             | citty built-ins                                                                                       |

On start, print `mkserve vX → http://127.0.0.1:3000 (root: /abs/path)`. Ctrl+C closes watcher and server gracefully.

## 3. Architecture

- **Server (Fastify)** renders Markdown → HTML (unified + Shiki + KaTeX) and serves a small SPA.
- **Client (Vanilla TS + Tailwind)** shows tree + content, handles routing via History API, renders Mermaid in the browser (Mermaid needs a DOM), and listens to an SSE stream for reloads.
- **Watcher (chokidar)** pushes change events to the client via **Server-Sent Events** (one-way, no extra dependency, auto-reconnect built into `EventSource`).

## 4. HTTP API

| Route                                        | Response                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /` and `GET /*.md` (non-API, non-asset) | SPA `index.html` (client resolves path from URL)                                                                                                                                                                                                 |
| `GET /api/info`                              | `{ name, version, watch }` (workspace name for the header; client opens the SSE stream only when `watch` is true)                                                                                                                                |
| `GET /api/tree`                              | JSON tree: `{ name, path, type: "dir"\|"file", children? }`; dirs first, then files, alphabetical (case-insensitive)                                                                                                                             |
| `GET /api/render?path=<rel>`                 | `{ path, html, title, mtime }`; 404 if missing, 400 if not markdown                                                                                                                                                                              |
| `GET /api/events`                            | SSE stream: `change {path}` (Markdown edited/added/removed), `tree {}` (structure or `.gitignore` changed), `asset {path}` (other file, e.g. image, changed → client reloads if the doc references it), `ping` every 30 s; 404 with `--no-watch` |
| `GET /@ws/<rel>`                             | Raw workspace file (images etc. referenced from Markdown)                                                                                                                                                                                        |
| `GET /assets/*`                              | Built client bundle (`@fastify/static`)                                                                                                                                                                                                          |

**Security:** all paths resolved with `path.resolve(root, rel)` and rejected unless inside `root` (also after `realpath` for symlinks); gitignored/hidden paths not served via `/api/render`.

## 5. Markdown rendering (unified pipeline)

`remark-parse` → `remark-frontmatter` (strip YAML) → `remark-gfm` (tables, task lists, strikethrough, autolinks, footnotes) → `remark-math` → `remark-github-blockquote-alert` → `remark-rehype` (`allowDangerousHtml`) → `rehype-raw` → `rehype-slug` → `rehype-autolink-headings` → custom `rehype-mermaid-passthrough` → `@shikijs/rehype` → `rehype-katex` → custom `rehype-rewrite-urls` → `rehype-stringify`.

| Feature     | Behavior                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| CommonMark  | Full spec via remark-parse                                                                                                                           |
| Math        | `$inline$`, `$$block$$` rendered server-side by KaTeX; KaTeX CSS/fonts bundled into client                                                           |
| Mermaid     | ` ```mermaid ` blocks emitted as `<pre class="mermaid">` (skipped by Shiki); client lazy-imports `mermaid` only if present, theme follows light/dark |
| Code blocks | Shiki, dual themes `github-light` / `github-dark` via CSS variables; unknown language → plaintext                                                    |
| GFM alerts  | `> [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]` with icons + colored borders                                                           |
| Links       | Relative `.md` links → SPA navigation; relative images/files → `/@ws/<resolved path>`; external links open in a new tab                              |
| Title       | First `h1`, else filename                                                                                                                            |

Shiki highlighter is created once at startup (singleton) with a preloaded common language set; other languages load lazily.

## 6. File tree

- Lists `.md` / `.markdown` files and directories that (recursively) contain them; empty dirs hidden.
- Always ignores `.git`, `node_modules`; respects root `.gitignore` (and nested `.gitignore`s) via the `ignore` package.
- Built once at start, rebuilt on `tree` events.
- UI: collapsible folders, active file highlighted, ancestors of active file auto-expanded, expand state remembered in `localStorage`, sidebar resizable/collapsible, narrow screens → toggle drawer.
- Default document on `/`: `README.md` at root if present, else first file in the tree, else empty-state message.

## 7. Hot reload

- chokidar watches `root` with the same ignore rules, `ignoreInitial: true`, `awaitWriteFinish` (~100 ms) to avoid partial reads from editors.
- Events debounced per path (~50 ms) and broadcast to all SSE clients.
- Client: on `change` for current path → refetch `/api/render`, swap content, re-run Mermaid, **preserve scroll position**; on `tree` → refetch tree; if current file deleted → show “file removed” notice.
- `EventSource` auto-reconnects; on reconnect client refetches tree + current doc.

## 8. UI / Styling

- Tailwind CSS v4 + `@tailwindcss/typography` (`prose` / `dark:prose-invert`) for the article.
- Layout: sticky header (workspace name, path breadcrumb), left sidebar tree, centered content (max-w ~ 860px), optional right-side heading TOC (nice-to-have).
- Dark mode follows `prefers-color-scheme`; Shiki, Mermaid, alerts all switch accordingly.

## 9. Project layout & tooling

```
package.json            # "name": "@shunya-sasaki/mkserve", "bin": { "mkserve": "./dist/cli.mjs" }, "files": ["dist"], "type": "module", "license": "MIT", "packageManager": "pnpm@<ver>"
LICENSE                 # MIT
pnpm-lock.yaml
.github/workflows/publish.yml # build + publish on tag (see §13)
vite.config.ts          # all vp config: client build (src/client → dist/client), pack (CLI), test, lint (oxlint), fmt (oxfmt)
src/cli.ts              # citty command → startServer()
src/server/app.ts       # Fastify instance, routes, static
src/server/render.ts    # unified pipeline + Shiki singleton
src/server/tree.ts      # tree builder + gitignore filter
src/server/watcher.ts   # chokidar → event bus
src/server/sse.ts       # SSE client registry/broadcast
src/server/safe_path.ts # safe path resolution
src/client/index.html
src/client/main.ts      # router, bootstrap
src/client/tree.ts      # sidebar rendering
src/client/viewer.ts    # content swap, mermaid, scroll restore
src/client/live.ts      # EventSource handling
src/client/style.css    # Tailwind entry + alert/katex styles
test/fixtures/…         # sample workspace covering every feature
```

- **Package manager: pnpm.** Only `pnpm-lock.yaml` is committed; `packageManager` is pinned in `package.json` (Corepack). Distribution is described in §13.
- **Vite+ (`vp`)**: `vp dev` (client dev), `vp build` (client bundle), `vp pack` (bundle server/CLI with tsdown), `vp test` (Vitest).
- **Formatter: oxfmt.** **Linter: oxlint.** Configured in the `fmt` / `lint` blocks of `vite.config.ts` (rules in 9a) — Vite+ recommends this over separate rc files; run through `vp fmt` / `vp lint` / `vp check`, which wrap them. Do not install oxlint/oxfmt/vitest directly.
- `vite` is a devDependency aliased to `npm:@voidzero-dev/vite-plus-core` (same version as `vite-plus`), and `pnpm.overrides` pins `vite@*` / `vitest@*` to the versions bundled with `vite-plus`; bump them together when upgrading.
- `package.json` scripts (run with `pnpm <script>`): `dev`, `build` (client + `vp pack`), `test`, `lint`, `fmt`, `fmt:check`, `typecheck` (`tsc --noEmit`).
- Node ≥ 20.19, ESM only.

## 9a. Code style — Google TypeScript Style Guide

All source follows the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html). Key rules applied in this repo:

- **Files:** lowercase with underscores (e.g. `safe_path.ts`); ES modules only, no `namespace`.
- **Exports:** named exports only — **no `default` exports**.
- **Naming:** `UpperCamelCase` for classes/interfaces/types/enums; `lowerCamelCase` for functions/variables/methods; `CONSTANT_CASE` for module-level constants; no `I` prefix on interfaces, no `_` prefixes/suffixes.
- **Functions:** `function` declarations for named top-level functions; arrow functions for callbacks and inline closures.
- **Types:** `interface` for object shapes (over `type` aliases); no `any` (use `unknown` + narrowing); avoid non-null `!` assertions and `@ts-ignore`; optional fields (`x?:`) over `| undefined`; `T[]` for simple types, `Array<…>` for complex ones; `import type` for type-only imports.
- **Classes:** TS `private`/`readonly` modifiers instead of `#private`; parameter properties allowed.
- **Statements:** `const` by default, `let` when reassigned, never `var`; `===`/`!==` only; `for…of` over `forEach` where practical; throw only `Error` instances.
- **Docs:** JSDoc (`/** … */`) on every exported symbol; `//` for implementation comments.
- **Formatting:** 2-space indent, single quotes, semicolons, 80-column limit — enforced by oxfmt (`fmt` in `vite.config.ts`) configured to match Google's `gts` Prettier settings (`singleQuote: true`, `bracketSpacing: false`, `trailingComma: 'es5'`, `arrowParens: 'avoid'`).
- **Linting:** oxlint (`lint` in `vite.config.ts`, type-aware) with rules mirroring `gts` (`no-var`, `prefer-const`, `eqeqeq`, `no-explicit-any`, `no-non-null-assertion`, `no-namespace`, `ban-ts-comment`, `consistent-type-definitions: interface`, `consistent-type-imports`, `array-type: array-simple`, `import/no-default-export`); `tsconfig` with `strict: true`, `noImplicitReturns`, `noFallthroughCasesInSwitch`.
- Exception: config files that tools require to default-export (`vite.config.ts`) are exempt from the no-default-export rule.

## 10. Recommended additional dependencies

| Package                                                                       | Why                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `@fastify/static`                                                             | Serve client bundle + workspace assets            |
| `ignore`                                                                      | `.gitignore` parsing for tree + watcher           |
| `open`                                                                        | `--open` flag                                     |
| `get-port`                                                                    | Fallback port when default is busy                |
| `consola`                                                                     | Pretty logging (same unjs family as citty)        |
| `remark-frontmatter`, `rehype-slug`, `rehype-autolink-headings`, `rehype-raw` | Front matter hiding, heading anchors, inline HTML |
| `@tailwindcss/typography`                                                     | Good default Markdown typography                  |

## 11. Non-goals (v1)

Editing in browser, full-text search, non-Markdown file preview, auth/remote exposure, MDX, PDF export.

## 12. Acceptance criteria

- `mkserve` in a folder serves it at `http://127.0.0.1:3000`; `--port 4000` works; explicit busy port errors clearly.
- Fixture doc renders CommonMark, GFM tables/tasks, KaTeX inline + block, Mermaid flowchart, all 5 alert types, Shiki-highlighted TS/bash.
- Saving a file updates the open page within ~300 ms without full page reload, keeping scroll position.
- Creating/deleting a `.md` file updates the tree; gitignored files never appear.
- `GET /api/render?path=../../etc/passwd` returns 400/404.

## 13. Distribution

Published as an npm package to an npm-compatible package registry: **GitHub Packages** (primary) and/or a **Gitea** package registry.

### Package

- Name: `@shunya-sasaki/mkserve`. Both registries require a scope; on GitHub it must match the repo owner. The command stays `mkserve`.
- `"files": ["dist"]`: ships only the bundled CLI/server (`dist/cli.mjs` + chunks) and the built client (`dist/client/`). `README.md` and `LICENSE` are included automatically.
- Runtime libraries (fastify, chokidar, unified plugins, shiki, katex, …) stay in `dependencies`. Client-only libraries (mermaid, tailwind) are bundled into `dist/client` and go in `devDependencies`.
- `"engines": { "node": ">=20" }`, `"repository"`, `"license": "MIT"`.
- `"scripts": { "prepublishOnly": "pnpm run build && pnpm test" }`.
- Pre-release check: `pnpm pack`, then install the tarball into a temp dir and run `mkserve --help`.

### Registries

| Registry        | Registry URL                                           | Auth token                                                                          |
| --------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| GitHub Packages | `https://npm.pkg.github.com`                           | PAT (classic) with `write:packages` / `read:packages`, or `GITHUB_TOKEN` in Actions |
| Gitea           | `https://<gitea-host>/api/packages/shunya-sasaki/npm/` | Gitea access token with `write:package` scope                                       |

- `publishConfig.registry` in `package.json` points at the GitHub registry by default. For Gitea, publish with `pnpm publish --registry <gitea-url>`.
- Tokens are never committed. A project `.npmrc` may contain only the scope mapping with `${NODE_AUTH_TOKEN}` interpolation:
  ```ini
  @shunya-sasaki:registry=https://npm.pkg.github.com
  //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
  ```

### Release flow

1. Bump the version (`pnpm version patch|minor|major`), which creates tag `vX.Y.Z`.
2. Push the tag. `.github/workflows/publish.yml` runs: checkout → `pnpm/action-setup` → `actions/setup-node` (registry `https://npm.pkg.github.com`, scope `@shunya-sasaki`) → `pnpm install --frozen-lockfile` → `pnpm lint && pnpm typecheck && pnpm test` → `pnpm publish --no-git-checks` with `NODE_AUTH_TOKEN=${{ secrets.GITHUB_TOKEN }}` and `permissions: packages: write`.
3. For Gitea, an equivalent Gitea Actions workflow (`.gitea/workflows/publish.yml`) or a manual `pnpm publish --registry …` with a Gitea token.

### Installing (users)

```sh
# ~/.npmrc (once)
@shunya-sasaki:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<token with read:packages>

pnpm add -g @shunya-sasaki/mkserve   # then: mkserve
pnpm dlx @shunya-sasaki/mkserve      # one-off
```

> [!NOTE]
> GitHub Packages' npm registry requires authentication **even for public packages**. Gitea allows anonymous installs from public owners. If installs without a token matter, publishing to npmjs.com later works with no code changes (only `publishConfig`).
