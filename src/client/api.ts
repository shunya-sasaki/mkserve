import type {RenderResult, TreeNode} from '../shared/types.ts';

/** Body of `GET /api/info`. */
export interface Info {
  name: string;
  version: string;
  watch: boolean;
}

/** Thrown when the server answers with a non-2xx status. */
export class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {headers: {accept: 'application/json'}});
  if (!res.ok) {
    throw new HttpError(res.status);
  }
  return (await res.json()) as T;
}

/** Fetches workspace metadata. */
export function fetchInfo(): Promise<Info> {
  return getJson<Info>('/api/info');
}

/** Fetches the Markdown file tree. */
export function fetchTree(): Promise<TreeNode> {
  return getJson<TreeNode>('/api/tree');
}

/** Fetches a rendered document. */
export function fetchDocument(path: string): Promise<RenderResult> {
  return getJson<RenderResult>(`/api/render?path=${encodeURIComponent(path)}`);
}
