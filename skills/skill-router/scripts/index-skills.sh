#!/usr/bin/env bash
# Dynamically indexes all installed skills, commands, agents, subagent types, and MCP servers.
# Outputs TSV: source\ttype\tname\tdescription
# Usage: ./index-skills.sh [filter_keyword]

set -eo pipefail

FILTER="${1:-}"
CLAUDE_DIR="${HOME}/.claude"

declare -A seen

extract_frontmatter() {
  local file="$1"
  # Handle both single-line and multiline YAML values
  python3 -c "
import sys, re
text = open('$file').read()
m = re.match(r'^---\n(.*?)\n---', text, re.DOTALL)
if not m: sys.exit(1)
fm = m.group(1)
name = ''
desc = ''
lines = fm.split('\n')
i = 0
while i < len(lines):
    line = lines[i]
    if line.startswith('name:'):
        name = line.split(':', 1)[1].strip().strip('\"').strip(\"'\")
    elif line.startswith('description:'):
        val = line.split(':', 1)[1].strip()
        if val in ('|', '>', '>-', '|-', ''):
            # Collect multiline value from indented continuation lines
            parts = []
            i += 1
            while i < len(lines) and (lines[i].startswith('  ') or lines[i].startswith('\t') or lines[i] == ''):
                stripped = lines[i].strip()
                if stripped:
                    parts.append(stripped)
                i += 1
            desc = ' '.join(parts)
            continue  # skip i += 1 at bottom
        else:
            desc = val.strip('\"').strip(\"'\")
    i += 1
if name:
    print(f'{name}\t{desc[:140]}')
" 2>/dev/null
}

process_file() {
  local file="$1"
  local source="$2"
  local type="$3"

  local result
  result=$(extract_frontmatter "$file") || return 0
  [ -z "$result" ] && return 0

  local name desc
  name=$(echo "$result" | cut -f1)
  desc=$(echo "$result" | cut -f2-)

  [ -z "$name" ] && return 0
  [ -n "${seen[$name]:-}" ] && return 0
  seen[$name]=1

  if [ -n "$FILTER" ]; then
    local lf ln
    lf=$(echo "$FILTER" | tr '[:upper:]' '[:lower:]')
    ln=$(echo "$name $desc" | tr '[:upper:]' '[:lower:]')
    [[ "$ln" != *"$lf"* ]] && return 0
  fi

  printf "%s\t%s\t%s\t%s\n" "$source" "$type" "$name" "$desc"
}

# Emit a hardcoded entry (for built-in subagent types and MCP servers)
emit_entry() {
  local source="$1"
  local type="$2"
  local name="$3"
  local desc="$4"

  [ -n "${seen[$name]:-}" ] && return 0
  seen[$name]=1

  if [ -n "$FILTER" ]; then
    local lf ln
    lf=$(echo "$FILTER" | tr '[:upper:]' '[:lower:]')
    ln=$(echo "$name $desc" | tr '[:upper:]' '[:lower:]')
    [[ "$ln" != *"$lf"* ]] && return 0
  fi

  printf "%s\t%s\t%s\t%s\n" "$source" "$type" "$name" "$desc"
}

# ============================================================
# SECTION 1: SKILLS
# ============================================================

# 1a. User skills
for f in "$CLAUDE_DIR"/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  process_file "$f" "user" "skill"
done

# 1b. Marketplace plugin skills
for f in "$CLAUDE_DIR"/plugins/marketplaces/*/plugins/*/skills/*/SKILL.md \
         "$CLAUDE_DIR"/plugins/marketplaces/*/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  src=$(echo "$f" | grep -oP 'marketplaces/\K[^/]+')
  process_file "$f" "$src" "skill"
done

# 1c. Cached plugin skills (path: cache/marketplace/plugin/version/skills/skill/SKILL.md)
for f in "$CLAUDE_DIR"/plugins/cache/*/*/*/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  src=$(echo "$f" | grep -oP 'cache/[^/]+/\K[^/]+')
  process_file "$f" "$src" "skill"
done

# ============================================================
# SECTION 2: COMMANDS (slash commands)
# ============================================================

# 2a. Marketplace commands
for f in "$CLAUDE_DIR"/plugins/marketplaces/*/plugins/*/commands/*.md \
         "$CLAUDE_DIR"/plugins/marketplaces/*/plugins/*/commands/**/*.md; do
  [ -f "$f" ] || continue
  src=$(echo "$f" | grep -oP 'marketplaces/\K[^/]+')
  process_file "$f" "$src" "cmd"
done

# 2b. Cached plugin commands (path: cache/marketplace/plugin/version/commands/*.md)
for f in "$CLAUDE_DIR"/plugins/cache/*/*/*/commands/*.md \
         "$CLAUDE_DIR"/plugins/cache/*/*/*/commands/**/*.md; do
  [ -f "$f" ] || continue
  src=$(echo "$f" | grep -oP 'cache/[^/]+/\K[^/]+')
  process_file "$f" "$src" "cmd"
done

# ============================================================
# SECTION 3: AGENTS (subagent definitions from plugins)
# ============================================================

# 3a. User agents (project-level or global)
for f in "$CLAUDE_DIR"/agents/*.md .claude/agents/*.md; do
  [ -f "$f" ] || continue
  process_file "$f" "user" "agent"
done

# 3b. Cached plugin agents (path: cache/marketplace/plugin/version/agents/**/*.md)
for f in "$CLAUDE_DIR"/plugins/cache/*/*/*/agents/*.md \
         "$CLAUDE_DIR"/plugins/cache/*/*/*/agents/**/*.md; do
  [ -f "$f" ] || continue
  # Skip test fixtures
  [[ "$f" == *"/tests/"* ]] && continue
  src=$(echo "$f" | grep -oP 'cache/[^/]+/\K[^/]+')
  process_file "$f" "$src" "agent"
done

# 3c. Marketplace plugin agents
for f in "$CLAUDE_DIR"/plugins/marketplaces/*/plugins/*/agents/*.md \
         "$CLAUDE_DIR"/plugins/marketplaces/*/plugins/*/agents/**/*.md; do
  [ -f "$f" ] || continue
  # Skip test fixtures
  [[ "$f" == *"/tests/"* ]] && continue
  src=$(echo "$f" | grep -oP 'marketplaces/\K[^/]+')
  process_file "$f" "$src" "agent"
done

# ============================================================
# SECTION 4: BUILT-IN SUBAGENT TYPES (from system prompt)
# ============================================================
# These are hardcoded in Claude Code's Agent tool — not on disk.
# Updated manually when new built-in types are added.

emit_entry "built-in" "subagent" "general-purpose" "General-purpose agent for researching, searching code, and multi-step tasks. Has access to ALL tools."
emit_entry "built-in" "subagent" "Explore" "Fast codebase exploration agent. Find files by pattern, search code, answer codebase questions. Read-only."
emit_entry "built-in" "subagent" "Plan" "Software architect agent for designing implementation plans. Read-only, no edits."

# ============================================================
# SECTION 5: MCP SERVERS (from plugin configs)
# ============================================================
# Collect all MCP server entries into a temp file first, then
# deduplicate in the main shell (pipes create subshells that
# can't update the parent's seen array).

MCP_TMP=$(mktemp)
trap "rm -f '$MCP_TMP'" EXIT

# 5a. MCP servers from plugin .mcp.json files
for f in $(find "$CLAUDE_DIR"/plugins/cache -name ".mcp.json" 2>/dev/null) \
         $(find "$CLAUDE_DIR"/plugins/marketplaces -name ".mcp.json" 2>/dev/null); do
  [ -f "$f" ] || continue
  python3 -c "
import json, sys
try:
    d = json.load(open('$f'))
    servers = d.get('mcpServers', d) if isinstance(d, dict) else {}
    if not isinstance(servers, dict):
        sys.exit(0)
    for name, cfg in servers.items():
        if not isinstance(cfg, dict):
            continue
        cmd = cfg.get('command', '')
        args = cfg.get('args', [])
        desc = f'MCP server: {cmd}'
        if args:
            for a in args:
                a = str(a)
                if not a.startswith('-') and len(a) > 3:
                    desc = f'MCP: {a.split(\"/\")[-1] if \"/\" in a else a}'
                    break
        print(f'mcp-plugin\t{name}\t{desc[:140]}')
except:
    pass
" >> "$MCP_TMP" 2>/dev/null
done

# 5b. MCP servers from user settings.json and settings.local.json
for settings_file in "$CLAUDE_DIR/settings.json" "$CLAUDE_DIR/settings.local.json"; do
  [ -f "$settings_file" ] || continue
  python3 -c "
import json, sys
try:
    d = json.load(open('$settings_file'))
    servers = d.get('mcpServers', {})
    for name, cfg in servers.items():
        if not isinstance(cfg, dict):
            continue
        cmd = cfg.get('command', '')
        desc = f'MCP server: {cmd}'
        print(f'user-config\t{name}\t{desc[:140]}')
except:
    pass
" >> "$MCP_TMP" 2>/dev/null
done

# 5c. MCP servers from project-level .mcp.json
for mcp_file in .mcp.json .claude/.mcp.json; do
  [ -f "$mcp_file" ] || continue
  python3 -c "
import json, sys
try:
    d = json.load(open('$mcp_file'))
    servers = d.get('mcpServers', d) if isinstance(d, dict) else {}
    for name, cfg in servers.items():
        if not isinstance(cfg, dict):
            continue
        cmd = cfg.get('command', '')
        desc = f'MCP server: {cmd}'
        print(f'project\t{name}\t{desc[:140]}')
except:
    pass
" >> "$MCP_TMP" 2>/dev/null
done

# Now process collected MCP entries in the main shell (dedup works)
while IFS=$'\t' read -r mcp_source mcp_name mcp_desc; do
  [ -z "$mcp_name" ] && continue
  emit_entry "$mcp_source" "mcp" "$mcp_name" "$mcp_desc"
done < "$MCP_TMP"

# ============================================================
# SUMMARY
# ============================================================

echo "---"
echo "Total: ${#seen[@]} indexed"
