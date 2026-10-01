# mkserve

![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&labelColor=gray&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-9135FF?logo=vite&labelColor=gray&logoColor=white)
![LICENSE](https://img.shields.io/github/license/shunya-sasaki/mkserve)

Serve a folder of Markdown files as a live-reloading preview site: a file tree
on the left, the rendered document on the right, refreshed every time you save.

## ⚡ Quick Start

1. Point the `@shunya-sasaki` scope at GitHub Packages by adding these lines to
   `~/.npmrc` (once; details in Setup below):

   ```ini
   @shunya-sasaki:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GH_TOKEN}
   ```

2. Install and run:

   ```sh
   pnpm add -g @shunya-sasaki/mkserve
   mkserve --open    # serve the current directory and open the browser
   ```

Open any `.md` file in your editor, save it, and the page updates in place.

## 📦 Requirements

- Node.js 20.19 or later
- A GitHub token with the `read:packages` scope (GitHub Packages requires
  authentication even for public packages)

## ⚙️ Setup

`mkserve` is published to GitHub Packages, so npm-compatible clients need to
know where the `@shunya-sasaki` scope lives. Add these lines to `~/.npmrc`:

```ini
@shunya-sasaki:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GH_TOKEN}
```

`${GH_TOKEN}` is read from your environment; you can also paste the token
directly. Then install with your preferred tool:

```sh
pnpm add -g @shunya-sasaki/mkserve              # pnpm
mise use -g npm:@shunya-sasaki/mkserve@0.1.0    # mise
pnpm dlx @shunya-sasaki/mkserve                 # run once without installing
```

## 🚀 Usage

```sh
mkserve [dir] [options]
```

| Option         | Default     | Description                                                                                                           |
| -------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| `dir`          | `.`         | Workspace root to serve                                                                                               |
| `-p`, `--port` | `3000`      | Port to listen on. Without it, the next free port is used if 3000 is taken; an explicit port that is busy is an error |
| `--host`       | `127.0.0.1` | Bind address. Only your machine can connect by default                                                                |
| `-o`, `--open` | off         | Open the browser after the server starts                                                                              |
| `--no-watch`   | watch on    | Disable hot reload                                                                                                    |
| `-h`, `--help` |             | Show help                                                                                                             |
| `--version`    |             | Show the version                                                                                                      |

### Examples

```sh
mkserve                       # serve the current directory on port 3000
mkserve docs --port 4000      # serve ./docs on port 4000
mkserve ~/notes --open        # serve another folder and open the browser
mkserve --no-watch            # static preview without hot reload
```

Stop the server with `Ctrl+C`.

### What gets rendered

- **CommonMark** and **GitHub Flavored Markdown**: tables, task lists,
  strikethrough, autolinks, footnotes, and inline HTML
- **Math** with KaTeX: `$inline$` and `$$display$$` blocks
- **Mermaid** diagrams in ` ```mermaid ` code blocks
- **Syntax highlighting** with Shiki for fenced code blocks
- **GitHub alerts**: `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`,
  `[!CAUTION]`
- YAML front matter is hidden

### In the browser

- `/` opens the root `README.md`, or the first file in the tree if there is no
  README.
- Each document has its own URL (e.g. `http://127.0.0.1:3000/docs/guide.md`),
  so links, bookmarks, and the back button work.
- Relative links between Markdown files open inside the viewer; relative
  images and other files are served from the workspace.
- The file tree lists only `.md` / `.markdown` files. Files matched by
  `.gitignore`, hidden files, and `node_modules` are left out.
- On save, the page re-renders and keeps your scroll position. Adding,
  removing, or renaming files updates the tree. The dot in the top-right corner
  is green while hot reload is connected.
- `☰` collapses the sidebar (or opens it as a drawer on narrow screens); drag
  the sidebar edge to resize it.
- Light and dark themes follow your system setting.

## 📚 Reference

## 📄 License

MIT

See [LICENSE](./LICENSE) for the details.
