'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { validate, assertValid, toApiSchema, ContractError } = require('../../src/lib/contract');
const { modelOutputV1, applicationV1 } = require('../../src/lib/schemas');
const { maskForModel } = require('../../src/lib/pii');
const { isGrounded, computeScore, bandFor } = require('../../src/lib/scoring');
const { sha256Hex } = require('../../src/lib/sha256');

test('contract: reports every violation with a JSON pointer path', () => {
  const errors = validate(modelOutputV1, { criteria: [{ id: 'x1', rating: 5, evidence: 1 }], summary: 'short', extra: true });
  const paths = errors.map((e) => e.path);
  assert.ok(paths.includes('/criteria/0/id'), 'pattern');
  assert.ok(paths.includes('/criteria/0/rating'), 'maximum');
  assert.ok(paths.includes('/criteria/0/evidence'), 'type');
  assert.ok(paths.includes('/summary'), 'minLength');
  assert.ok(paths.includes('/concerns'), 'required');
  assert.ok(paths.includes('/extra'), 'additionalProperties');
});

test('contract: assertValid throws a coded ContractError', () => {
  assert.throws(() => assertValid(applicationV1, {}, 'application.v1', 'PORTAL_CONTRACT_VIOLATION'), (e) => {
    assert.ok(e instanceof ContractError);
    assert.equal(e.code, 'PORTAL_CONTRACT_VIOLATION');
    assert.match(e.message, /^\[PORTAL_CONTRACT_VIOLATION\] application\.v1: /);
    return true;
  });
});

test('contract: the API schema keeps structure and drops range and length keywords', () => {
  const api = toApiSchema(modelOutputV1);
  const text = JSON.stringify(api);
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', '$id']) assert.ok(!text.includes(`"${k}"`), k);
  assert.equal(api.additionalProperties, false);
  assert.deepEqual(api.properties.criteria.items.required, ['id', 'rating', 'evidence']);
});

test('masking removes contact details, address lines and every part of the name', () => {
  const text = [
    "Siobhán O'Connell-Núñez",
    'Larkfield, NM · siobhan.oc@example.com · (555) 555-0142 · 555-0142',
    '2210 Juniper Lane, Larkfield, NM',
    'DOB: 1990-01-01',
    'Portfolio: https://example.com/siobhan',
    "Siobhán precepted new hires. O'Connell-Núñez led the falls committee.",
    'Managed ventilated patients and titrated vasoactive drips under unit protocols.',
  ].join('\n');
  const { text: out, masked } = maskForModel(text, "Siobhán O'Connell-Núñez");
  for (const leaked of ['Siobhán', "O'Connell", 'Núñez', 'example.com', '555-0142', 'Juniper', '1990']) assert.ok(!out.includes(leaked), leaked);
  assert.ok(out.includes('Managed ventilated patients and titrated vasoactive drips under unit protocols.'));
  assert.ok(masked.email >= 1 && masked.phone >= 2 && masked.address === 1 && masked.name >= 3);
});

test('grounding accepts verbatim quotes despite case, spacing and curly quotes, and rejects paraphrase', () => {
  const resume = 'Experience\n- Managed  ventilated patients and titrated vasoactive drips under "unit protocols".';
  assert.equal(isGrounded('managed ventilated patients and titrated vasoactive drips under “unit protocols”.', resume), true);
  assert.equal(isGrounded('Has managed ventilated patients and titrated vasoactive drips', resume), false);
  assert.equal(isGrounded('Managed', resume), false, 'too short to count as evidence');
});

test('score is the weighted share of the maximum rating, and a must-have gap blocks the shortlist', () => {
  const criteria = [
    { weight: 3, rating: 3 }, { weight: 3, rating: 3 }, { weight: 2, rating: 2 }, { weight: 1, rating: 0 },
  ];
  assert.equal(computeScore(criteria), Math.round((100 * (9 + 9 + 4)) / 27));
  const t = { shortlist: 75, review: 50 };
  assert.equal(bandFor(81, [], t), 'Shortlisted');
  assert.equal(bandFor(81, ['c2'], t), 'Recruiter review');
  assert.equal(bandFor(50, [], t), 'Recruiter review');
  assert.equal(bandFor(49, [], t), 'Low match');
});

test('sha256 matches node:crypto, including non-ASCII text', () => {
  for (const s of ['', 'abc', 'Siobhán Ortega-Dunmore', 'x'.repeat(1000), '🩺 ICU']) {
    assert.equal(sha256Hex(s), crypto.createHash('sha256').update(s, 'utf8').digest('hex'));
  }
});
