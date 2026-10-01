import type {ServerResponse} from 'node:http';
import type {LiveEvent} from '../shared/types.ts';

/** Names of the server-sent events pushed to browsers. */
export type LiveEventName = 'change' | 'tree' | 'asset';

const PING_INTERVAL_MS = 30_000;

/** Registry of connected `EventSource` clients. */
export class EventHub {
  private readonly clients = new Set<ServerResponse>();
  private readonly pingTimer: NodeJS.Timeout;

  constructor() {
    this.pingTimer = setInterval(
      () => this.write('ping', {}),
      PING_INTERVAL_MS
    );
    this.pingTimer.unref();
  }

  /** Number of connected clients. */
  get size(): number {
    return this.clients.size;
  }

  /** Starts an SSE stream on `res` and keeps it until the client leaves. */
  add(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write('retry: 1000\n\n');
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  /** Sends an event to every client. */
  broadcast(event: LiveEventName, data: LiveEvent): void {
    this.write(event, data);
  }

  /** Ends all streams so the HTTP server can shut down. */
  close(): void {
    clearInterval(this.pingTimer);
    for (const res of this.clients) {
      res.end();
    }
    this.clients.clear();
  }

  private write(event: string, data: LiveEvent): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) {
      res.write(message);
    }
  }
}
