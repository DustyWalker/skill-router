#!/usr/bin/env node
// scripts/query.mjs — explicit invocation entry point
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSearchEngine, searchSkills } from './lib/search.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
const INDEX_PATH = join(DATA_DIR, 'skills.jsonl');

// Parse args
const args = process.argv.slice(2);
let topN = 5;
let format = 'text';
let ambient = false;
const queryParts = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--top' && args[i + 1]) { topN = parseInt(args[++i], 10); }
  else if (args[i] === '--format' && args[i + 1]) { format = args[++i]; }
  else if (args[i] === '--ambient') { ambient = true; }
  else { queryParts.push(args[i]); }
}

const query = queryParts.join(' ').trim();

if (!query) {
  console.error('Usage: query.mjs [--top N] [--format text|json] [--ambient] <query>');
  process.exit(1);
}

// Auto-rebuild if index missing or wrong version
let needsRebuild = !existsSync(INDEX_PATH);
if (!needsRebuild) {
  try {
    const firstLine = readFileSync(INDEX_PATH, 'utf-8').split('\n')[0];
    const m = JSON.parse(firstLine);
    if (!m._meta || m.version !== 1) needsRebuild = true;
  } catch { needsRebuild = true; }
}
if (needsRebuild) {
  const { buildIndex } = await import('./lib/indexer.mjs');
  buildIndex({ dataDir: DATA_DIR });
}

// Load index
const lines = readFileSync(INDEX_PATH, 'utf-8').trim().split('\n');
const meta = JSON.parse(lines[0]);
const records = lines.slice(1).map(l => JSON.parse(l));

// Search
const engine = await createSearchEngine(records);
const results = await searchSkills(engine, query, { topN, ambient });

// Output
if (format === 'json') {
  console.log(JSON.stringify({ query, results, meta: { item_count: meta.item_count, built_at: meta.built_at } }, null, 2));
} else {
  if (results.length === 0) {
    console.log(`No strong matches for "${query}". Try a different phrasing.`);
    console.log(`Index: ${meta.item_count} items | Built: ${new Date(meta.built_at).toISOString()}`);
  } else {
    console.log(`SKILL RECOMMENDATIONS (query: "${query}")`);
    console.log('\u2501'.repeat(50));
    for (const r of results) {
      const conf = `[${r.confidence}]`.padEnd(6);
      console.log(`${conf} ${r.name} (${r.src})`);
      console.log(`       ${r.desc.slice(0, 120)}`);
      console.log(`       Path: ${r.path}`);
      console.log();
    }
    console.log(`Index: ${meta.item_count} items | Built: ${new Date(meta.built_at).toISOString()}`);
  }
}
