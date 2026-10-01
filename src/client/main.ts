import './style.css';
import {decodePath, encodePath} from '../shared/paths.ts';
import {findDefaultDocument} from '../shared/tree_utils.ts';
import {isMarkdownPath} from '../shared/types.ts';
import type {TreeNode} from '../shared/types.ts';
import {fetchDocument, fetchInfo, fetchTree, HttpError} from './api.ts';
import {connectLive} from './live.ts';
import {initSidebar} from './sidebar.ts';
import {TreeView} from './tree.ts';
import {onColorSchemeChange, Viewer} from './viewer.ts';

/** Options for {@link App.load}. */
interface LoadOptions {
  preserveScroll: boolean;
  /** The document is being reloaded because it changed on disk. */
  live: boolean;
}

/** Client application: routing, tree, document view, and live reload. */
class App {
  private readonly treeView: TreeView;
  private readonly viewer: Viewer;
  private tree: TreeNode | undefined;
  private workspaceName = 'mkserve';
  private currentPath = '';
  private loadSeq = 0;

  constructor() {
    this.treeView = new TreeView(requireElement('tree'));
    this.viewer = new Viewer(requireElement('content'), requireElement('main'));
  }

  async start(): Promise<void> {
    initSidebar();
    document.addEventListener('click', event => this.onClick(event));
    window.addEventListener('popstate', () => void this.route());
    onColorSchemeChange(() => void this.reload());

    const info = await fetchInfo();
    this.workspaceName = info.name;
    requireElement('workspace-name').textContent = info.name;
    await this.refreshTree();
    await this.route();
    if (info.watch) {
      this.startLive();
    }
  }

  private startLive(): void {
    const status = requireElement('live-status');
    connectLive({
      onChange: path => {
        if (path === this.currentPath) {
          void this.reload();
        }
      },
      onAsset: path => {
        if (this.viewer.references(path)) {
          void this.reload();
        }
      },
      onTree: () => void this.refreshTree(),
      onReconnect: () => {
        void this.refreshTree();
        void this.reload();
      },
      onStatus: connected => {
        status.dataset.connected = String(connected);
        status.title = connected ? 'Live reload connected' : 'Reconnecting…';
      },
    });
  }

  private async refreshTree(): Promise<void> {
    this.tree = await fetchTree();
    this.treeView.render(this.tree);
  }

  /** Shows the document named by the current URL. */
  private async route(): Promise<void> {
    let path = decodePath(location.pathname.slice(1));
    if (path === '') {
      const fallback = this.tree && findDefaultDocument(this.tree);
      if (fallback === undefined) {
        this.viewer.showMessage(
          'No Markdown files',
          'Add a .md file to this workspace and it will appear here.'
        );
        return;
      }
      path = fallback;
      history.replaceState(null, '', `/${encodePath(path)}${location.hash}`);
    }
    await this.load(path, {preserveScroll: false, live: false});
  }

  private reload(): Promise<void> {
    if (this.currentPath === '') {
      return Promise.resolve();
    }
    return this.load(this.currentPath, {preserveScroll: true, live: true});
  }

  private async load(path: string, options: LoadOptions): Promise<void> {
    const seq = ++this.loadSeq;
    this.currentPath = path;
    this.treeView.setActive(path);
    this.renderBreadcrumb(path);
    try {
      const doc = await fetchDocument(path);
      if (seq !== this.loadSeq) {
        return;
      }
      document.title = `${doc.title} · ${this.workspaceName}`;
      await this.viewer.show(doc, {
        preserveScroll: options.preserveScroll,
        hash: decodePath(location.hash.slice(1)) || undefined,
      });
    } catch (err) {
      if (seq !== this.loadSeq) {
        return;
      }
      if (err instanceof HttpError && err.status === 404) {
        this.viewer.showMessage(
          options.live ? 'File removed' : 'Not found',
          `${path} does not exist in this workspace.`
        );
      } else {
        this.viewer.showMessage('Failed to load', String(err));
      }
    }
  }

  private renderBreadcrumb(path: string): void {
    const crumbs = path.split('/').map(segment => {
      const span = document.createElement('span');
      span.textContent = segment;
      return span;
    });
    requireElement('breadcrumb').replaceChildren(...crumbs);
  }

  /** Turns same-origin Markdown links into client-side navigation. */
  private onClick(event: MouseEvent): void {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    const link = (event.target as Element).closest('a');
    if (!link || link.target === '_blank' || link.hasAttribute('download')) {
      return;
    }
    const url = new URL(link.href, location.href);
    if (
      url.origin !== location.origin ||
      url.pathname.startsWith('/@ws/') ||
      !isMarkdownPath(url.pathname)
    ) {
      return;
    }
    event.preventDefault();
    if (url.pathname === location.pathname) {
      if (url.hash !== location.hash) {
        location.hash = url.hash;
      }
      return;
    }
    history.pushState(null, '', url);
    void this.route();
  }
}

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing #${id}`);
  }
  return el;
}

void new App().start();
