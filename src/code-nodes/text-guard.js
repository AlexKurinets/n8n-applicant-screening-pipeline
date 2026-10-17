'use strict';
// Code node "Check resume text".
// A scanned resume is a picture of text, so extraction returns almost nothing.
// The first version of this workflow sent that near-empty string to the model,
// which scored it, confidently and low. Below the threshold the run goes to
// Manual review and the model is never called.
const { sha256Hex } = require('../lib/sha256');

function run(items, ctx) {
  const res = items[0].json;
  const settings = ctx.node('Load settings').settings;
  const text = String(res.text || '').split(String.fromCharCode(0)).join('').trim();
  const chars = text.replace(/\s+/g, '').length;

  return [{
    json: {
      readable: chars >= settings.min_resume_chars,
      resume_text: text,
      chars,
      pages: res.pages || null,
      format: res.format || null,
      content_hash: sha256Hex(text),
    },
  }];
}

module.exports = { run };
