'use strict';
// Code node "Read session" / "Read new session".
// The portal answers a good login with a 303 and a PORTALSESSID cookie, and a
// bad one with 200 and the login form again. Only the first counts.

function run(items) {
  const res = items[0].json;
  const headers = res.headers || {};
  const raw = headers['set-cookie'] || headers['Set-Cookie'] || [];
  const cookies = Array.isArray(raw) ? raw : [raw];
  const session = cookies.map((c) => String(c).split(';')[0].trim()).find((c) => c.startsWith('PORTALSESSID='));

  if (![302, 303].includes(res.statusCode) || !session) {
    throw new Error(`[PORTAL_LOGIN_FAILED] login answered ${res.statusCode} without a session cookie`);
  }
  return [{ json: { cookie: session, logged_in_at: new Date().toISOString() } }];
}

module.exports = { run };
