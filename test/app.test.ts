import {expect, test} from 'vite-plus/test';
import {buildApp} from '../src/server/app.ts';

test('GET /api/health reports the workspace root', async () => {
  const app = await buildApp({root: '/workspace', clientDir: '/nonexistent'});
  const res = await app.inject({method: 'GET', url: '/api/health'});

  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ok: true, root: '/workspace'});
  await app.close();
});
