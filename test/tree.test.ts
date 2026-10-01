import {expect, test} from 'vite-plus/test';
import {findDefaultDocument} from '../src/shared/tree_utils.ts';
import type {TreeNode} from '../src/shared/types.ts';
import {buildTree} from '../src/server/tree.ts';
import {WorkspaceIgnore} from '../src/server/workspace_ignore.ts';
import {createWorkspace} from './helpers.ts';

function paths(node: TreeNode): string[] {
  return (node.children ?? []).flatMap(child => [child.path, ...paths(child)]);
}

test('lists Markdown files, dirs first, case-insensitive order', async () => {
  const root = createWorkspace({
    'b.md': '',
    'A.md': '',
    'z/inner.markdown': '',
    'image.png': '',
  });
  const tree = await buildTree(root, new WorkspaceIgnore(root));
  expect(paths(tree)).toEqual(['z', 'z/inner.markdown', 'A.md', 'b.md']);
  expect(tree.children?.[0]).toMatchObject({name: 'z', type: 'dir'});
});

test('prunes directories without Markdown files', async () => {
  const root = createWorkspace({'a.md': '', 'assets/logo.svg': '<svg/>'});
  const tree = await buildTree(root, new WorkspaceIgnore(root));
  expect(paths(tree)).toEqual(['a.md']);
});

test('skips .gitignore matches, hidden entries, and node_modules', async () => {
  const root = createWorkspace({
    '.gitignore': 'build/\nsecret.md\n',
    'keep.md': '',
    'secret.md': '',
    'build/out.md': '',
    'node_modules/pkg/README.md': '',
    '.github/CONTRIBUTING.md': '',
    'sub/.gitignore': '*.draft.md\n',
    'sub/post.md': '',
    'sub/post.draft.md': '',
  });
  const tree = await buildTree(root, new WorkspaceIgnore(root));
  expect(paths(tree)).toEqual(['sub', 'sub/post.md', 'keep.md']);
});

test('findDefaultDocument prefers the root README', async () => {
  const root = createWorkspace({'a/first.md': '', 'readme.md': ''});
  const tree = await buildTree(root, new WorkspaceIgnore(root));
  expect(findDefaultDocument(tree)).toBe('readme.md');
});

test('findDefaultDocument falls back to the first file', async () => {
  const root = createWorkspace({'b.md': '', 'a/first.md': ''});
  const tree = await buildTree(root, new WorkspaceIgnore(root));
  expect(findDefaultDocument(tree)).toBe('a/first.md');
  expect(findDefaultDocument({name: 'x', path: '', type: 'dir'})).toBe(
    undefined
  );
});
