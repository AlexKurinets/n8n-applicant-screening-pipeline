'use strict';
// A small JSON Schema subset validator. It runs inside n8n Code nodes, where
// npm packages are not available, so it is dependency free. It supports the
// keywords the contracts in schemas.js use and nothing else.

class ContractError extends Error {
  constructor(code, contract, errors) {
    const first = errors.slice(0, 3).map((e) => `${e.path || '/'} ${e.message}`).join('; ');
    super(`[${code}] ${contract}: ${first}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}`);
    this.name = 'ContractError';
    this.code = code;
    this.contract = contract;
    this.errors = errors;
  }
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function typeMatches(expected, actual) {
  if (expected === actual) return true;
  return expected === 'number' && actual === 'integer';
}

function validate(schema, value, path = '', errors = []) {
  const actual = typeOf(value);

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(t, actual))) {
      errors.push({ path, message: `must be ${types.join(' or ')}, got ${actual}` });
      return errors;
    }
  }
  if ('const' in schema && value !== schema.const) {
    errors.push({ path, message: `must equal ${JSON.stringify(schema.const)}` });
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({ path, message: `must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}` });
  }

  if (actual === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: `must be at least ${schema.minLength} characters` });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path, message: `must be at most ${schema.maxLength} characters` });
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path, message: `must match ${schema.pattern}` });
    }
  }

  if (actual === 'integer' || actual === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, message: `must be >= ${schema.minimum}` });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path, message: `must be <= ${schema.maximum}` });
    }
  }

  if (actual === 'array') {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: `must have at least ${schema.minItems} items` });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: `must have at most ${schema.maxItems} items` });
    }
    if (schema.items) value.forEach((item, i) => validate(schema.items, item, `${path}/${i}`, errors));
  }

  if (actual === 'object') {
    const props = schema.properties || {};
    for (const key of schema.required || []) {
      if (!(key in value) || value[key] === undefined) errors.push({ path: `${path}/${key}`, message: 'is required' });
    }
    for (const [key, child] of Object.entries(value)) {
      if (props[key]) validate(props[key], child, `${path}/${key}`, errors);
      else if (schema.additionalProperties === false) errors.push({ path: `${path}/${key}`, message: 'is not allowed' });
    }
  }
  return errors;
}

function assertValid(schema, value, contract, code = 'CONTRACT_VIOLATION') {
  const errors = validate(schema, value);
  if (errors.length) throw new ContractError(code, contract, errors);
  return value;
}

// Structured outputs accept the structural part of JSON Schema but not range or
// length keywords. The API gets the structure; assertValid enforces the rest.
const API_UNSUPPORTED = ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', '$id'];

function toApiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toApiSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (API_UNSUPPORTED.includes(key)) continue;
    out[key] = key === 'properties'
      ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toApiSchema(v)]))
      : toApiSchema(value);
  }
  return out;
}

module.exports = { ContractError, validate, assertValid, toApiSchema };
