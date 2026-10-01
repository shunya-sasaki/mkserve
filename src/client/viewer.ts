import {encodePath} from '../shared/paths.ts';
import type {RenderResult} from '../shared/types.ts';

/** Options for {@link Viewer.show}. */
export interface ShowOptions {
  /** Keep the current scroll offset (live reload). */
  preserveScroll: boolean;
  /** Element id to scroll to after rendering. */
  hash?: string;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Renders documents into the content pane. */
export class Viewer {
  constructor(
    private readonly content: HTMLElement,
    private readonly scroller: HTMLElement
  ) {}

  /** Swaps in a rendered document and runs client-side renderers. */
  async show(doc: RenderResult, options: ShowOptions): Promise<void> {
    const scrollTop = this.scroller.scrollTop;
    this.content.innerHTML = doc.html;
    this.content.dataset.path = doc.path;

    const restore = () => {
      if (options.preserveScroll) {
        this.scroller.scrollTop = scrollTop;
      } else if (options.hash) {
        document.getElementById(options.hash)?.scrollIntoView();
      } else {
        this.scroller.scrollTop = 0;
      }
    };
    restore();
    // Diagrams change the layout height, so restore again afterwards.
    await renderMermaid(this.content);
    restore();
  }

  /** Shows a notice in place of a document. */
  showMessage(title: string, detail: string): void {
    const heading = document.createElement('h1');
    heading.textContent = title;
    const text = document.createElement('p');
    text.textContent = detail;
    this.content.replaceChildren(heading, text);
    delete this.content.dataset.path;
  }

  /** Whether the shown document references the workspace file `path`. */
  references(path: string): boolean {
    const target = `/@ws/${encodePath(path)}`;
    const elements = this.content.querySelectorAll('[src], [poster]');
    return [...elements].some(el =>
      ['src', 'poster'].some(
        attr => el.getAttribute(attr)?.split(/[?#]/)[0] === target
      )
    );
  }
}

async function renderMermaid(root: HTMLElement): Promise<void> {
  const nodes = [...root.querySelectorAll<HTMLElement>('pre.mermaid')];
  if (nodes.length === 0) {
    return;
  }
  const {default: mermaid} = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    theme: window.matchMedia(DARK_QUERY).matches ? 'dark' : 'default',
  });
  try {
    await mermaid.run({nodes, suppressErrors: true});
  } catch (err) {
    console.error('mermaid', err);
  }
}

/** Calls `callback` when the OS color scheme changes. */
export function onColorSchemeChange(callback: () => void): void {
  window.matchMedia(DARK_QUERY).addEventListener('change', callback);
}
