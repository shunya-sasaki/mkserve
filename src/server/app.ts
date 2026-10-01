import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import fastifyStatic from '@fastify/static';
import {consola} from 'consola';
import Fastify from 'fastify';
import type {FastifyInstance} from 'fastify';
import getPort from 'get-port';
import open from 'open';

/** Options for {@link buildApp}. */
export interface AppOptions {
  /** Absolute path of the workspace root. */
  root: string;
  /** Directory holding the built client; served when it exists. */
  clientDir?: string;
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

/** Built client, located next to the bundled `dist/cli.mjs`. */
const CLIENT_DIR = fileURLToPath(new URL('./client/', import.meta.url));

/** Creates the Fastify app without listening. */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify();
  const clientDir = options.clientDir ?? CLIENT_DIR;

  app.get('/api/health', async () => ({ok: true, root: options.root}));

  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, {root: clientDir});
  }
  return app;
}

/** Builds the app, listens, and wires graceful shutdown. */
export async function startServer(options: ServerOptions): Promise<void> {
  const app = await buildApp({root: options.root});
  const port = options.port ?? (await getPort({port: options.defaultPort}));

  try {
    await app.listen({port, host: options.host});
  } catch (err) {
    consola.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const url = `http://${options.host}:${port}`;
  consola.success(`mkserve → ${url} (root: ${options.root})`);
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
