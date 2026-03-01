#!/usr/bin/env bash
# Post-install setup: adds SessionStart hook to ~/.claude/settings.json
# Run once after: npx skills add DustyWalker/skill-router

set -euo pipefail

SETTINGS="$HOME/.claude/settings.json"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_CMD="node ${SKILL_DIR}/scripts/build-index.mjs 2>/dev/null || true"

# Create settings.json if it doesn't exist
if [ ! -f "$SETTINGS" ]; then
  mkdir -p "$(dirname "$SETTINGS")"
  echo '{}' > "$SETTINGS"
fi

# Check if hook already exists
if grep -q "build-index.mjs" "$SETTINGS" 2>/dev/null; then
  echo "skill-router: SessionStart hook already configured."
  # Still run the initial build
  node "${SKILL_DIR}/scripts/build-index.mjs" 2>/dev/null || true
  exit 0
fi

# Patch settings.json using node (handles JSON correctly)
node -e "
const fs = require('fs');
const settings = JSON.parse(fs.readFileSync('${SETTINGS}', 'utf-8'));

if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.SessionStart) settings.hooks.SessionStart = [];

// Add our hook entry
settings.hooks.SessionStart.push({
  hooks: [{
    type: 'command',
    command: '${BUILD_CMD}',
    timeout: 15
  }]
});

fs.writeFileSync('${SETTINGS}', JSON.stringify(settings, null, 2) + '\n');
" 2>/dev/null

if [ $? -eq 0 ]; then
  echo "skill-router: SessionStart hook added to ${SETTINGS}"
  # Run initial build
  node "${SKILL_DIR}/scripts/build-index.mjs" 2>/dev/null || true
else
  echo "skill-router: Could not patch settings.json. Add the hook manually (see README)."
fi
