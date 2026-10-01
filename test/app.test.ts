import type {FastifyInstance} from 'fastify';
import {afterEach, beforeAll, describe, expect, test} from 'vite-plus/test';
import {buildApp} from '../src/server/app.ts';
import {createRenderer} from '../src/server/render.ts';
import type {Renderer} from '../src/server/render.ts';
import {createWorkspace, writeFile} from './helpers.ts';

let renderer: Renderer;
let app: FastifyInstance | undefined;

beforeAll(async () => {
  renderer = await createRenderer();
});

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(
  files: Record<string, string>,
  clientFiles?: Record<string, string>
): Promise<FastifyInstance> {
  const root = createWorkspace(files);
  const clientDir = clientFiles ? createWorkspace(clientFiles) : '/nonexistent';
  app = await buildApp({root, clientDir, watch: false, renderer});
  return app;
}

describe('API', () => {
  test('GET /api/info', async () => {
    const res = await (await start({})).inject('/api/info');
    expect(res.json()).toMatchObject({watch: false});
    expect(res.json().name).toMatch(/^mkserve-test-/);
  });

  test('GET /api/tree', async () => {
    const res = await (
      await start({'a.md': '', '.gitignore': 'x.md'})
    ).inject('/api/tree');
    expect(res.json().children).toEqual([
      {name: 'a.md', path: 'a.md', type: 'file'},
    ]);
  });

  test('GET /api/render', async () => {
    const res = await (
      await start({'docs/a.md': '# Title\n\nBody'})
    ).inject('/api/render?path=docs/a.md');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({path: 'docs/a.md', title: 'Title'});
    expect(body.html).toContain('<p>Body</p>');
    expect(body.mtime).toBeGreaterThan(0);
  });

  test('GET /api/render falls back to the file name as title', async () => {
    const res = await (
      await start({'a.md': 'text'})
    ).inject('/api/render?path=a.md');
    expect(res.json().title).toBe('a.md');
  });

  test.each([
    ['', 400],
    ['?path=a.txt', 400],
    ['?path=../../etc/passwd.md', 400],
    ['?path=missing.md', 404],
    ['?path=secret.md', 404],
    ['?path=.hidden/a.md', 404],
  ])('GET /api/render%s → %i', async (query, status) => {
    const server = await start({
      'a.txt': '',
      'secret.md': '',
      '.gitignore': 'secret.md',
      '.hidden/a.md': '',
    });
    expect((await server.inject(`/api/render${query}`)).statusCode).toBe(
      status
    );
  });

  test('GET /api/events is 404 when watching is disabled', async () => {
    expect((await (await start({})).inject('/api/events')).statusCode).toBe(
      404
    );
  });
});

describe('workspace files', () => {
  test('serves files under /@ws/', async () => {
    const server = await start({'img/a b.svg': '<svg/>'});
    const res = await server.inject('/@ws/img/a%20b.svg');
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<svg/>');
    expect(res.headers['content-type']).toContain('image/svg+xml');
  });

  test('refuses ignored, hidden, and outside files', async () => {
    const server = await start({
      '.gitignore': 'private/',
      'private/a.png': '',
      '.env': 'SECRET=1',
    });
    for (const url of ['/@ws/private/a.png', '/@ws/.env', '/@ws/.gitignore']) {
      expect((await server.inject(url)).statusCode).toBe(404);
    }
    const escape = await server.inject('/@ws/..%2F..%2Fetc%2Fpasswd');
    expect([400, 404]).toContain(escape.statusCode);
  });
});

describe('SPA', () => {
  const client = {
    'index.html': '<!doctype html><div id="app"></div>',
    'assets/app.js': 'console.log(1)',
  };

  test('document routes return index.html', async () => {
    const server = await start({}, client);
    for (const url of ['/', '/docs/a.md', '/assets/notes.md']) {
      const res = await server.inject({url, headers: {accept: 'text/html'}});
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('id="app"');
    }
  });

  test('serves built assets', async () => {
    const res = await (await start({}, client)).inject('/assets/app.js');
    expect(res.body).toBe('console.log(1)');
  });

  test('unknown API routes stay 404 JSON', async () => {
    const res = await (
      await start({}, client)
    ).inject({
      url: '/api/nope',
      headers: {accept: 'text/html'},
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({error: 'Not found'});
  });

  test('works without a built client', async () => {
    const res = await (
      await start({})
    ).inject({
      url: '/',
      headers: {accept: 'text/html'},
    });
    expect(res.body).toContain('not built');
  });
});

test('tree is rebuilt per request when watching is disabled', async () => {
  const root = createWorkspace({'a.md': ''});
  app = await buildApp({
    root,
    clientDir: '/nonexistent',
    watch: false,
    renderer,
  });
  writeFile(root, 'b.md', '');
  const res = await app.inject('/api/tree');
  expect(res.json().children).toHaveLength(2);
});
