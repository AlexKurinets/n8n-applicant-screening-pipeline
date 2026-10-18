'use strict';
// Structural checks on the exported n8n workflows: every connection, node
// reference, sub-workflow and credential they mention exists, the Code nodes
// are in step with src/, and the bundled Code node actually runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', '..', 'workflows');
const workflows = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
const byId = new Map(workflows.map((w) => [w.id, w]));
const credentials = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'n8n', 'credentials.json'), 'utf8'));

test('seven workflows with unique ids and names', () => {
  assert.equal(workflows.length, 7);
  assert.equal(new Set(workflows.map((w) => w.id)).size, 7);
  assert.equal(new Set(workflows.map((w) => w.name)).size, 7);
});

for (const wf of workflows) {
  test(`${wf.file}: connections, node references and credentials resolve`, () => {
    const names = new Set(wf.nodes.map((n) => n.name));
    assert.equal(names.size, wf.nodes.length, 'node names are unique');
    for (const [from, { main }] of Object.entries(wf.connections)) {
      assert.ok(names.has(from), `connection from unknown node ${from}`);
      for (const branch of main) for (const c of branch) assert.ok(names.has(c.node), `${from} -> unknown ${c.node}`);
    }
    const text = JSON.stringify(wf.nodes.filter((n) => n.type !== 'n8n-nodes-base.code').map((n) => n.parameters));
    for (const m of text.matchAll(/\$\('([^']+)'\)/g)) assert.ok(names.has(m[1]), `expression references missing node "${m[1]}"`);
    for (const n of wf.nodes) {
      for (const [type, ref] of Object.entries(n.credentials || {})) {
        assert.ok(credentials.some((c) => c.id === ref.id && c.type === type && c.name === ref.name), `${n.name}: credential ${ref.id}`);
      }
      if (n.type === 'n8n-nodes-base.executeWorkflow') assert.ok(byId.has(n.parameters.workflowId.value), `${n.name}: sub-workflow`);
    }
  });
}

test('Code nodes reference only nodes that exist in their workflow', () => {
  for (const wf of workflows) {
    const names = new Set(wf.nodes.map((n) => n.name));
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) {
      const source = n.parameters.jsCode.split('\n', 1)[0].match(/src\/code-nodes\/[\w-]+\.js/)[0];
      const code = fs.readFileSync(path.join(__dirname, '..', '..', source), 'utf8');
      for (const m of code.matchAll(/ctx\.(?:node|executed)\('([^']+)'\)/g)) assert.ok(names.has(m[1]), `${wf.file} / ${n.name}: ${m[1]}`);
      const opts = n.parameters.jsCode.split('\n', 1)[0].match(/(\{.*\})$/);
      if (opts && JSON.parse(opts[1]).intakeNode) assert.ok(names.has(JSON.parse(opts[1]).intakeNode));
    }
  }
});

test('screening: every HTTP step retries and routes its final failure to a raise-step-error node', () => {
  const wf = byId.get('ScrApp0000000001');
  const raisers = new Set(wf.nodes.filter((n) => n.type === 'n8n-nodes-base.code' && n.parameters.jsCode.startsWith('// source: src/code-nodes/raise-step-error.js')).map((n) => n.name));
  assert.equal(raisers.size, 4);
  const http = wf.nodes.filter((n) => n.type === 'n8n-nodes-base.httpRequest' && n.name !== 'Write status to portal');
  assert.ok(http.length >= 9);
  for (const n of http) {
    assert.equal(n.retryOnFail, true, n.name);
    assert.equal(n.onError, 'continueErrorOutput', n.name);
    assert.ok(wf.connections[n.name].main[1].every((c) => raisers.has(c.node)), n.name);
  }
});

test('intake and replay workflows catch screening failures and name the error handler', () => {
  for (const id of ['IntakeImap000001', 'IntakeSweep00001', 'ReplayDeadLetter']) {
    const wf = byId.get(id);
    assert.equal(wf.settings.errorWorkflow, 'ErrorHandler0001', id);
    const call = wf.nodes.find((n) => n.name === 'Screen application');
    assert.equal(call.onError, 'continueErrorOutput', id);
    assert.ok(wf.connections['Screen application'].main[1].length, `${id}: error branch wired`);
  }
});

test('no workflow reads environment variables, and none hard-codes a service URL', () => {
  for (const wf of workflows) {
    const text = JSON.stringify(wf.nodes.map((n) => n.parameters));
    assert.ok(!text.includes('$env'), wf.file);
    assert.ok(!/https?:\/\/(portal|docsvc|fake-llm|api\.anthropic)/.test(text), wf.file);
  }
});

test('the Code nodes match src/code-nodes (what the tests run is what n8n runs)', () => {
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'sync-code-nodes.mjs'), '--check'], { encoding: 'utf8' });
  assert.match(out, /Code nodes match/);
});

test('a bundled Code node runs in a Code-node-like scope', () => {
  const wf = byId.get('ScrApp0000000001');
  const jsCode = wf.nodes.find((n) => n.name === 'Check session again').parameters.jsCode;
  const fn = new Function('$', '$input', '$execution', '$prevNode', jsCode);
  const input = { all: () => [{ json: { data: '<body data-page="application-detail">x</body>' } }] };
  const out = fn(() => ({ first: () => ({ json: {} }), isExecuted: false }), input, { id: '1' }, { name: 'Refetch application page' });
  assert.equal(out[0].json.state, 'ok');
  const login = { all: () => [{ json: { data: '<body data-page="login">' } }] };
  assert.throws(() => fn(() => ({}), login, { id: '1' }, null), /\[SESSION_EXPIRED\]/, 'the {"strict": true} option from the header is applied');
});

test('a Code node error names the node it came from', () => {
  const wf = byId.get('ScrApp0000000001');
  const jsCode = wf.nodes.find((n) => n.name === 'Check session again').parameters.jsCode;
  const fn = new Function('$', '$input', '$execution', '$prevNode', jsCode);
  const login = { all: () => [{ json: { data: '<body data-page="login">' } }] };
  assert.throws(() => fn(() => ({}), login, { id: '1' }, null), /^Error: \[SESSION_EXPIRED\] \(node: Check session again\) /);
});

test('an application with an open dead letter is parked until a replay', () => {
  const screen = byId.get('ScrApp0000000001');
  const claim = screen.nodes.find((n) => n.name === 'Claim run').parameters.query;
  assert.match(claim, /from dead_letters\s+where application_id = \$1 and replayed_at is null and \$2 <> 'replay'/);
  assert.match(claim, /then 'parked'/);
  const sweep = byId.get('IntakeSweep00001');
  const unclaimed = sweep.nodes.find((n) => n.name === 'Skip claimed').parameters.query;
  assert.match(unclaimed, /from dead_letters d where d\.application_id = t\.app_id and d\.replayed_at is null/);
  const replay = byId.get('ReplayDeadLetter');
  assert.deepEqual(replay.connections['Record failure'].main[0].map((c) => c.node), ['Close old dead letter']);
});
