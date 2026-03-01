// scripts/lib/search.mjs
import { create, insert, search } from './vendor/orama.min.mjs';

const SCHEMA = {
  name: 'string',
  desc: 'string',
  tags: 'string[]',
  triggers: 'string[]',
};

const BOOST = {
  triggers: 3.0,
  tags: 2.0,
  name: 1.5,
  desc: 1.0,
};

export async function createSearchEngine(records) {
  const db = await create({ schema: SCHEMA, id: 'skill-router' });

  for (const rec of records) {
    await insert(db, {
      id: rec.id,
      name: rec.name,
      desc: rec.desc,
      tags: rec.tags || [],
      triggers: rec.triggers || [],
    });
  }

  return { db, records: new Map(records.map(r => [r.id, r])) };
}

export async function searchSkills(engine, query, opts = {}) {
  const { db, records: recordMap } = engine;
  const topN = opts.topN || 5;
  const ambient = opts.ambient || false;

  const raw = await search(db, {
    term: query,
    boost: BOOST,
    limit: topN + 5,
  });

  if (!raw.hits || raw.hits.length === 0) return [];

  let hits = raw.hits.map(h => {
    const hitId = h.id || (h.document && h.document.id);
    const rec = recordMap.get(hitId) || {};
    return {
      id: hitId,
      name: rec.name || hitId,
      desc: rec.desc || '',
      type: rec.type || 'skill',
      src: rec.src || 'unknown',
      path: rec.path || '',
      score: h.score,
      manual_only: rec.manual_only || false,
      confidence: 'LOW',
    };
  });

  if (ambient) {
    hits = hits.filter(h => !h.manual_only);
  }

  hits = hits.slice(0, topN);

  if (hits.length >= 2) {
    const gap = (hits[0].score - hits[1].score) / hits[0].score;
    hits[0].confidence = gap > 0.3 ? 'HIGH' : gap > 0.1 ? 'MED' : 'LOW';
    for (let i = 1; i < hits.length; i++) {
      hits[i].confidence = 'LOW';
    }
  } else if (hits.length === 1) {
    hits[0].confidence = 'HIGH';
  }

  return hits;
}
