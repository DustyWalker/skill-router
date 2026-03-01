// tests/frontmatter.test.mjs
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseFrontmatter } from '../scripts/lib/frontmatter.mjs';

describe('parseFrontmatter', () => {
  it('extracts simple name and description', () => {
    const input = `---
name: my-skill
description: A simple skill
---
# Body`;
    const result = parseFrontmatter(input);
    assert.equal(result.name, 'my-skill');
    assert.equal(result.description, 'A simple skill');
  });

  it('handles quoted values', () => {
    const input = `---
name: "quoted-name"
description: 'single quoted desc'
---`;
    const result = parseFrontmatter(input);
    assert.equal(result.name, 'quoted-name');
    assert.equal(result.description, 'single quoted desc');
  });

  it('handles multiline description with pipe', () => {
    const input = `---
name: multi
description: |
  First line of description.
  Second line of description.
---`;
    const result = parseFrontmatter(input);
    assert.equal(result.name, 'multi');
    assert.equal(result.description, 'First line of description. Second line of description.');
  });

  it('handles multiline description with >', () => {
    const input = `---
name: folded
description: >
  This is a folded
  block scalar.
---`;
    const result = parseFrontmatter(input);
    assert.equal(result.description, 'This is a folded block scalar.');
  });

  it('extracts triggers array', () => {
    const input = `---
name: trigger-test
description: Has triggers
triggers:
  - "create a skill"
  - "make a new skill"
---`;
    const result = parseFrontmatter(input);
    assert.deepEqual(result.triggers, ['create a skill', 'make a new skill']);
  });

  it('extracts boundaries array', () => {
    const input = `---
name: boundary-test
description: Has boundaries
boundaries:
  - "NOT for: creating agents"
  - "PREFER over writing-skills when: interactive"
---`;
    const result = parseFrontmatter(input);
    assert.deepEqual(result.boundaries, ['NOT for: creating agents', 'PREFER over writing-skills when: interactive']);
  });

  it('extracts tags array', () => {
    const input = `---
name: tagged
description: Has tags
tags:
  - meta
  - routing
---`;
    const result = parseFrontmatter(input);
    assert.deepEqual(result.tags, ['meta', 'routing']);
  });

  it('returns null for missing frontmatter', () => {
    const input = `# No frontmatter here`;
    const result = parseFrontmatter(input);
    assert.equal(result, null);
  });

  it('returns null for empty name', () => {
    const input = `---
description: No name field
---`;
    const result = parseFrontmatter(input);
    assert.equal(result, null);
  });

  it('handles disable-model-invocation flag', () => {
    const input = `---
name: manual-only
description: Manual skill
disable-model-invocation: true
---`;
    const result = parseFrontmatter(input);
    assert.equal(result.manual_only, true);
  });

  it('preserves full description (no 140-char truncation)', () => {
    const desc = 'A '.repeat(100) + 'very long description';
    const input = `---
name: long-desc
description: ${desc}
---`;
    const result = parseFrontmatter(input);
    assert.equal(result.description, desc);
    assert.ok(result.description.length > 140);
  });
});
