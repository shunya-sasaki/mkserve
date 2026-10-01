import type {TreeNode} from './types.ts';

/** Returns the document to show at `/`: root README, else the first file. */
export function findDefaultDocument(tree: TreeNode): string | undefined {
  const readme = tree.children?.find(
    n => n.type === 'file' && /^readme\.(md|markdown)$/i.test(n.name)
  );
  return readme?.path ?? findFirstFile(tree);
}

function findFirstFile(node: TreeNode): string | undefined {
  for (const child of node.children ?? []) {
    const found = child.type === 'file' ? child.path : findFirstFile(child);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}
