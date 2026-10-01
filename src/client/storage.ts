/** Reads a JSON value from `localStorage`; `undefined` if absent/blocked. */
export function loadSetting<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

/** Writes a JSON value to `localStorage`, ignoring storage failures. */
export function saveSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota); settings are optional.
  }
}
