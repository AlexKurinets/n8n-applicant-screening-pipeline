'use strict';
// Code nodes "Login or page fetch failed", "Requisition or resume fetch failed",
// "Model call failed" and "Render failed".
// Every HTTP node in the screening workflow retries on its own first. When it
// still fails, its error output lands here. n8n would otherwise surface the
// failure to the caller as a generic "The service failed to process your
// request", losing which step failed and the status code. This re-throws it
// tagged, so the dead letter says exactly what broke and whether a replay can
// fix it.

const STEP_CODES = {
  'Fetch application page': 'PORTAL_UNAVAILABLE',
  'Refetch application page': 'PORTAL_UNAVAILABLE',
  'Fetch requisition page': 'PORTAL_UNAVAILABLE',
  'Download resume': 'PORTAL_UNAVAILABLE',
  'Portal login': 'PORTAL_UNAVAILABLE',
  'Log in again': 'PORTAL_UNAVAILABLE',
  'Extract resume text': 'DOCSVC_UNAVAILABLE',
  'Render Word submittal': 'DOCSVC_UNAVAILABLE',
  'Claude: rate criteria': 'LLM_UNAVAILABLE',
};

function describe(error) {
  if (!error) return { status: null, message: 'no error detail' };
  if (typeof error === 'string') {
    const status = (error.match(/\b([45]\d\d)\b/) || [])[1];
    return { status: status ? Number(status) : null, message: error };
  }
  const status = Number(error.httpCode || error.status || (String(error.message || '').match(/\b([45]\d\d)\b/) || [])[1]) || null;
  const message = [error.message, error.description].filter(Boolean).join(' | ');
  return { status, message: message || JSON.stringify(error).slice(0, 300) };
}

function codeFor(step, status) {
  const base = STEP_CODES[step] || 'STEP_FAILED';
  // A 4xx from the model API is a request problem a replay will not fix.
  if (base === 'LLM_UNAVAILABLE' && status && status >= 400 && status < 500 && status !== 408 && status !== 429) return 'LLM_REQUEST_REJECTED';
  return base;
}

function run(items, ctx) {
  const step = ctx.prevNode || 'unknown step';
  const { status, message } = describe(items[0] && items[0].json && items[0].json.error);
  const code = codeFor(step, status);
  throw new Error(`[${code}] (node: ${step}) ${status ? `HTTP ${status} ` : ''}after retries: ${message}`.slice(0, 1000));
}

module.exports = { run, describe, codeFor, STEP_CODES };
