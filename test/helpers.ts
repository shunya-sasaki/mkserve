import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {afterEach} from 'vite-plus/test';

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, {recursive: true, force: true});
  }
});

/**
 * Creates a temporary workspace containing `files` (POSIX path → contents);
 * it is deleted after the current test.
 */
export function createWorkspace(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'mkserve-test-')));
  created.push(root);
  for (const [path, contents] of Object.entries(files)) {
    writeFile(root, path, contents);
  }
  return root;
}

/** Writes a file inside `root`, creating parent directories. */
export function writeFile(root: string, path: string, contents: string): void {
  const abs = join(root, path);
  mkdirSync(dirname(abs), {recursive: true});
  writeFileSync(abs, contents);
}
