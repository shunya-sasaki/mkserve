import {encodePath} from '../shared/paths.ts';
import type {TreeNode} from '../shared/types.ts';
import {loadSetting, saveSetting} from './storage.ts';

const EXPANDED_KEY = 'mkserve:expanded';

const CHEVRON_SVG =
  '<svg class="tree-chevron" viewBox="0 0 16 16" width="12" height="12" ' +
  'aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4z"/></svg>';

/** Sidebar file tree with collapsible folders and an active file. */
export class TreeView {
  private readonly expanded: Set<string>;
  private activePath = '';

  constructor(private readonly container: HTMLElement) {
    this.expanded = new Set(loadSetting<string[]>(EXPANDED_KEY) ?? []);
    container.addEventListener('click', event => {
      const target = event.target as Element;
      const button = target.closest<HTMLButtonElement>('button[data-dir]');
      if (button) {
        this.toggle(button);
      }
    });
  }

  /** Replaces the tree contents. */
  render(tree: TreeNode): void {
    const children = tree.children ?? [];
    if (children.length === 0) {
      this.container.innerHTML =
        '<p class="px-2 text-sm text-neutral-500">No Markdown files.</p>';
      return;
    }
    const list = this.renderList(children);
    list.setAttribute('role', 'tree');
    this.container.replaceChildren(list);
    this.setActive(this.activePath);
  }

  /** Highlights `path`, expanding and scrolling to it. */
  setActive(path: string): void {
    this.activePath = path;
    for (const el of this.container.querySelectorAll('[aria-current]')) {
      el.removeAttribute('aria-current');
    }
    const link = this.container.querySelector<HTMLElement>(
      `a[data-path="${CSS.escape(path)}"]`
    );
    if (!link) {
      return;
    }
    link.setAttribute('aria-current', 'page');
    for (
      let group = link.closest('ul');
      group && group !== this.container;
      group = group.parentElement?.closest('ul') ?? null
    ) {
      const button = group.previousElementSibling;
      if (button instanceof HTMLButtonElement && group.hidden) {
        this.toggle(button);
      }
    }
    link.scrollIntoView({block: 'nearest'});
  }

  private renderList(nodes: TreeNode[]): HTMLUListElement {
    const list = document.createElement('ul');
    for (const node of nodes) {
      const item = document.createElement('li');
      item.setAttribute('role', 'treeitem');
      if (node.type === 'dir') {
        const open = this.expanded.has(node.path);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'tree-row tree-dir';
        button.dataset.dir = node.path;
        button.setAttribute('aria-expanded', String(open));
        button.innerHTML = CHEVRON_SVG;
        button.append(node.name);
        const children = this.renderList(node.children ?? []);
        children.hidden = !open;
        item.append(button, children);
      } else {
        const link = document.createElement('a');
        link.className = 'tree-row tree-file';
        link.href = `/${encodePath(node.path)}`;
        link.dataset.path = node.path;
        link.textContent = node.name;
        link.title = node.path;
        item.append(link);
      }
      list.append(item);
    }
    return list;
  }

  private toggle(button: HTMLButtonElement): void {
    const group = button.nextElementSibling;
    const path = button.dataset.dir;
    if (!(group instanceof HTMLUListElement) || path === undefined) {
      return;
    }
    group.hidden = !group.hidden;
    button.setAttribute('aria-expanded', String(!group.hidden));
    if (group.hidden) {
      this.expanded.delete(path);
    } else {
      this.expanded.add(path);
    }
    saveSetting(EXPANDED_KEY, [...this.expanded]);
  }
}
