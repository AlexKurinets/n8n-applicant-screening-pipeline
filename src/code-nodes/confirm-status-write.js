'use strict';
// Code node "Confirm status write".
// The portal's status form answers a good post with a 303 back to the
// application. Anything else (an expired CSRF token, a validation error page)
// means the status did not change, and the run must not report that it did.

function run(items, ctx) {
  const res = items[0].json;
  const decision = ctx.node('Decide status');
  if (res.statusCode !== 303) {
    const body = String(res.body || '').replace(/\s+/g, ' ').slice(0, 200);
    throw new Error(`[STATUS_WRITE_REJECTED] portal answered ${res.statusCode} when setting "${decision.status}": ${body}`);
  }
  return [{ json: { status_written: decision.status, application_id: decision.application_id } }];
}

module.exports = { run };
