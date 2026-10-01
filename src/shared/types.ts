/** A node of the workspace tree returned by `GET /api/tree`. */
export interface TreeNode {
  name: string;
  /** POSIX path relative to the workspace root (`''` for the root). */
  path: string;
  type: 'dir' | 'file';
  children?: TreeNode[];
}

/** Body of `GET /api/render`. */
export interface RenderResult {
  path: string;
  html: string;
  title: string;
  /** Last modification time in epoch milliseconds. */
  mtime: number;
}

/** Payload of the `change`, `tree`, and `asset` server-sent events. */
export interface LiveEvent {
  path?: string;
}

/** Extensions treated as Markdown documents. */
export const MARKDOWN_EXTENSIONS = ['.md', '.markdown'];

/** Returns whether `path` names a Markdown document. */
export function isMarkdownPath(path: string): boolean {
  const lower = path.toLowerCase();
  return MARKDOWN_EXTENSIONS.some(ext => lower.endsWith(ext));
}
