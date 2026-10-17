'use strict';
// Code node "Classify error".
// Our own Code nodes throw "[CODE] message". Everything else (HTTP errors that
// survived their retries, timeouts) is mapped by pattern. Retryable codes are
// the ones a replay can fix without anyone changing anything.

const PATTERNS = [
  [/\b529\b|overloaded/i, 'LLM_UNAVAILABLE'],
  [/anthropic|\/v1\/messages/i, 'LLM_ERROR'],
  [/\b50[234]\b|service unavailable|bad gateway/i, 'PORTAL_UNAVAILABLE'],
  [/ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout|socket hang up/i, 'NETWORK'],
];
const RETRYABLE = ['LLM_UNAVAILABLE', 'LLM_ERROR', 'PORTAL_UNAVAILABLE', 'DOCSVC_UNAVAILABLE', 'NETWORK', 'SESSION_EXPIRED', 'STALE_CLAIM', 'MODEL_TRUNCATED'];

function classify(message, failedNode) {
  const tagged = String(message).match(/\[([A-Z_]+)\]/);
  if (tagged) return tagged[1];
  const probe = `${failedNode || ''} ${message}`;
  if (/claude/i.test(failedNode || '') && /\b5\d\d\b|overloaded/i.test(message)) return 'LLM_UNAVAILABLE';
  for (const [re, code] of PATTERNS) if (re.test(probe)) return code;
  return 'UNEXPECTED';
}

// The failure description arrives on "Start"; this node's own input is the
// settings row loaded in between.
function run(items, ctx) {
  const settings = ctx.node('Load settings').settings;
  const json = ctx.node('Start');
  const code = classify(json.error_message, json.failed_node);
  const what = json.application_id ? `application ${json.application_id}` : `workflow "${json.workflow}"`;
  return [{
    json: {
      ...json,
      error_code: code,
      retryable: RETRYABLE.includes(code),
      alert: {
        from: settings.notify_from,
        to: settings.ops_email,
        subject: `[screening] ${code} on ${what}`,
        html: `<p>${code} while screening ${what}.</p><p>Node: ${json.failed_node || 'n/a'}</p><p>${String(json.error_message).replace(/</g, '&lt;')}</p><p>${RETRYABLE.includes(code) ? 'Replay it from the dashboard once the cause has cleared.' : 'Needs a fix before a replay will succeed.'}</p>`,
      },
    },
  }];
}

module.exports = { run, classify, RETRYABLE };
