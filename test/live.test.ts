import {rmSync} from 'node:fs';
import {join} from 'node:path';
import type {FastifyInstance} from 'fastify';
import {afterEach, expect, test} from 'vite-plus/test';
import {buildApp} from '../src/server/app.ts';
import {createRenderer} from '../src/server/render.ts';
import {createWorkspace, writeFile} from './helpers.ts';

interface ReceivedEvent {
  event: string;
  data: unknown;
}

let app: FastifyInstance | undefined;
let abort: AbortController | undefined;

afterEach(async () => {
  abort?.abort();
  await app?.close();
  app = undefined;
});

/** Connects to `/api/events` and collects parsed events. */
async function subscribe(base: string): Promise<ReceivedEvent[]> {
  abort = new AbortController();
  const res = await fetch(`${base}/api/events`, {signal: abort.signal});
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const events: ReceivedEvent[] = [];
  const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader();
  void (async () => {
    let buffer = '';
    try {
      for (;;) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) {
          return;
        }
        buffer += chunk.value;
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const event = /^event: (.*)$/m.exec(part)?.[1];
          const data = /^data: (.*)$/m.exec(part)?.[1];
          if (event && data) {
            events.push({event, data: JSON.parse(data)});
          }
        }
      }
    } catch {
      // Aborted at the end of the test.
    }
  })();
  return events;
}

async function waitFor(check: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

async function startLive(files: Record<string, string>) {
  const root = createWorkspace(files);
  app = await buildApp({
    root,
    clientDir: '/nonexistent',
    watch: true,
    renderer: await createRenderer(),
  });
  const base = await app.listen({port: 0, host: '127.0.0.1'});
  // Give chokidar time to finish its initial scan.
  await new Promise(resolve => setTimeout(resolve, 300));
  return {root, base, events: await subscribe(base)};
}

function has(events: ReceivedEvent[], event: string, path?: string): boolean {
  return events.some(
    e =>
      e.event === event &&
      (path === undefined || (e.data as {path?: string}).path === path)
  );
}

test('pushes change, tree, and asset events', async () => {
  const {root, base, events} = await startLive({
    'a.md': '# A',
    'img.svg': '<svg/>',
    '.gitignore': 'ignored.md\n',
  });

  writeFile(root, 'a.md', '# A2');
  await waitFor(() => has(events, 'change', 'a.md'));

  writeFile(root, 'new/b.md', '# B');
  await waitFor(() => has(events, 'tree') && has(events, 'change', 'new/b.md'));
  const tree = await (await fetch(`${base}/api/tree`)).json();
  expect(JSON.stringify(tree)).toContain('new/b.md');

  writeFile(root, 'img.svg', '<svg></svg>');
  await waitFor(() => has(events, 'asset', 'img.svg'));

  rmSync(join(root, 'a.md'));
  await waitFor(() => events.filter(e => e.event === 'change').length >= 3);

  writeFile(root, 'ignored.md', 'x');
  await new Promise(resolve => setTimeout(resolve, 400));
  expect(has(events, 'change', 'ignored.md')).toBe(false);
});

test('a .gitignore change refreshes the tree', async () => {
  const {root, base, events} = await startLive({'a.md': '', 'b.md': ''});
  writeFile(root, '.gitignore', 'b.md\n');
  await waitFor(() => has(events, 'tree'));
  const tree = await (await fetch(`${base}/api/tree`)).json();
  expect(tree.children).toEqual([{name: 'a.md', path: 'a.md', type: 'file'}]);
});
