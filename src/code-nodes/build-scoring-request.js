'use strict';
// Code node "Build scoring request".
// Builds the Messages API body. The output schema goes in output_config.format,
// so the reply is guaranteed to parse; the range checks the API cannot express
// are enforced afterwards in "Validate and score".
const { maskForModel } = require('../lib/pii');
const { toApiSchema } = require('../lib/contract');
const { modelOutputV1 } = require('../lib/schemas');
const { PROMPT_VERSION, SYSTEM_PROMPT, buildUserMessage } = require('../lib/prompt');

function run(items, ctx) {
  const p = items[0].json;
  const settings = ctx.node('Load settings').settings;
  const { text, masked } = maskForModel(p.resume_text, p.application.candidate.name);

  const request = {
    model: settings.model,
    max_tokens: settings.max_tokens,
    fallbacks: 'default',
    output_config: {
      effort: settings.effort,
      format: { type: 'json_schema', schema: toApiSchema(modelOutputV1) },
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(p.requisition, text) }],
  };

  return [{ json: { request, model_text: text, masked, prompt_version: PROMPT_VERSION, criteria: p.requisition.criteria } }];
}

module.exports = { run };
