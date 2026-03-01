// tests/indexer.test.mjs
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildRecord, dedup } from '../scripts/lib/indexer.mjs';

describe('buildRecord', () => {
  it('creates a record from frontmatter and file info', () => {
    const fm = {
      name: 'Test Skill',
      description: 'A test skill description',
      tags: ['testing'],
      triggers: ['run tests'],
      boundaries: ['NOT for: deployment'],
      manual_only: false,
    };
    const fileInfo = { path: '/home/user/.claude/skills/test/SKILL.md', src: 'user', type: 'skill' };
    const record = buildRecord(fm, fileInfo);
    assert.equal(record.id, 'test-skill');
    assert.equal(record.name, 'Test Skill');
    assert.equal(record.desc, 'A test skill description');
    assert.equal(record.src, 'user');
    assert.equal(record.type, 'skill');
    assert.deepEqual(record.tags, ['testing']);
    assert.deepEqual(record.triggers, ['run tests']);
    assert.ok(record.path.endsWith('SKILL.md'));
    assert.equal(record.manual_only, false);
  });
});

describe('dedup', () => {
  it('keeps entry with longer description on name collision', () => {
    const records = [
      { id: 'dup', name: 'Dup', desc: 'short', src: 'plugin', type: 'skill', path: '/a' },
      { id: 'dup', name: 'Dup', desc: 'a much longer and more detailed description', src: 'user', type: 'skill', path: '/b' },
    ];
    const result = dedup(records);
    assert.equal(result.length, 1);
    assert.equal(result[0].desc, 'a much longer and more detailed description');
  });

  it('prefers user source over plugin on tie', () => {
    const records = [
      { id: 'dup', name: 'Dup', desc: 'same length desc!', src: 'plugin', type: 'skill', path: '/a' },
      { id: 'dup', name: 'Dup', desc: 'same length desc!', src: 'user', type: 'skill', path: '/b' },
    ];
    const result = dedup(records);
    assert.equal(result.length, 1);
    assert.equal(result[0].src, 'user');
  });

  it('keeps distinct entries', () => {
    const records = [
      { id: 'a', name: 'A', desc: 'desc a', src: 'user', type: 'skill', path: '/a' },
      { id: 'b', name: 'B', desc: 'desc b', src: 'user', type: 'skill', path: '/b' },
    ];
    const result = dedup(records);
    assert.equal(result.length, 2);
  });
});
