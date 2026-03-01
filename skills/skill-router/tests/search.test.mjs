// tests/search.test.mjs
import { describe, it, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { createSearchEngine, searchSkills, parseBoundaries, calcBoundaryPenalty, MIN_SCORE_HIGH, MIN_SCORE_MED } from '../scripts/lib/search.mjs';

const TEST_RECORDS = [
  { id: 'finishing-branch', src: 'superpowers', type: 'skill', name: 'finishing-a-development-branch', desc: 'Use when implementation is complete, all tests pass, and you need to decide how to integrate', tags: ['git', 'deployment'], triggers: ['deploy to production', 'ship it', 'merge branch'], boundaries: [], path: '/test/a', manual_only: false },
  { id: 'verification', src: 'superpowers', type: 'skill', name: 'verification-before-completion', desc: 'Use when about to claim work is complete, fixed, or passing, before committing', tags: ['testing', 'quality'], triggers: ['verify my work', 'check before commit'], boundaries: [], path: '/test/b', manual_only: false },
  { id: 'code-review', src: 'superpowers', type: 'agent', name: 'code-reviewer', desc: 'Use this agent when a major project step has been completed and needs to be reviewed', tags: ['review'], triggers: ['review my code', 'code review'], boundaries: ['NOT for: security audits (use security-sentinel)'], path: '/test/c', manual_only: false },
  { id: 'frontend-design', src: 'superpowers', type: 'skill', name: 'frontend-design', desc: 'Create distinctive, production-grade frontend interfaces with high visual polish', tags: ['ui', 'design', 'frontend'], triggers: ['design a UI', 'build a component', 'create interface'], boundaries: ['NOT for: backend APIs', 'NOT for: database schemas'], path: '/test/d', manual_only: false },
  { id: 'security-sentinel', src: 'compound', type: 'agent', name: 'security-sentinel', desc: 'Performs security audits for vulnerabilities, input validation, auth/authz', tags: ['security'], triggers: ['security audit', 'check for vulnerabilities'], boundaries: [], path: '/test/e', manual_only: false },
  { id: 'manual-skill', src: 'user', type: 'skill', name: 'manual-only-skill', desc: 'This skill should only be invoked manually', tags: [], triggers: [], boundaries: [], path: '/test/f', manual_only: true },
];

describe('parseBoundaries', () => {
  it('returns empty array for no boundaries', () => {
    assert.deepEqual(parseBoundaries([]), []);
    assert.deepEqual(parseBoundaries(null), []);
    assert.deepEqual(parseBoundaries(undefined), []);
  });

  it('extracts keywords from boundary strings', () => {
    const result = parseBoundaries(['NOT for: security audits (use security-sentinel)']);
    assert.equal(result.length, 1);
    assert.ok(result[0].keywords.includes('security'));
    assert.ok(result[0].keywords.includes('audits'));
  });

  it('strips stopwords', () => {
    const result = parseBoundaries(['NOT for: the backend APIs']);
    assert.equal(result.length, 1);
    assert.ok(!result[0].keywords.includes('the'));
    assert.ok(result[0].keywords.includes('backend'));
    assert.ok(result[0].keywords.includes('apis'));
  });

  it('handles multiple boundaries', () => {
    const result = parseBoundaries([
      'NOT for: backend APIs',
      'NOT for: database schemas',
    ]);
    assert.equal(result.length, 2);
  });
});

describe('calcBoundaryPenalty', () => {
  it('returns 1.0 when no boundaries', () => {
    const penalty = calcBoundaryPenalty(['backend', 'api'], []);
    assert.equal(penalty, 1.0);
  });

  it('returns 1.0 when no overlap', () => {
    const parsed = parseBoundaries(['NOT for: security audits']);
    const penalty = calcBoundaryPenalty(['backend', 'database'], parsed);
    assert.equal(penalty, 1.0);
  });

  it('applies penalty when 2+ keywords overlap from single boundary', () => {
    const parsed = parseBoundaries(['NOT for: security audits vulnerabilities']);
    const penalty = calcBoundaryPenalty(['security', 'audits', 'code'], parsed);
    assert.ok(penalty < 1.0, `Expected penalty < 1.0, got ${penalty}`);
  });

  it('requires 2+ overlap for multi-keyword boundaries', () => {
    const parsed = parseBoundaries(['NOT for: security audits vulnerabilities']);
    // Only 1 keyword overlaps — should NOT trigger penalty
    const penalty = calcBoundaryPenalty(['security', 'backend', 'code'], parsed);
    assert.equal(penalty, 1.0);
  });

  it('triggers penalty with 1 overlap for single-keyword boundaries', () => {
    const parsed = parseBoundaries(['NOT for: backend']);
    const penalty = calcBoundaryPenalty(['backend', 'api'], parsed);
    assert.ok(penalty < 1.0, `Expected penalty < 1.0 for single-keyword boundary, got ${penalty}`);
  });
});

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

  // Fix 1: Boundary penalty tests
  it('penalizes code-review for "security audit" query (boundary overlap)', async () => {
    const results = await searchSkills(engine, 'security audit');
    const codeReview = results.find(r => r.id === 'code-review');
    const sentinel = results.find(r => r.id === 'security-sentinel');
    // security-sentinel should rank above code-review since code-review
    // has boundary "NOT for: security audits"
    assert.ok(sentinel, 'security-sentinel should be in results');
    if (codeReview) {
      assert.ok(sentinel.score > codeReview.score,
        `sentinel (${sentinel.score}) should outscore code-review (${codeReview.score})`);
    }
  });

  it('penalizes frontend-design for "backend API database" query', async () => {
    const results = await searchSkills(engine, 'backend API database schema');
    const frontend = results.find(r => r.id === 'frontend-design');
    if (frontend) {
      // frontend-design has boundaries for backend APIs and database schemas
      // So its score should be penalized
      assert.ok(frontend.confidence !== 'HIGH',
        'frontend-design should not be HIGH for backend query');
    }
  });

  // Fix 2: Absolute threshold tests
  it('does not give HIGH confidence for low absolute scores', async () => {
    // With a small test dataset, scores tend to be low.
    // A result must exceed MIN_SCORE_HIGH to be HIGH.
    const results = await searchSkills(engine, 'some vague query about things');
    for (const r of results) {
      if (r.confidence === 'HIGH') {
        assert.ok(r.score >= MIN_SCORE_HIGH,
          `HIGH confidence requires score >= ${MIN_SCORE_HIGH}, got ${r.score}`);
      }
      if (r.confidence === 'MED') {
        assert.ok(r.score >= MIN_SCORE_MED,
          `MED confidence requires score >= ${MIN_SCORE_MED}, got ${r.score}`);
      }
    }
  });

  it('re-sorts results after boundary penalty', async () => {
    const results = await searchSkills(engine, 'security audit vulnerabilities');
    // Results should be sorted by score descending after penalties
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score,
        `Results not sorted: [${i-1}]=${results[i-1].score} < [${i}]=${results[i].score}`);
    }
  });
});
