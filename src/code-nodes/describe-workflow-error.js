'use strict';
// Code node "Describe workflow error" in the Error Trigger workflow.
// Catches failures outside a screening call (a broken intake, a bad replay
// request), which have no application to attach to.

function run(items) {
  const { execution = {}, workflow = {} } = items[0].json;
  const error = execution.error || {};
  return [{
    json: {
      application_id: null,
      source: 'error-trigger',
      error_message: error.message || 'workflow failed without a message',
      failed_node: execution.lastNodeExecuted || (error.node && error.node.name) || null,
      workflow: workflow.name || null,
      execution_id: execution.id || null,
    },
  }];
}

module.exports = { run };
