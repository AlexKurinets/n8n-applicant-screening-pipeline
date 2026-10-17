'use strict';
// Recruiter-style Boolean screens, e.g.
//   ("registered nurse" OR RN) AND (ICU OR "critical care") AND license:TX AND years>=2 AND NOT "new grad"
// Operators are upper case, as in the job boards recruiters already use. Two
// terms side by side mean AND. Text terms match whole words in the resume and
// profile; a trailing * matches a prefix (nurs* matches nurse and nursing).
// Field terms test structured profile fields instead of free text.

class QueryError extends Error {
  constructor(message, position) {
    super(`[BOOLEAN_SYNTAX] ${message} at position ${position}`);
    this.name = 'QueryError';
    this.code = 'BOOLEAN_SYNTAX';
    this.position = position;
  }
}

const FIELDS = ['license', 'state', 'years', 'shift', 'specialty', 'doc'];
const NUMERIC_FIELDS = ['years'];

function tokenize(query) {
  const tokens = [];
  let i = 0;
  while (i < query.length) {
    const ch = query[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '(' || ch === ')') { tokens.push({ type: ch, pos: i }); i += 1; continue; }
    if (ch === '"') {
      const end = query.indexOf('"', i + 1);
      if (end === -1) throw new QueryError('unclosed quote', i);
      tokens.push({ type: 'phrase', value: query.slice(i + 1, end), pos: i });
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < query.length && !/[\s()"]/.test(query[j])) j += 1;
    const word = query.slice(i, j);
    if (word === 'AND' || word === 'OR' || word === 'NOT') tokens.push({ type: word, pos: i });
    else tokens.push({ type: 'word', value: word, pos: i });
    i = j;
  }
  return tokens;
}

function parseTerm(token) {
  const field = token.value.match(/^([a-z]+)(:|>=|<=|>|<|=)(.+)$/i);
  if (field && FIELDS.includes(field[1].toLowerCase())) {
    const name = field[1].toLowerCase();
    const op = field[2];
    const raw = field[3];
    if (NUMERIC_FIELDS.includes(name)) {
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new QueryError(`${name} needs a number`, token.pos);
      return { type: 'field', field: name, op: op === ':' ? '=' : op, value };
    }
    if (op !== ':') throw new QueryError(`${name} only supports ":"`, token.pos);
    return { type: 'field', field: name, op: ':', value: raw.toLowerCase() };
  }
  return { type: 'text', value: token.value, wildcard: token.value.endsWith('*') };
}

function parse(query) {
  const tokens = tokenize(query);
  let k = 0;
  const peek = () => tokens[k];
  const next = () => tokens[k++];

  function parseOr() {
    const children = [parseAnd()];
    while (peek() && peek().type === 'OR') { next(); children.push(parseAnd()); }
    return children.length === 1 ? children[0] : { type: 'or', children };
  }
  function parseAnd() {
    const children = [parseNot()];
    for (;;) {
      const t = peek();
      if (!t || t.type === 'OR' || t.type === ')') break;
      if (t.type === 'AND') next();
      children.push(parseNot());
    }
    return children.length === 1 ? children[0] : { type: 'and', children };
  }
  function parseNot() {
    if (peek() && peek().type === 'NOT') { next(); return { type: 'not', child: parseNot() }; }
    return parsePrimary();
  }
  function parsePrimary() {
    const t = next();
    if (!t) throw new QueryError('unexpected end of query', query.length);
    if (t.type === '(') {
      const inner = parseOr();
      const close = next();
      if (!close || close.type !== ')') throw new QueryError('missing )', close ? close.pos : query.length);
      return inner;
    }
    if (t.type === 'phrase') return { type: 'text', value: t.value, phrase: true, wildcard: false };
    if (t.type === 'word') return parseTerm(t);
    throw new QueryError(`unexpected ${t.type}`, t.pos);
  }

  if (!tokens.length) throw new QueryError('empty query', 0);
  const ast = parseOr();
  if (k < tokens.length) throw new QueryError(`unexpected ${tokens[k].type}`, tokens[k].pos);
  return ast;
}

function normalizeText(text) {
  return ` ${String(text).toLowerCase().replace(/[^a-z0-9+#*]+/g, ' ').trim()} `;
}

function render(node) {
  switch (node.type) {
    case 'text': return node.phrase ? `"${node.value}"` : node.value;
    case 'field': return node.op === ':' ? `${node.field}:${node.value.length === 2 ? node.value.toUpperCase() : node.value}` : `${node.field}${node.op}${node.value}`;
    case 'not': return `NOT ${render(node.child)}`;
    case 'and': return node.children.map((c) => (c.type === 'or' ? `(${render(c)})` : render(c))).join(' AND ');
    case 'or': return node.children.map(render).join(' OR ');
    default: return '?';
  }
}

function matchText(node, haystack) {
  const needle = normalizeText(node.value.replace(/\*$/, '')).trim();
  if (!needle) return false;
  if (node.wildcard) return new RegExp(`\\s${needle.replace(/[+#]/g, '\\$&')}[a-z0-9]*\\s`).test(haystack);
  return haystack.includes(` ${needle} `);
}

function matchField(node, fields) {
  const value = fields[node.field];
  if (node.field === 'years') {
    const n = Number(value);
    switch (node.op) {
      case '>=': return n >= node.value;
      case '<=': return n <= node.value;
      case '>': return n > node.value;
      case '<': return n < node.value;
      default: return n === node.value;
    }
  }
  const values = (Array.isArray(value) ? value : [value]).map((v) => String(v).toLowerCase());
  return values.includes(node.value);
}

// Returns { passed, matched, failed }. `failed` lists the top-level clauses
// that made the screen fail, rendered back as text a recruiter can read.
function evaluate(ast, { text, fields }) {
  const haystack = normalizeText(text);
  const matched = new Set();

  function ev(node) {
    switch (node.type) {
      case 'text': { const ok = matchText(node, haystack); if (ok) matched.add(render(node)); return ok; }
      case 'field': { const ok = matchField(node, fields); if (ok) matched.add(render(node)); return ok; }
      case 'not': return !ev(node.child);
      case 'and': { let ok = true; for (const c of node.children) ok = ev(c) && ok; return ok; }
      case 'or': { let ok = false; for (const c of node.children) ok = ev(c) || ok; return ok; }
      default: return false;
    }
  }

  const passed = ev(ast);
  const clauses = ast.type === 'and' ? ast.children : [ast];
  const failed = passed ? [] : clauses.filter((c) => !ev(c)).map((c) => (c.type === 'or' ? `(${render(c)})` : render(c)));
  return { passed, matched: [...matched], failed };
}

module.exports = { QueryError, tokenize, parse, evaluate, render, normalizeText };
