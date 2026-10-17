'use strict';
// Masks direct identifiers in resume text before it is sent to the model.
// The model only needs skills and experience; names, contact details and
// street addresses add bias risk and nothing else. Evidence quotes are later
// checked against this masked text, which is exactly what the model saw.

const PATTERNS = [
  ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]'],
  ['url', /\b(?:https?:\/\/|www\.)\S+/gi, '[URL]'],
  ['phone', /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[PHONE]'],
  ['phone', /\b\d{3}[\s.-]\d{4}\b/g, '[PHONE]'],
  ['address', /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Way|Court|Ct|Place|Pl)\b\.?[^\n]*/g, '[ADDRESS]'],
  ['birthdate', /\b(?:DOB|Date of birth)\s*:?[^\n]*/gi, '[DOB]'],
];

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function maskForModel(text, candidateName) {
  let out = String(text);
  const counts = {};
  const bump = (kind, n) => { if (n) counts[kind] = (counts[kind] || 0) + n; };

  for (const [kind, re, replacement] of PATTERNS) {
    let n = 0;
    out = out.replace(re, () => { n += 1; return replacement; });
    bump(kind, n);
  }

  const parts = String(candidateName || '')
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}'-]/gu, ''))
    .filter((p) => p.length >= 2);
  const names = [String(candidateName || '').trim(), ...parts].filter(Boolean);
  for (const name of names) {
    const re = new RegExp(`(?<![\\p{L}])${escapeRegex(name)}(?![\\p{L}])`, 'giu');
    let n = 0;
    out = out.replace(re, () => { n += 1; return '[CANDIDATE]'; });
    bump('name', n);
  }
  out = out.replace(/\[CANDIDATE\](?:[\s-]+\[CANDIDATE\])+/g, '[CANDIDATE]');
  return { text: out, masked: counts };
}

module.exports = { maskForModel };
