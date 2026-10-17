'use strict';
// Code node "Attach email fields".
// The render call returns the .docx as binary data and no JSON. This puts the
// email fields next to the binary so the email adapter receives one item.

function run(items, ctx) {
  const { email, document_name } = ctx.node('Build submittal');
  const binary = items[0].binary || {};
  if (!binary.data) throw new Error('[DOCUMENT_MISSING] the render service returned no file');
  binary.data.fileName = document_name;
  return [{ json: { ...email, attachment_field: 'data', document_name }, binary }];
}

module.exports = { run };
