import {readFileSync} from 'node:fs';
import {beforeAll, describe, expect, test} from 'vite-plus/test';
import {createRenderer, rewriteUrl} from '../src/server/render.ts';
import type {Renderer} from '../src/server/render.ts';

let renderer: Renderer;

beforeAll(async () => {
  renderer = await createRenderer();
});

async function html(markdown: string, docPath = 'doc.md'): Promise<string> {
  return (await renderer.render(markdown, docPath)).html;
}

describe('render', () => {
  test('CommonMark and GFM', async () => {
    const out = await html(
      '**b** ~~s~~\n\n| a |\n| - |\n| 1 |\n\n- [x] done\n\nhttps://x.dev'
    );
    expect(out).toContain('<strong>b</strong>');
    expect(out).toContain('<del>s</del>');
    expect(out).toContain('<table>');
    expect(out).toContain('type="checkbox"');
    expect(out).toContain('href="https://x.dev"');
  });

  test('hides front matter and extracts the title', async () => {
    const result = await renderer.render(
      '---\na: 1\n---\n# Hello *you*',
      'x.md'
    );
    expect(result.html).not.toContain('a: 1');
    expect(result.title).toBe('Hello you');
    expect((await renderer.render('no heading', 'x.md')).title).toBeUndefined();
  });

  test('math is rendered by KaTeX', async () => {
    const out = await html('Inline $x^2$\n\n$$\n\\sqrt{2}\n$$');
    expect(out).toContain('class="katex"');
    expect(out).toContain('katex-display');
    expect(out).not.toContain('class="shiki');
  });

  test('mermaid blocks are passed through for the client', async () => {
    const out = await html('```mermaid\nflowchart LR\n  A --> B\n```');
    expect(out).toContain(
      '<pre class="mermaid">flowchart LR\n  A --> B\n</pre>'
    );
    expect(out).not.toContain('shiki');
  });

  test('code blocks are highlighted with dual themes', async () => {
    const out = await html('```ts\nconst a = 1;\n```');
    expect(out).toContain(
      'class="shiki shiki-themes github-light github-dark"'
    );
    expect(out).toContain('--shiki-dark');
  });

  test('unknown languages fall back to plain text', async () => {
    const out = await html('```nope-lang\nplain\n```');
    expect(out).toContain('class="shiki');
    expect(out).toContain('plain');
  });

  test('GFM alerts', async () => {
    for (const kind of ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']) {
      const out = await html(`> [!${kind}]\n> text`);
      expect(out).toContain(`markdown-alert-${kind.toLowerCase()}`);
    }
  });

  test('headings get ids and anchors', async () => {
    const out = await html('## Getting Started');
    expect(out).toContain('id="getting-started"');
    expect(out).toContain('href="#getting-started"');
  });

  test('rewrites links relative to the document', async () => {
    const out = await html(
      '[g](guide.md#usage) ![i](<img/a b.png>) [e](https://e.com)',
      'docs/page.md'
    );
    expect(out).toContain('href="/docs/guide.md#usage"');
    expect(out).toContain('src="/@ws/docs/img/a%20b.png"');
    expect(out).toMatch(
      /href="https:\/\/e.com" target="_blank" rel="noopener noreferrer"/
    );
  });

  test('renders the showcase fixture', async () => {
    const source = readFileSync(
      new URL('./fixtures/showcase/README.md', import.meta.url),
      'utf8'
    );
    const result = await renderer.render(source, 'README.md');
    expect(result.title).toBe('mkserve showcase');
    for (const marker of [
      'katex',
      'pre class="mermaid"',
      'shiki',
      'markdown-alert-caution',
      'src="/@ws/docs/images/logo.svg"',
      'href="/docs/guide.md#usage"',
      '<details>',
    ]) {
      expect(result.html).toContain(marker);
    }
  });
});

describe('rewriteUrl', () => {
  test.each([
    ['#top', 'docs', true, '#top'],
    ['../README.md', 'docs', true, '/README.md'],
    ['/docs/a.md', 'x/y', true, '/docs/a.md'],
    ['a.md?x=1#h', '', true, '/a.md?x=1#h'],
    ['file.pdf', 'docs', true, '/@ws/docs/file.pdf'],
    ['a.md', 'docs', false, '/@ws/docs/a.md'],
    ['my%20doc.md', '', true, '/my%20doc.md'],
    ['../../escape.md', 'docs', true, '../../escape.md'],
  ])('%s from %s', (url, dir, isLink, expected) => {
    expect(rewriteUrl(url, dir, isLink)).toBe(expected);
  });
});
