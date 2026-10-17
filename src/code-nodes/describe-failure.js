'use strict';
// Code node "Describe failure".
// Sits on the error output of an Execute Workflow node. It pairs the error with
// the application that was being screened, so the dead letter can be replayed.

function errorMessage(json) {
  if (!json) return 'unknown error';
  const e = json.error;
  if (typeof e === 'string') return e;
  if (e && e.message) return e.description ? `${e.message} (${e.description})` : e.message;
  if (json.message) return json.message;
  return JSON.stringify(json).slice(0, 500);
}

// The error item normally still carries the input fields (application_id,
// source); the intake node is the fallback when it does not.
function intakeFields(json, ctx, options) {
  if (json && json.application_id) return json;
  try {
    return ctx.node(options.intakeNode) || {};
  } catch {
    return {};
  }
}

function run(items, ctx, options = {}) {
  return items.map(({ json }) => {
    const intake = intakeFields(json, ctx, options);
    return {
      json: {
        application_id: intake.application_id || null,
        source: intake.source || options.source || 'unknown',
        error_message: errorMessage(json),
        failed_node: (errorMessage(json).match(/\(node: ([^)]+)\)/) || [])[1]
          || (json.error && json.error.node && json.error.node.name) || null,
        workflow: options.workflow || null,
        execution_id: ctx.executionId,
      },
    };
  });
}

module.exports = { run, errorMessage };
