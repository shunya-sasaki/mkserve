import {symlinkSync} from 'node:fs';
import {join} from 'node:path';
import {describe, expect, test} from 'vite-plus/test';
import {resolveInRoot, toRelPosix} from '../src/server/safe_path.ts';
import {createWorkspace} from './helpers.ts';

describe('resolveInRoot', () => {
  test('resolves paths inside the root', () => {
    const root = createWorkspace({'docs/a.md': '# A'});
    expect(resolveInRoot(root, 'docs/a.md')).toBe(join(root, 'docs/a.md'));
    expect(resolveInRoot(root, '/docs/a.md')).toBe(join(root, 'docs/a.md'));
    expect(resolveInRoot(root, 'missing.md')).toBe(join(root, 'missing.md'));
  });

  test('rejects traversal and NUL bytes', () => {
    const root = createWorkspace({});
    expect(resolveInRoot(root, '../outside.md')).toBeUndefined();
    expect(resolveInRoot(root, '../../etc/passwd')).toBeUndefined();
    expect(resolveInRoot(root, 'docs/../../x.md')).toBeUndefined();
    expect(resolveInRoot(root, 'a\0.md')).toBeUndefined();
  });

  test('rejects symlinks that escape the root', () => {
    const outside = createWorkspace({'secret.md': 'secret'});
    const root = createWorkspace({});
    symlinkSync(join(outside, 'secret.md'), join(root, 'link.md'));
    expect(resolveInRoot(root, 'link.md')).toBeUndefined();
  });
});

test('toRelPosix returns POSIX relative paths', () => {
  expect(toRelPosix('/ws', '/ws/docs/a.md')).toBe('docs/a.md');
  expect(toRelPosix('/ws', '/ws')).toBe('');
});
