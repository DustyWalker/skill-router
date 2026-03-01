// tests/search.test.mjs
import { describe, it, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { createSearchEngine, searchSkills } from '../scripts/lib/search.mjs';

const TEST_RECORDS = [
  { id: 'finishing-branch', src: 'superpowers', type: 'skill', name: 'finishing-a-development-branch', desc: 'Use when implementation is complete, all tests pass, and you need to decide how to integrate', tags: ['git', 'deployment'], triggers: ['deploy to production', 'ship it', 'merge branch'], boundaries: [], path: '/test/a', manual_only: false },
  { id: 'verification', src: 'superpowers', type: 'skill', name: 'verification-before-completion', desc: 'Use when about to claim work is complete, fixed, or passing, before committing', tags: ['testing', 'quality'], triggers: ['verify my work', 'check before commit'], boundaries: [], path: '/test/b', manual_only: false },
  { id: 'code-review', src: 'superpowers', type: 'agent', name: 'code-reviewer', desc: 'Use this agent when a major project step has been completed and needs to be reviewed', tags: ['review'], triggers: ['review my code', 'code review'], boundaries: ['NOT for: security audits (use security-sentinel)'], path: '/test/c', manual_only: false },
  { id: 'frontend-design', src: 'superpowers', type: 'skill', name: 'frontend-design', desc: 'Create distinctive, production-grade frontend interfaces with high visual polish', tags: ['ui', 'design', 'frontend'], triggers: ['design a UI', 'build a component', 'create interface'], boundaries: ['NOT for: backend APIs'], path: '/test/d', manual_only: false },
  { id: 'security-sentinel', src: 'compound', type: 'agent', name: 'security-sentinel', desc: 'Performs security audits for vulnerabilities, input validation, auth/authz', tags: ['security'], triggers: ['security audit', 'check for vulnerabilities'], boundaries: [], path: '/test/e', manual_only: false },
  { id: 'manual-skill', src: 'user', type: 'skill', name: 'manual-only-skill', desc: 'This skill should only be invoked manually', tags: [], triggers: [], boundaries: [], path: '/test/f', manual_only: true },
];

describe('searchSkills', () => {
  let engine;

  before(async () => {
    engine = await createSearchEngine(TEST_RECORDS);
  });

  it('returns ranked results for "deploy to production"', async () => {
    const results = await searchSkills(engine, 'deploy to production');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, 'finishing-branch');
  });

  it('returns ranked results for "design a UI"', async () => {
    const results = await searchSkills(engine, 'design a UI');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, 'frontend-design');
  });

  it('returns security-sentinel for "security audit"', async () => {
    const results = await searchSkills(engine, 'security audit');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, 'security-sentinel');
  });

  it('includes confidence scores', async () => {
    const results = await searchSkills(engine, 'deploy to production');
    assert.ok(results[0].score > 0);
    assert.ok(results[0].confidence);
    assert.ok(['HIGH', 'MED', 'LOW'].includes(results[0].confidence));
  });

  it('respects top-N limit', async () => {
    const results = await searchSkills(engine, 'code', { topN: 2 });
    assert.ok(results.length <= 2);
  });

  it('excludes manual_only from ambient queries', async () => {
    const results = await searchSkills(engine, 'manual', { ambient: true });
    const ids = results.map(r => r.id);
    assert.ok(!ids.includes('manual-skill'));
  });

  it('includes manual_only in explicit queries', async () => {
    const results = await searchSkills(engine, 'manual only skill', { ambient: false });
    const hasManual = results.some(r => r.id === 'manual-skill');
    assert.ok(hasManual);
  });

  it('returns empty array for zero matches', async () => {
    const results = await searchSkills(engine, 'zzzzxyznonexistent');
    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
  });
});
