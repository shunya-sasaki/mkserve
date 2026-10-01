import {readdir, stat} from 'node:fs/promises';
import {basename, join} from 'node:path';
import {isMarkdownPath} from '../shared/types.ts';
import type {TreeNode} from '../shared/types.ts';
import type {WorkspaceIgnore} from './workspace_ignore.ts';

/**
 * Builds the Markdown-only tree of `root`. Directories without Markdown
 * files (recursively) are pruned; ignored and hidden entries are skipped.
 */
export async function buildTree(
  root: string,
  ignore: WorkspaceIgnore
): Promise<TreeNode> {
  const children = await readDir(root, '', ignore);
  return {name: basename(root), path: '', type: 'dir', children};
}

async function readDir(
  root: string,
  relDir: string,
  ignore: WorkspaceIgnore
): Promise<TreeNode[]> {
  let entries;
  try {
    entries = await readdir(join(root, relDir), {withFileTypes: true});
  } catch {
    return [];
  }

  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    const path = relDir === '' ? entry.name : `${relDir}/${entry.name}`;
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      // Follow file symlinks only; directory symlinks may form cycles.
      const target = await stat(join(root, path)).catch(() => undefined);
      isDir = false;
      isFile = target?.isFile() ?? false;
    }
    if ((!isDir && !isFile) || ignore.isIgnored(path, isDir)) {
      continue;
    }
    if (isDir) {
      const children = await readDir(root, path, ignore);
      if (children.length > 0) {
        nodes.push({name: entry.name, path, type: 'dir', children});
      }
    } else if (isMarkdownPath(entry.name)) {
      nodes.push({name: entry.name, path, type: 'file'});
    }
  }
  return nodes.sort(compareNodes);
}

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.type !== b.type) {
    return a.type === 'dir' ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
}
