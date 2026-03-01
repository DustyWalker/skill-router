// tests/integration.test.mjs
import { describe, it, before } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildIndex } from '../scripts/lib/indexer.mjs';
import { createSearchEngine, searchSkills } from '../scripts/lib/search.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');
const INDEX_PATH = join(DATA_DIR, 'skills.jsonl');

describe('Integration: full index + search pipeline', () => {
  let records;

  before(async () => {
    const result = buildIndex({ force: true, dataDir: DATA_DIR });
    records = result.records;
    assert.ok(records, 'Index build should return records');
    assert.ok(records.length > 100, `Expected 100+ items, got ${records.length}`);
  });

  it('indexes at least 100 items', () => {
    assert.ok(records.length >= 100, `Expected >=100 items, got ${records.length}`);
  });

  it('JSONL file is valid', () => {
    assert.ok(existsSync(INDEX_PATH));
    const lines = readFileSync(INDEX_PATH, 'utf-8').trim().split('\n');
    const meta = JSON.parse(lines[0]);
    assert.ok(meta._meta);
    assert.equal(meta.version, 1);
    assert.ok(meta.item_count > 100);
    for (let i = 1; i < lines.length; i++) {
      JSON.parse(lines[i]);
    }
  });

  it('search returns relevant results for "deploy"', async () => {
    const engine = await createSearchEngine(records);
    const results = await searchSkills(engine, 'deploy to production');
    assert.ok(results.length > 0);
    const top3 = results.slice(0, 3).map(r => r.id);
    assert.ok(
      top3.some(id => id.includes('finishing') || id.includes('deploy')),
      `Expected deploy-related skill in top 3, got: ${top3.join(', ')}`
    );
  });

  it('search returns relevant results for "create a skill"', async () => {
    const engine = await createSearchEngine(records);
    const results = await searchSkills(engine, 'create a skill');
    assert.ok(results.length > 0);
    const topNames = results.slice(0, 5).map(r => r.name);
    assert.ok(
      topNames.some(n => n.toLowerCase().includes('skill')),
      `Expected skill-related item in top 5, got: ${topNames.join(', ')}`
    );
  });

  it('full descriptions preserved (no 140-char truncation)', () => {
    const longDescs = records.filter(r => r.desc.length > 140);
    assert.ok(longDescs.length > 0, 'Should have at least some descriptions > 140 chars');
  });
});
