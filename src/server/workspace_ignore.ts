import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import ignore from 'ignore';
import type {Ignore} from 'ignore';

/** Directory names that are never part of the workspace view. */
const ALWAYS_IGNORED = new Set(['.git', 'node_modules']);

/**
 * Decides whether workspace paths are hidden, honoring `.gitignore` files at
 * every directory level. Rules are loaded lazily and cached until
 * {@link WorkspaceIgnore.invalidate} is called.
 */
export class WorkspaceIgnore {
  private readonly rules = new Map<string, Ignore | null>();

  constructor(private readonly root: string) {}

  /** Drops cached rules, e.g. after a `.gitignore` changed. */
  invalidate(): void {
    this.rules.clear();
  }

  /**
   * Returns whether the POSIX relative path is hidden: a dot-entry, an
   * always-ignored directory, or matched by a `.gitignore` (or inside a
   * directory that is).
   */
  isIgnored(relPath: string, isDir: boolean): boolean {
    const segments = relPath.split('/').filter(s => s !== '' && s !== '.');
    for (let i = 0; i < segments.length; i++) {
      const name = segments[i];
      if (name.startsWith('.') || ALWAYS_IGNORED.has(name)) {
        return true;
      }
      const entryIsDir = i < segments.length - 1 || isDir;
      if (this.matchesGitignore(segments, i, entryIsDir)) {
        return true;
      }
    }
    return false;
  }

  /** Checks segments[0..=index] against every ancestor `.gitignore`. */
  private matchesGitignore(
    segments: string[],
    index: number,
    isDir: boolean
  ): boolean {
    for (let base = 0; base <= index; base++) {
      const rules = this.load(segments.slice(0, base).join('/'));
      if (!rules) {
        continue;
      }
      const sub = segments.slice(base, index + 1).join('/');
      if (rules.ignores(isDir ? `${sub}/` : sub)) {
        return true;
      }
    }
    return false;
  }

  private load(dir: string): Ignore | null {
    const cached = this.rules.get(dir);
    if (cached !== undefined) {
      return cached;
    }
    let rules: Ignore | null = null;
    try {
      const text = readFileSync(join(this.root, dir, '.gitignore'), 'utf8');
      rules = ignore().add(text);
    } catch {
      // No .gitignore in this directory.
    }
    this.rules.set(dir, rules);
    return rules;
  }
}
