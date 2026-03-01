# skill-router

Semantic skill recommender for Claude Code. Indexes all installed skills, commands, agents, and MCP servers, then ranks them by relevance using BM25+TF-IDF search.

Replaces brute-force substring matching with ranked semantic search. Builds a JSONL index on session start (~25ms), queries return in <100ms with confidence-scored results (~500 tokens).

## Install

```bash
npx skills add DustyWalker/skill-router
```

Or manually:

```bash
cp -r skills/skill-router ~/.claude/skills/skill-router
```

## Post-Install Setup

Add these hooks to `~/.claude/settings.json` so the index rebuilds automatically:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "node ~/.claude/skills/skill-router/scripts/build-index.mjs 2>/dev/null || true",
        "timeout": 15
      }]
    }],
    "ConfigChange": [{
      "matcher": "user_settings|project_settings",
      "hooks": [{
        "type": "command",
        "command": "rm -f ~/.claude/skills/skill-router/data/skills.jsonl",
        "timeout": 5
      }]
    }]
  }
}
```

If you already have hooks, merge these entries into your existing arrays.

## Usage

Claude invokes it automatically when you ask things like:

- "What skills should I use for X?"
- "Find a skill for deploying"
- "Which agent should I use?"

Or invoke directly:

```
/skill-router deploy to production
```

### CLI

```bash
# Text output (default)
node ~/.claude/skills/skill-router/scripts/query.mjs "your query"

# JSON output
node ~/.claude/skills/skill-router/scripts/query.mjs "your query" --format json

# Limit results
node ~/.claude/skills/skill-router/scripts/query.mjs "your query" --top 3

# Ambient mode (excludes manual-only skills)
node ~/.claude/skills/skill-router/scripts/query.mjs "your query" --ambient
```

### Rebuild index manually

```bash
node ~/.claude/skills/skill-router/scripts/build-index.mjs
```

## What It Indexes

| Source | What |
|--------|------|
| `~/.claude/skills/` | Personal skills |
| `~/.claude/plugins/cache/` | Cached plugin skills, commands, agents |
| `~/.claude/plugins/marketplaces/` | Marketplace skills |
| `~/.claude/agents/` | Global agents |
| `.claude/agents/` | Project agents |
| `~/.claude/settings.json` | MCP servers |
| `.mcp.json` | Project MCP servers |

## How It Works

1. **SessionStart hook** runs `build-index.mjs` (~25ms)
2. Scans all skill/command/agent/MCP paths using glob patterns
3. Parses YAML frontmatter from each SKILL.md
4. Builds a JSONL index with deduplication
5. On query, loads index into Orama (BM25+TF-IDF) and returns ranked results
6. Confidence scoring: HIGH (>0.3 gap), MED (>0.1), LOW

## Architecture

| Module | Purpose |
|--------|---------|
| `scripts/lib/frontmatter.mjs` | Zero-dep YAML frontmatter parser |
| `scripts/lib/scanner.mjs` | Filesystem glob walker + path classifier |
| `scripts/lib/indexer.mjs` | JSONL index builder with priority-aware dedup |
| `scripts/lib/search.mjs` | Orama BM25 search with confidence scoring |
| `scripts/lib/vendor/orama.min.mjs` | Pre-bundled @orama/orama v3 (78KB, zero deps) |
| `scripts/build-index.mjs` | Hook entry point |
| `scripts/query.mjs` | CLI entry point |
| `scripts/index-skills.sh` | v1 bash fallback |

## Requirements

- Node.js 22+
- Claude Code

## Development

```bash
cd ~/.claude/skills/skill-router

# Install dev deps (only needed for re-bundling Orama)
npm install

# Re-bundle Orama from node_modules
node scripts/bundle-vendor.mjs

# Run tests
node --test tests/*.test.mjs

# Rebuild index
node scripts/build-index.mjs
```

## License

MIT
