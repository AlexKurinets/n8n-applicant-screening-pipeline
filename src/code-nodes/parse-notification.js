'use strict';
// Code node "Parse notification".
// The portal emails the intake mailbox for every new application. Only mail
// from the portal's sender with an application ID in the subject is intake;
// anything else in the mailbox is ignored, never guessed at.

const SENDER = /no-reply@portal\.example\.com/i;

function addressOf(from) {
  if (!from) return '';
  if (typeof from === 'string') return from;
  if (from.value && from.value[0]) return from.value[0].address || '';
  if (from.text) return from.text;
  return JSON.stringify(from);
}

function run(items) {
  return items.map(({ json }) => {
    const subject = String(json.subject || '');
    const from = addressOf(json.from);
    const id = (subject.match(/\bA-\d{5}\b/) || [])[0];
    const messageId = json.messageId || (json.metadata && json.metadata['message-id']) || null;

    if (!SENDER.test(from) || !id) {
      return { json: { ignored: true, reason: !id ? 'no application id in subject' : `unexpected sender ${from}`, subject } };
    }
    return { json: { ignored: false, application_id: id, source: 'imap', intake_ref: messageId, subject } };
  });
}

module.exports = { run };
