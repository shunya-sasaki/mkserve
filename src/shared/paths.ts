/** URL-encodes each segment of a POSIX path, keeping the slashes. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Inverse of {@link encodePath}; returns the input if it is malformed. */
export function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
