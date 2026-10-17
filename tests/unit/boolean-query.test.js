'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parse, evaluate, QueryError } = require('../../src/lib/boolean-query');

const fields = { license: ['TX'], state: 'TX', years: 3, shift: 'nights', specialty: 'ICU', doc: ['resume', 'license'] };
const run = (q, text, f = fields) => evaluate(parse(q), { text, fields: f });

test('phrases, OR groups and implicit AND', () => {
  const q = '("registered nurse" OR RN) (ICU OR "critical care")';
  assert.equal(run(q, 'Registered nurse in a 24-bed ICU').passed, true);
  assert.equal(run(q, 'RN on a critical-care unit').passed, true);
  assert.equal(run(q, 'Registered nurse on telemetry').passed, false);
});

test('terms match whole words only, so RN does not match "turn" or "return"', () => {
  assert.equal(run('RN', 'Helped patients turn and return to the floor').passed, false);
  assert.equal(run('RN', 'Travel RN, nights').passed, true);
});

test('a trailing * matches a prefix', () => {
  assert.equal(run('obstetric*', 'Obstetrics and gynecology unit').passed, true);
  assert.equal(run('ventilator*', 'Managed ventilators overnight').passed, true);
  assert.equal(run('ventilator*', 'Managed vents overnight').passed, false);
});

test('punctuation is normalized on both sides, so "L&D" and "med surg" match their usual spellings', () => {
  assert.equal(run('"L&D"', 'Floated to L&D twice a week').passed, true);
  assert.equal(run('"med surg"', 'Med-Surg float pool').passed, true);
});

test('NOT excludes, and its failure is reported', () => {
  const r = run('RN AND NOT "new grad"', 'New grad RN residency');
  assert.equal(r.passed, false);
  assert.deepEqual(r.failed, ['NOT "new grad"']);
});

test('field terms test structured profile fields', () => {
  assert.equal(run('license:TX AND years>=2', '').passed, true);
  assert.equal(run('years>3', '').passed, false);
  assert.equal(run('years<=3 AND state:tx AND shift:nights AND doc:license', '').passed, true);
  assert.equal(run('license:compact', '', { ...fields, license: ['NM', 'compact'] }).passed, true);
});

test('failed clauses are the top-level AND terms that failed, rendered for recruiters', () => {
  const q = '("registered nurse" OR RN) AND (ICU OR "critical care") AND (license:TX OR license:compact) AND years>=2';
  const r = run(q, 'Registered nurse on telemetry', { ...fields, license: ['OK'], years: 1 });
  assert.deepEqual(r.failed, ['(ICU OR "critical care")', '(license:TX OR license:compact)', 'years>=2']);
  assert.ok(r.matched.includes('"registered nurse"'));
});

test('syntax errors are reported with a position, not evaluated', () => {
  assert.throws(() => parse('"registered nurse OR RN'), QueryError);
  assert.throws(() => parse('(ICU OR "critical care"'), /missing \)/);
  assert.throws(() => parse('years>=two'), /needs a number/);
  assert.throws(() => parse(''), /empty query/);
  assert.throws(() => parse('ICU )'), /unexpected \)/);
});

test('operators must be upper case; lower-case "and" is just a word', () => {
  assert.equal(run('ICU and trauma', 'ICU nurse').passed, false);
  assert.equal(run('ICU and trauma', 'ICU and trauma nurse').passed, true);
});
