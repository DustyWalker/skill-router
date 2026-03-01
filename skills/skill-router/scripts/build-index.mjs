#!/usr/bin/env node
// scripts/build-index.mjs — SessionStart hook entry point

// Version guard: Orama bundled with target: 'node22'
const [major] = process.versions.node.split('.').map(Number);
if (major < 22) { console.error('Skill Router v2 requires Node.js 22+'); process.exit(0); }

import { buildIndex } from './lib/indexer.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../data');

const t0 = performance.now();
const { records, meta } = buildIndex({ dataDir });
const elapsed = Math.round(performance.now() - t0);

const counts = {};
for (const r of records) {
  counts[r.type] = (counts[r.type] || 0) + 1;
}
const parts = [];
if (counts.skill) parts.push(`${counts.skill} skills`);
if (counts.cmd) parts.push(`${counts.cmd} commands`);
if (counts.agent) parts.push(`${counts.agent} agents`);
if (counts.subagent) parts.push(`${counts.subagent} subagents`);
if (counts.mcp) parts.push(`${counts.mcp} MCP servers`);
console.log(`Skill Router v2: Index built — ${records.length} items (${parts.join(', ')}) in ${elapsed}ms`);
