'use strict';
// The model rates evidence per criterion; this module does the arithmetic.
// Keeping the score out of the model makes it reproducible from the stored
// ratings and lets the thresholds change without touching the prompt.

const RATING_LABELS = ['No evidence', 'Weak', 'Partial', 'Strong'];

function normalizeForMatch(s) {
  return String(s)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'.,;:-]+|[\s"'.,;:-]+$/g, '')
    .trim();
}

// A quote counts as grounded only if it appears verbatim (after whitespace,
// case and quote-mark normalization) in the text the model was given.
function isGrounded(evidence, sourceText) {
  const needle = normalizeForMatch(evidence);
  if (needle.length < 12) return false;
  return normalizeForMatch(sourceText).includes(needle);
}

function computeScore(criteria) {
  const max = criteria.reduce((sum, c) => sum + c.weight * 3, 0);
  const got = criteria.reduce((sum, c) => sum + c.weight * c.rating, 0);
  return max === 0 ? 0 : Math.round((100 * got) / max);
}

function bandFor(score, mustHaveGaps, thresholds) {
  if (score >= thresholds.shortlist && mustHaveGaps.length === 0) return 'Shortlisted';
  if (score >= thresholds.review) return 'Recruiter review';
  return 'Low match';
}

module.exports = { RATING_LABELS, normalizeForMatch, isGrounded, computeScore, bandFor };
