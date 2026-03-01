// scripts/lib/scanner.mjs
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';

const HOME = homedir();
const CLAUDE_DIR = join(HOME, '.claude');

/**
 * All filesystem glob patterns to scan for skill/command/agent files.
 * Each entry: { base, glob, type, src? }
 */
export const SCAN_PATHS = [
  // 1. User skills
  { base: join(CLAUDE_DIR, 'skills'), glob: '*/SKILL.md', type: 'skill', src: 'user' },
  // 2. Cached plugin skills
  { base: join(CLAUDE_DIR, 'plugins/cache'), glob: '*/*/*/skills/*/SKILL.md', type: 'skill' },
  // 3. Cached plugin commands (flat)
  { base: join(CLAUDE_DIR, 'plugins/cache'), glob: '*/*/*/commands/*.md', type: 'cmd' },
  // 3b. Cached plugin commands (nested, e.g. commands/workflows/)
  { base: join(CLAUDE_DIR, 'plugins/cache'), glob: '*/*/*/commands/*/*.md', type: 'cmd' },
  // 4. Cached plugin agents (flat)
  { base: join(CLAUDE_DIR, 'plugins/cache'), glob: '*/*/*/agents/*.md', type: 'agent' },
  // 4b. Cached plugin agents (nested, e.g. agents/review/, agents/research/)
  { base: join(CLAUDE_DIR, 'plugins/cache'), glob: '*/*/*/agents/*/*.md', type: 'agent' },
  // 5a. Marketplace plugin skills (nested)
  { base: join(CLAUDE_DIR, 'plugins/marketplaces'), glob: '*/plugins/*/skills/*/SKILL.md', type: 'skill' },
  // 5b. Marketplace skills (flat, e.g. marketplaces/*/skills/*/SKILL.md)
  { base: join(CLAUDE_DIR, 'plugins/marketplaces'), glob: '*/skills/*/SKILL.md', type: 'skill' },
  // 6. User agents (global)
  { base: join(CLAUDE_DIR, 'agents'), glob: '*.md', type: 'agent', src: 'user' },
  // 7. Project agents (cwd)
  { base: '.claude/agents', glob: '*.md', type: 'agent', src: 'project' },
];

/**
 * Classify a file path into source and type.
 */
export function classifySource(filePath) {
  if (filePath.startsWith('mcp://')) {
    return { src: 'mcp-config', type: 'mcp' };
  }

  // User skills
  if (filePath.includes('/.claude/skills/') && !filePath.includes('/plugins/')) {
    return { src: 'user', type: 'skill' };
  }

  // User agents
  if (filePath.includes('/.claude/agents/') && !filePath.includes('/plugins/')) {
    return { src: 'user', type: 'agent' };
  }

  // Project agents
  if (filePath.includes('.claude/agents/') && !filePath.includes(HOME)) {
    return { src: 'project', type: 'agent' };
  }

  // Cached plugins — extract plugin name from path
  const cacheMatch = filePath.match(/plugins\/cache\/[^/]+\/([^/]+)\//);
  if (cacheMatch) {
    const pluginName = cacheMatch[1];
    if (filePath.includes('/skills/')) return { src: pluginName, type: 'skill' };
    if (filePath.includes('/agents/')) return { src: pluginName, type: 'agent' };
    if (filePath.includes('/commands/')) return { src: pluginName, type: 'cmd' };
    return { src: pluginName, type: 'skill' };
  }

  // Marketplace plugins (nested: marketplaces/*/plugins/*/...)
  const mktMatch = filePath.match(/plugins\/marketplaces\/[^/]+\/plugins\/([^/]+)\//);
  if (mktMatch) {
    const pluginName = mktMatch[1];
    if (filePath.includes('/skills/')) return { src: pluginName, type: 'skill' };
    if (filePath.includes('/agents/')) return { src: pluginName, type: 'agent' };
    if (filePath.includes('/commands/')) return { src: pluginName, type: 'cmd' };
    return { src: pluginName, type: 'skill' };
  }

  // Marketplace plugins (flat: marketplaces/*/skills/*/... — no plugins/ subdirectory)
  const mktFlatMatch = filePath.match(/plugins\/marketplaces\/([^/]+)\//);
  if (mktFlatMatch) {
    const pluginName = mktFlatMatch[1];
    if (filePath.includes('/skills/')) return { src: pluginName, type: 'skill' };
    if (filePath.includes('/agents/')) return { src: pluginName, type: 'agent' };
    if (filePath.includes('/commands/')) return { src: pluginName, type: 'cmd' };
    return { src: pluginName, type: 'skill' };
  }

  return { src: 'unknown', type: 'skill' };
}

/**
 * Simple recursive glob walker. No external deps.
 * Returns all file paths matching the glob segments under base.
 */
export function walkGlob(base, glob) {
  if (!existsSync(base)) return [];
  const segments = glob.split('/');
  return _walk(base, segments);
}

function _walk(dir, segments) {
  if (segments.length === 0) return [];
  const [seg, ...rest] = segments;
  const results = [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (rest.length === 0) {
      // Last segment — must match a file
      if (seg === '*.md' || seg === 'SKILL.md') {
        if (entry.isFile() && (seg === '*.md' ? entry.name.endsWith('.md') : entry.name === seg)) {
          results.push(fullPath);
        }
      } else if (entry.isFile() && entry.name === seg) {
        results.push(fullPath);
      }
    } else {
      // Intermediate segment — must match a directory
      if (entry.isDirectory() && (seg === '*' || entry.name === seg)) {
        results.push(..._walk(fullPath, rest));
      }
    }
  }

  return results;
}

/**
 * Scan all configured paths and return array of { path, type, src }.
 */
export function scanAllPaths() {
  const files = [];

  for (const spec of SCAN_PATHS) {
    const matched = walkGlob(spec.base, spec.glob);
    for (const filePath of matched) {
      // Skip test fixtures
      if (filePath.includes('/tests/')) continue;
      const classification = spec.src
        ? { src: spec.src, type: spec.type }
        : classifySource(filePath);
      files.push({ path: filePath, ...classification });
    }
  }

  return files;
}

/**
 * Collect MCP server entries from .mcp.json and settings files.
 * Returns array of { name, src, type: 'mcp', description, path }.
 */
export function scanMcpServers() {
  const servers = [];

  // Plugin .mcp.json files
  const mcpJsonPaths = [
    ...walkGlob(join(CLAUDE_DIR, 'plugins/cache'), '*/*/*/.mcp.json'),
    ...walkGlob(join(CLAUDE_DIR, 'plugins/marketplaces'), '*/.mcp.json'),
    ...walkGlob(join(CLAUDE_DIR, 'plugins/marketplaces'), '*/plugins/*/.mcp.json'),
    ...walkGlob(join(CLAUDE_DIR, 'plugins/marketplaces'), '*/external_plugins/*/.mcp.json'),
  ];

  for (const mcpPath of mcpJsonPaths) {
    try {
      const data = JSON.parse(readFileSync(mcpPath, 'utf-8'));
      const mcpServers = data.mcpServers || data;
      if (typeof mcpServers !== 'object') continue;
      for (const [name, cfg] of Object.entries(mcpServers)) {
        if (typeof cfg !== 'object') continue;
        const cmd = cfg.command || '';
        const args = cfg.args || [];
        let desc = `MCP server: ${cmd}`;
        for (const a of args) {
          const s = String(a);
          if (!s.startsWith('-') && s.length > 3) {
            desc = `MCP: ${s.includes('/') ? s.split('/').pop() : s}`;
            break;
          }
        }
        servers.push({ name, src: 'mcp-plugin', type: 'mcp', description: desc, path: `mcp://${name}` });
      }
    } catch { /* skip malformed */ }
  }

  // User settings.json and settings.local.json
  for (const settingsFile of ['settings.json', 'settings.local.json']) {
    const sPath = join(CLAUDE_DIR, settingsFile);
    if (!existsSync(sPath)) continue;
    try {
      const data = JSON.parse(readFileSync(sPath, 'utf-8'));
      const mcpServers = data.mcpServers || {};
      for (const [name, cfg] of Object.entries(mcpServers)) {
        if (typeof cfg !== 'object') continue;
        const cmd = cfg.command || '';
        servers.push({ name, src: 'user-config', type: 'mcp', description: `MCP server: ${cmd}`, path: `mcp://${name}` });
      }
    } catch { /* skip */ }
  }

  // Project .mcp.json
  for (const projFile of ['.mcp.json', '.claude/.mcp.json']) {
    if (!existsSync(projFile)) continue;
    try {
      const data = JSON.parse(readFileSync(projFile, 'utf-8'));
      const mcpServers = data.mcpServers || data;
      for (const [name, cfg] of Object.entries(mcpServers)) {
        if (typeof cfg !== 'object') continue;
        const cmd = cfg.command || '';
        servers.push({ name, src: 'project', type: 'mcp', description: `MCP server: ${cmd}`, path: `mcp://${name}` });
      }
    } catch { /* skip */ }
  }

  return servers;
}
