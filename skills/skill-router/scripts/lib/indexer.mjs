// scripts/lib/indexer.mjs
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';
import { scanAllPaths, scanMcpServers, SCAN_PATHS } from './scanner.mjs';

const INDEX_VERSION = 1;
const SOURCE_PRIORITY = { user: 0, project: 1, 'user-config': 2, 'mcp-plugin': 3 };

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildRecord(fm, fileInfo) {
  const id = slugify(fm.name);
  return {
    id,
    src: fileInfo.src,
    type: fileInfo.type,
    name: fm.name,
    desc: fm.description || '',
    tags: fm.tags || [],
    triggers: fm.triggers || [],
    boundaries: fm.boundaries || [],
    path: fileInfo.path,
    manual_only: fm.manual_only || false,
  };
}

export function dedup(records) {
  const byId = new Map();
  for (const rec of records) {
    const existing = byId.get(rec.id);
    if (!existing) {
      byId.set(rec.id, rec);
      continue;
    }
    if (rec.desc.length > existing.desc.length) {
      byId.set(rec.id, rec);
    } else if (rec.desc.length === existing.desc.length) {
      const recPri = SOURCE_PRIORITY[rec.src] ?? 99;
      const existPri = SOURCE_PRIORITY[existing.src] ?? 99;
      if (recPri < existPri) {
        byId.set(rec.id, rec);
      }
    }
  }
  return [...byId.values()];
}

const BUILT_IN_SUBAGENTS = [
  { name: 'general-purpose', description: 'General-purpose agent for researching, searching code, and multi-step tasks. Has access to ALL tools.', type: 'subagent', src: 'built-in' },
  { name: 'Explore', description: 'Fast codebase exploration agent. Find files by pattern, search code, answer codebase questions. Read-only.', type: 'subagent', src: 'built-in' },
  { name: 'Plan', description: 'Software architect agent for designing implementation plans. Read-only, no edits.', type: 'subagent', src: 'built-in' },
];

export function buildIndex(opts = {}) {
  const dataDir = opts.dataDir || join(dirname(new URL(import.meta.url).pathname), '../../data');
  const indexPath = join(dataDir, 'skills.jsonl');
  const filePaths = scanAllPaths();
  const records = [];

  for (const fileInfo of filePaths) {
    try {
      const content = readFileSync(fileInfo.path, 'utf-8');
      const fm = parseFrontmatter(content);
      if (!fm) continue;
      records.push(buildRecord(fm, fileInfo));
    } catch (err) {
      process.stderr.write(`WARN: skipping ${fileInfo.path}: ${err.message}\n`);
    }
  }

  for (const sub of BUILT_IN_SUBAGENTS) {
    records.push({
      id: slugify(sub.name),
      src: sub.src, type: sub.type, name: sub.name, desc: sub.description,
      tags: [], triggers: [], boundaries: [], path: `builtin://${sub.name}`, manual_only: false,
    });
  }

  const mcpServers = scanMcpServers();
  for (const mcp of mcpServers) {
    records.push({
      id: slugify(mcp.name),
      src: mcp.src, type: 'mcp', name: mcp.name, desc: mcp.description || '',
      tags: [], triggers: [], boundaries: [], path: mcp.path, manual_only: false,
    });
  }

  const deduped = dedup(records);
  const meta = { _meta: true, version: INDEX_VERSION, built_at: Date.now(), item_count: deduped.length };

  mkdirSync(dataDir, { recursive: true });
  const tmpPath = indexPath + '.tmp';
  const lines = [JSON.stringify(meta), ...deduped.map(r => JSON.stringify(r))];
  writeFileSync(tmpPath, lines.join('\n') + '\n');
  renameSync(tmpPath, indexPath);

  return { records: deduped, meta };
}
