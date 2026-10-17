'use strict';
// Code node "Prepare alert".
// Hands the ops alert built by "Classify error" to the email adapter.

function run(items, ctx) {
  const { alert } = ctx.node('Classify error');
  return [{ json: { ...alert, attachment_field: '', dead_letter_id: items[0].json.id } }];
}

module.exports = { run };
