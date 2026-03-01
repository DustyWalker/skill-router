// tests/scanner.test.mjs
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifySource, SCAN_PATHS } from '../scripts/lib/scanner.mjs';

describe('classifySource', () => {
  it('classifies user skills', () => {
    const result = classifySource('/home/user/.claude/skills/my-skill/SKILL.md');
    assert.equal(result.src, 'user');
    assert.equal(result.type, 'skill');
  });

  it('classifies cached plugin skills', () => {
    const result = classifySource('/home/user/.claude/plugins/cache/every-marketplace/compound-engineering/2.31.1/skills/brainstorming/SKILL.md');
    assert.equal(result.src, 'compound-engineering');
    assert.equal(result.type, 'skill');
  });

  it('classifies cached plugin agents', () => {
    const result = classifySource('/home/user/.claude/plugins/cache/every-marketplace/compound-engineering/2.31.1/agents/architecture-strategist.md');
    assert.equal(result.src, 'compound-engineering');
    assert.equal(result.type, 'agent');
  });

  it('classifies cached plugin commands', () => {
    const result = classifySource('/home/user/.claude/plugins/cache/every-marketplace/compound-engineering/2.31.1/commands/plan.md');
    assert.equal(result.src, 'compound-engineering');
    assert.equal(result.type, 'cmd');
  });

  it('classifies user agents', () => {
    const result = classifySource('/home/user/.claude/agents/my-agent.md');
    assert.equal(result.src, 'user');
    assert.equal(result.type, 'agent');
  });

  it('classifies MCP servers', () => {
    const result = classifySource('mcp://brave-search');
    assert.equal(result.src, 'mcp-config');
    assert.equal(result.type, 'mcp');
  });
});

describe('SCAN_PATHS', () => {
  it('exports expected scan path patterns', () => {
    assert.ok(Array.isArray(SCAN_PATHS));
    assert.ok(SCAN_PATHS.length >= 6);
  });
});
