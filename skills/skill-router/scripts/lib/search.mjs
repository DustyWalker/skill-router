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

// Fix 2: Minimum absolute score thresholds for confidence levels.
// Prevents false HIGH/MED on weak keyword-coincidence matches.
// Calibrated against real query data: genuine matches score 30-50+,
// cross-domain false positives score 5-15.
const MIN_SCORE_HIGH = 15.0;
const MIN_SCORE_MED = 5.0;

// Fix 1: Penalty multiplier per boundary hit.
// Applied when query tokens overlap with a skill's boundary keywords.
const BOUNDARY_PENALTY = 0.3;

// Stopwords to ignore during boundary keyword extraction
const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
  'of', 'is', 'it', 'not', 'use', 'with', 'this', 'that', 'from',
]);

/**
 * Extract meaningful keywords from boundary strings.
 * Boundaries use format: "NOT for: X (use Y)" — extracts words from X.
 * Returns array of { keywords: string[] } per boundary.
 */
function parseBoundaries(boundaries) {
  if (!boundaries || boundaries.length === 0) return [];
  return boundaries.map(b => {
    const cleaned = b
      .replace(/^NOT\s+for:\s*/i, '')
      .replace(/\(use\s+[^)]+\)/gi, '')
      .trim()
      .toLowerCase();
    const keywords = cleaned
      .split(/[\s,]+/)
      .filter(w => w.length > 2 && !STOPWORDS.has(w));
    return { keywords };
  });
}

/**
 * Calculate boundary penalty for a hit.
 * Requires 2+ keyword overlap from any single boundary to trigger penalty.
 * This prevents single-word false matches (e.g., "skill" appearing everywhere).
 */
function calcBoundaryPenalty(queryTokens, parsedBoundaries) {
  if (parsedBoundaries.length === 0) return 1.0;

  let penalty = 1.0;
  for (const { keywords } of parsedBoundaries) {
    if (keywords.length === 0) continue;
    let overlap = 0;
    for (const kw of keywords) {
      if (queryTokens.some(qt => qt === kw || qt.includes(kw) || kw.includes(qt))) {
        overlap++;
      }
    }
    // Require 2+ keyword matches from a single boundary to trigger penalty
    // (1 keyword for boundaries with only 1 keyword)
    const threshold = keywords.length === 1 ? 1 : 2;
    if (overlap >= threshold) {
      penalty *= BOUNDARY_PENALTY;
    }
  }
  return penalty;
}

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

  const queryTokens = query.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));

  let hits = raw.hits.map(h => {
    const hitId = h.id || (h.document && h.document.id);
    const rec = recordMap.get(hitId) || {};
    let score = h.score;

    // Fix 1: Boundary penalty — reduce score when query overlaps boundaries
    const parsedBounds = parseBoundaries(rec.boundaries);
    const penalty = calcBoundaryPenalty(queryTokens, parsedBounds);
    score *= penalty;

    return {
      id: hitId,
      name: rec.name || hitId,
      desc: rec.desc || '',
      type: rec.type || 'skill',
      src: rec.src || 'unknown',
      path: rec.path || '',
      score,
      manual_only: rec.manual_only || false,
      confidence: 'LOW',
    };
  });

  if (ambient) {
    hits = hits.filter(h => !h.manual_only);
  }

  // Re-sort after boundary penalty adjustments
  hits.sort((a, b) => b.score - a.score);
  hits = hits.slice(0, topN);

  // Fix 2: Confidence with absolute score thresholds
  if (hits.length >= 2) {
    const gap = (hits[0].score - hits[1].score) / hits[0].score;
    if (hits[0].score >= MIN_SCORE_HIGH && gap > 0.3) {
      hits[0].confidence = 'HIGH';
    } else if (hits[0].score >= MIN_SCORE_MED && gap > 0.1) {
      hits[0].confidence = 'MED';
    }
    // All other hits stay LOW
  } else if (hits.length === 1) {
    hits[0].confidence = hits[0].score >= MIN_SCORE_HIGH ? 'HIGH' :
                         hits[0].score >= MIN_SCORE_MED ? 'MED' : 'LOW';
  }

  return hits;
}

// Exported for testing
export { parseBoundaries, calcBoundaryPenalty, MIN_SCORE_HIGH, MIN_SCORE_MED, BOUNDARY_PENALTY };
