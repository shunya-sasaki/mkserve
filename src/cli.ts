#!/usr/bin/env node
import {resolve} from 'node:path';
import {defineCommand, runMain} from 'citty';
import pkg from '../package.json' with {type: 'json'};
import {startServer} from './server/app.ts';

const DEFAULT_PORT = 3000;

const main = defineCommand({
  meta: {
    name: 'mkserve',
    version: pkg.version,
    description: pkg.description,
  },
  args: {
    dir: {
      type: 'positional',
      description: 'Workspace root',
      required: false,
      default: '.',
    },
    port: {
      type: 'string',
      alias: 'p',
      description: `Port to listen on (default: ${DEFAULT_PORT})`,
    },
    host: {
      type: 'string',
      description: 'Bind address',
      default: '127.0.0.1',
    },
    open: {
      type: 'boolean',
      alias: 'o',
      description: 'Open the browser after start',
      default: false,
    },
    watch: {
      type: 'boolean',
      description: 'Reload pages on file changes (use --no-watch to disable)',
      default: true,
    },
  },
  async run({args}) {
    await startServer({
      root: resolve(args.dir),
      port: args.port === undefined ? undefined : parsePort(args.port),
      defaultPort: DEFAULT_PORT,
      host: args.host,
      open: args.open,
      watch: args.watch,
    });
  },
});

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${value}`);
  }
  return port;
}

void runMain(main);
