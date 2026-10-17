'use strict';
// Code node "Validate and score".
// Checks the model reply against model_output.v1, then grounds every quote:
// a rating counts only if its evidence appears verbatim in the masked resume
// the model was shown. The score and band are computed here, not by the model.
const { assertValid } = require('../lib/contract');
const { modelOutputV1, screeningV1 } = require('../lib/schemas');
const { isGrounded, computeScore, bandFor } = require('../lib/scoring');

function fail(message) {
  throw new Error(`[MODEL_CONTRACT_VIOLATION] ${message}`);
}

function run(items, ctx) {
  const res = items[0].json;
  const req = ctx.node('Build scoring request');
  const settings = ctx.node('Load settings').settings;

  if (res.stop_reason === 'refusal') {
    return [{ json: { refusal: true, screening: null, usage: res.usage || null } }];
  }
  if (res.stop_reason === 'max_tokens') {
    throw new Error('[MODEL_TRUNCATED] the reply hit max_tokens before the JSON was complete');
  }

  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    fail(`reply is not JSON (${e.message})`);
  }
  assertValid(modelOutputV1, parsed, 'model_output.v1', 'MODEL_CONTRACT_VIOLATION');

  const byId = new Map();
  for (const r of parsed.criteria) {
    if (byId.has(r.id)) fail(`criterion ${r.id} rated twice`);
    byId.set(r.id, r);
  }
  const expected = req.criteria.map((c) => c.id);
  const missing = expected.filter((id) => !byId.has(id));
  const extra = [...byId.keys()].filter((id) => !expected.includes(id));
  if (missing.length || extra.length) fail(`criteria mismatch, missing [${missing}] unexpected [${extra}]`);

  const criteria = req.criteria.map((c) => {
    const r = byId.get(c.id);
    const grounded = r.rating === 0 || isGrounded(r.evidence, req.model_text);
    return { id: c.id, text: c.text, weight: c.weight, must_have: c.must_have, rating: grounded ? r.rating : 0, evidence: r.evidence, grounded };
  });

  const score = computeScore(criteria);
  const mustHaveGaps = criteria.filter((c) => c.must_have && c.rating === 0).map((c) => c.id);
  const screening = {
    score,
    band: bandFor(score, mustHaveGaps, settings.thresholds),
    criteria,
    ungrounded: criteria.filter((c) => !c.grounded).length,
    must_have_gaps: mustHaveGaps,
    summary: parsed.summary,
    concerns: parsed.concerns,
    model: res.model || settings.model,
    prompt_version: req.prompt_version,
  };
  assertValid(screeningV1, screening, 'screening.v1');
  return [{ json: { refusal: false, screening, usage: res.usage || null } }];
}

module.exports = { run };
