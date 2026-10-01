import {posix} from 'node:path';
import rehypeShikiFromHighlighter from '@shikijs/rehype/core';
import type {Element, Root} from 'hast';
import {toString} from 'hast-util-to-string';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import type {Options as AutolinkOptions} from 'rehype-autolink-headings';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import {remarkAlert} from 'remark-github-blockquote-alert';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import {createHighlighter} from 'shiki';
import {unified} from 'unified';
import {visit} from 'unist-util-visit';
import type {VFile} from 'vfile';
import {encodePath} from '../shared/paths.ts';
import {isMarkdownPath} from '../shared/types.ts';

declare module 'vfile' {
  interface DataMap {
    /** Workspace-relative POSIX path of the document being rendered. */
    docPath: string;
    /** Text of the first `h1`, if any. */
    title: string;
  }
}

/** Output of {@link Renderer.render}. */
export interface RenderedDocument {
  html: string;
  /** First `h1` text, or `undefined` when the document has none. */
  title?: string;
}

/** Converts Markdown documents to HTML. */
export interface Renderer {
  render(markdown: string, docPath: string): Promise<RenderedDocument>;
}

/** Languages loaded up front; others are loaded on first use. */
const PRELOADED_LANGUAGES = [
  'bash',
  'css',
  'diff',
  'html',
  'javascript',
  'json',
  'jsx',
  'markdown',
  'python',
  'shell',
  'sql',
  'toml',
  'tsx',
  'typescript',
  'yaml',
];

const THEMES = {light: 'github-light', dark: 'github-dark'} as const;

const AUTOLINK_OPTIONS: AutolinkOptions = {
  behavior: 'append',
  properties: {className: ['heading-anchor'], ariaHidden: 'true'},
  content: {type: 'text', value: '#'},
};

/** Elements whose URL attributes point at workspace files. */
const URL_ATTRIBUTES: Record<string, string[]> = {
  a: ['href'],
  img: ['src'],
  source: ['src'],
  video: ['src', 'poster'],
  audio: ['src'],
};

/**
 * Creates the unified pipeline (CommonMark + GFM, math, alerts, Mermaid,
 * Shiki). The Shiki highlighter is created once and shared by all renders.
 */
export async function createRenderer(): Promise<Renderer> {
  const highlighter = await createHighlighter({
    themes: Object.values(THEMES),
    langs: PRELOADED_LANGUAGES,
  });

  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkAlert)
    .use(remarkRehype, {allowDangerousHtml: true})
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, AUTOLINK_OPTIONS)
    .use(rehypeKatex, {strict: 'ignore'})
    .use(rehypeMermaid)
    .use(rehypeShikiFromHighlighter, highlighter, {
      themes: THEMES,
      lazy: true,
      fallbackLanguage: 'text',
    })
    .use(rehypeRewriteUrls)
    .use(rehypeExtractTitle)
    .use(rehypeStringify);

  return {
    async render(markdown, docPath) {
      const file = await processor.process({value: markdown, data: {docPath}});
      return {html: String(file), title: file.data.title};
    },
  };
}

/**
 * Turns ```` ```mermaid ```` code blocks into `<pre class="mermaid">` so the
 * client can render them (and Shiki leaves them alone).
 */
function rehypeMermaid() {
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      const code = node.children[0];
      if (
        node.tagName === 'pre' &&
        code?.type === 'element' &&
        code.tagName === 'code' &&
        classNames(code).includes('language-mermaid')
      ) {
        node.properties = {className: ['mermaid']};
        node.children = [{type: 'text', value: toString(code)}];
      }
    });
  };
}

/**
 * Rewrites relative links: Markdown links become SPA routes, other files are
 * served through `/@ws/`, and external links open in a new tab.
 */
function rehypeRewriteUrls() {
  return (tree: Root, file: VFile) => {
    const docDir = posix.dirname(file.data.docPath ?? '');
    visit(tree, 'element', (node: Element) => {
      for (const attr of URL_ATTRIBUTES[node.tagName] ?? []) {
        const value = node.properties[attr];
        if (typeof value !== 'string') {
          continue;
        }
        if (isExternal(value)) {
          if (node.tagName === 'a') {
            node.properties.target = '_blank';
            node.properties.rel = ['noopener', 'noreferrer'];
          }
          continue;
        }
        node.properties[attr] = rewriteUrl(value, docDir, node.tagName === 'a');
      }
    });
  };
}

function rehypeExtractTitle() {
  return (tree: Root, file: VFile) => {
    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'h1' && file.data.title === undefined) {
        // Drop the trailing autolink '#'.
        file.data.title = toString(node).replace(/#$/, '').trim();
      }
    });
  };
}

function isExternal(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//');
}

/** Exported for tests. */
export function rewriteUrl(
  url: string,
  docDir: string,
  isLink: boolean
): string {
  if (url === '' || url.startsWith('#')) {
    return url;
  }
  const cut = url.search(/[?#]/);
  const pathPart = cut === -1 ? url : url.slice(0, cut);
  const suffix = cut === -1 ? '' : url.slice(cut);

  let decoded: string;
  try {
    decoded = decodeURI(pathPart);
  } catch {
    return url;
  }
  const resolved = decoded.startsWith('/')
    ? posix.normalize(decoded.slice(1))
    : posix.join(docDir, decoded);
  if (resolved.startsWith('..')) {
    return url;
  }
  const prefix = isLink && isMarkdownPath(resolved) ? '/' : '/@ws/';
  return prefix + encodePath(resolved) + suffix;
}

function classNames(node: Element): string[] {
  const value = node.properties.className;
  return Array.isArray(value) ? value.map(String) : [];
}
