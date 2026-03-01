#!/usr/bin/env node
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [join(__dirname, '../node_modules/@orama/orama/dist/esm/index.js')],
  bundle: true,
  format: 'esm',
  outfile: join(__dirname, 'lib/vendor/orama.min.mjs'),
  minify: true,
  platform: 'node',
  target: 'node22',
});

console.log('Bundled @orama/orama → scripts/lib/vendor/orama.min.mjs');
