import {basename, posix} from 'node:path';
import {watch} from 'chokidar';
import type {FSWatcher} from 'chokidar';
import {isMarkdownPath} from '../shared/types.ts';
import {toRelPosix} from './safe_path.ts';
import type {EventHub} from './sse.ts';
import type {WorkspaceIgnore} from './workspace_ignore.ts';

const DEBOUNCE_MS = 50;

/** Options for {@link startWatcher}. */
export interface WatcherOptions {
  root: string;
  ignore: WorkspaceIgnore;
  hub: EventHub;
  /** Called before a `tree` event is broadcast (e.g. to drop caches). */
  onTreeChange: () => void;
}

/**
 * Watches the workspace and broadcasts `change` (Markdown edited, added, or
 * removed), `tree` (structure changed), and `asset` (other file edited).
 */
export function startWatcher(options: WatcherOptions): FSWatcher {
  const {root, ignore, hub} = options;
  const timers = new Map<string, NodeJS.Timeout>();

  function debounced(key: string, fn: () => void): void {
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn();
      }, DEBOUNCE_MS)
    );
  }

  function treeChanged(): void {
    debounced('\0tree', () => {
      options.onTreeChange();
      hub.broadcast('tree', {});
    });
  }

  const watcher = watch(root, {
    ignoreInitial: true,
    awaitWriteFinish: {stabilityThreshold: 100, pollInterval: 20},
    ignored: (absPath, stats) => {
      const rel = toRelPosix(root, absPath);
      if (rel === '') {
        return false;
      }
      if (basename(rel) === '.gitignore') {
        const dir = posix.dirname(rel);
        return dir !== '.' && ignore.isIgnored(dir, true);
      }
      return ignore.isIgnored(rel, stats?.isDirectory() ?? false);
    },
  });

  watcher.on('all', (event, absPath) => {
    const path = toRelPosix(root, absPath);
    if (basename(path) === '.gitignore') {
      ignore.invalidate();
      treeChanged();
      return;
    }
    if (event === 'addDir' || event === 'unlinkDir') {
      treeChanged();
      return;
    }
    if (!isMarkdownPath(path)) {
      debounced(`asset:${path}`, () => hub.broadcast('asset', {path}));
      return;
    }
    if (event === 'add' || event === 'unlink') {
      treeChanged();
    }
    debounced(`change:${path}`, () => hub.broadcast('change', {path}));
  });

  return watcher;
}
