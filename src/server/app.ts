import {existsSync, readFileSync} from 'node:fs';
import {readFile, stat} from 'node:fs/promises';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import fastifyStatic from '@fastify/static';
import {consola} from 'consola';
import Fastify from 'fastify';
import type {FastifyInstance, FastifyReply} from 'fastify';
import getPort from 'get-port';
import open from 'open';
import pkg from '../../package.json' with {type: 'json'};
import {decodePath} from '../shared/paths.ts';
import {isMarkdownPath} from '../shared/types.ts';
import type {RenderResult, TreeNode} from '../shared/types.ts';
import {createRenderer} from './render.ts';
import type {Renderer} from './render.ts';
import {resolveInRoot, toRelPosix} from './safe_path.ts';
import {EventHub} from './sse.ts';
import {buildTree} from './tree.ts';
import {startWatcher} from './watcher.ts';
import {WorkspaceIgnore} from './workspace_ignore.ts';

/** Options for {@link buildApp}. */
export interface AppOptions {
  /** Absolute path of the workspace root. */
  root: string;
  /** Watch the workspace and push live-reload events. */
  watch: boolean;
  /** Directory holding the built client; served when it exists. */
  clientDir?: string;
  /** Shared renderer; created on demand when omitted. */
  renderer?: Renderer;
}

/** Options for {@link startServer}. */
export interface ServerOptions {
  /** Absolute path of the workspace root. */
  root: string;
  /** Port given explicitly by the user; startup fails if it is busy. */
  port?: number;
  /** Port tried first when `port` is omitted; falls back to a free one. */
  defaultPort: number;
  host: string;
  open: boolean;
  watch: boolean;
}

/** Body of `GET /api/info`. */
export interface InfoResult {
  name: string;
  version: string;
  watch: boolean;
}

/** Built client, located next to the bundled `dist/cli.mjs`. */
const CLIENT_DIR = fileURLToPath(new URL('./client/', import.meta.url));

const CLIENT_NOT_BUILT_HTML =
  '<!doctype html><title>mkserve</title>' +
  '<p>The client is not built. Run <code>pnpm build</code>.</p>';

/** Creates the Fastify app (routes, static files, watcher) without listening. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const {root} = options;
  const clientDir = options.clientDir ?? CLIENT_DIR;
  const renderer = options.renderer ?? (await createRenderer());
  const ignore = new WorkspaceIgnore(root);
  const hub = new EventHub();
  const app = Fastify({forceCloseConnections: true});

  let treeCache: Promise<TreeNode> | undefined;
  function getTree(): Promise<TreeNode> {
    if (!options.watch) {
      return buildTree(root, ignore);
    }
    treeCache ??= buildTree(root, ignore);
    return treeCache;
  }

  if (options.watch) {
    const watcher = startWatcher({
      root,
      ignore,
      hub,
      onTreeChange: () => {
        treeCache = undefined;
      },
    });
    app.addHook('onClose', async () => {
      await watcher.close();
    });
  }
  app.addHook('preClose', async () => hub.close());

  // Workspace files (`/@ws/*`) are sent through `reply.sendFile`.
  await app.register(fastifyStatic, {root, serve: false});

  const indexHtml = existsSync(join(clientDir, 'index.html'))
    ? readFileSync(join(clientDir, 'index.html'), 'utf8')
    : CLIENT_NOT_BUILT_HTML;
  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, {
      root: clientDir,
      prefix: '/',
      index: false,
      // Only the files built into the client get routes; every other path
      // (including `/`) falls through to the SPA handler below.
      wildcard: false,
      decorateReply: false,
    });
  }

  app.get('/api/info', async (): Promise<InfoResult> => {
    return {name: basename(root), version: pkg.version, watch: options.watch};
  });

  app.get('/api/tree', () => getTree());

  app.get<{Querystring: {path?: string}}>(
    '/api/render',
    async (request, reply) => {
      const relPath = request.query.path;
      if (!relPath || !isMarkdownPath(relPath)) {
        return sendError(reply, 400, 'A Markdown path is required');
      }
      const abs = resolveInRoot(root, relPath);
      if (abs === undefined) {
        return sendError(reply, 400, 'Path is outside the workspace');
      }
      const path = toRelPosix(root, abs);
      if (ignore.isIgnored(path, false)) {
        return sendError(reply, 404, 'Not found');
      }
      let source: string;
      let mtime: number;
      try {
        [source, mtime] = await Promise.all([
          readFile(abs, 'utf8'),
          stat(abs).then(s => s.mtimeMs),
        ]);
      } catch {
        return sendError(reply, 404, 'Not found');
      }
      const {html, title} = await renderer.render(source, path);
      const result: RenderResult = {
        path,
        html,
        title: title ?? basename(path),
        mtime,
      };
      return result;
    }
  );

  app.get('/api/events', (request, reply) => {
    if (!options.watch) {
      return sendError(reply, 404, 'Live reload is disabled');
    }
    reply.hijack();
    hub.add(reply.raw);
    return reply;
  });

  app.get<{Params: {'*': string}}>('/@ws/*', (request, reply) => {
    const abs = resolveInRoot(root, decodePath(request.params['*']));
    if (abs === undefined) {
      return sendError(reply, 400, 'Path is outside the workspace');
    }
    const path = toRelPosix(root, abs);
    if (path === '' || ignore.isIgnored(path, false)) {
      return sendError(reply, 404, 'Not found');
    }
    return reply.header('cache-control', 'no-cache').sendFile(path);
  });

  // Every other GET that wants HTML is a client-side route (the SPA).
  app.setNotFoundHandler((request, reply) => {
    const wantsHtml = request.headers.accept?.includes('text/html') ?? false;
    const isApi = /^\/(api|@ws)\//.test(request.url);
    if (request.method === 'GET' && wantsHtml && !isApi) {
      return reply.type('text/html; charset=utf-8').send(indexHtml);
    }
    return sendError(reply, 404, 'Not found');
  });

  return app;
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  message: string
): FastifyReply {
  return reply.code(statusCode).send({error: message});
}

/** Builds the app, listens, and wires graceful shutdown. */
export async function startServer(options: ServerOptions): Promise<void> {
  if (!existsSync(options.root)) {
    consola.error(`Directory not found: ${options.root}`);
    process.exit(1);
  }
  const app = await buildApp({root: options.root, watch: options.watch});
  const port = options.port ?? (await getPort({port: options.defaultPort}));

  try {
    await app.listen({port, host: options.host});
  } catch (err) {
    consola.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const url = `http://${options.host}:${port}`;
  consola.success(`mkserve v${pkg.version} → ${url} (root: ${options.root})`);
  if (options.open) {
    await open(url);
  }

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
