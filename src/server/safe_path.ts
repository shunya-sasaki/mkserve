import {realpathSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';

/**
 * Resolves a workspace-relative path to an absolute one, or returns
 * `undefined` when it would escape `root` (including through symlinks).
 */
export function resolveInRoot(
  root: string,
  relPath: string
): string | undefined {
  if (relPath.includes('\0')) {
    return undefined;
  }
  const abs = resolve(root, relPath.replace(/^\/+/, ''));
  if (!isInside(root, abs)) {
    return undefined;
  }
  try {
    if (!isInside(realpathSync(root), realpathSync(abs))) {
      return undefined;
    }
  } catch {
    // A missing file cannot be a symlink escape; callers report 404.
  }
  return abs;
}

/** Converts an absolute path inside `root` to a POSIX relative path. */
export function toRelPosix(root: string, abs: string): string {
  return relative(root, abs).split(sep).join('/');
}

function isInside(root: string, abs: string): boolean {
  const rel = relative(root, abs);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}
