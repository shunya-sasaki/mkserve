import type {LiveEvent} from '../shared/types.ts';

/** Callbacks for {@link connectLive}. */
export interface LiveHandlers {
  /** A Markdown file was edited, added, or removed. */
  onChange(path: string): void;
  /** The file tree changed. */
  onTree(): void;
  /** A non-Markdown workspace file (e.g. an image) changed. */
  onAsset(path: string): void;
  /** The stream came back after a disconnect; state may be stale. */
  onReconnect(): void;
  onStatus(connected: boolean): void;
}

/** Subscribes to `/api/events`; `EventSource` reconnects by itself. */
export function connectLive(handlers: LiveHandlers): EventSource {
  const source = new EventSource('/api/events');
  let disconnected = false;

  source.addEventListener('open', () => {
    handlers.onStatus(true);
    if (disconnected) {
      disconnected = false;
      handlers.onReconnect();
    }
  });
  source.addEventListener('error', () => {
    disconnected = true;
    handlers.onStatus(false);
  });
  source.addEventListener('change', event => {
    const {path} = parse(event);
    if (path !== undefined) {
      handlers.onChange(path);
    }
  });
  source.addEventListener('asset', event => {
    const {path} = parse(event);
    if (path !== undefined) {
      handlers.onAsset(path);
    }
  });
  source.addEventListener('tree', () => handlers.onTree());
  return source;
}

function parse(event: MessageEvent<string>): LiveEvent {
  try {
    return JSON.parse(event.data) as LiveEvent;
  } catch {
    return {};
  }
}
