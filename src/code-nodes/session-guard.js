'use strict';
// Code node "Check session" / "Check session again".
// An expired portal session does not return 401. It redirects to the login
// page, which arrives as HTTP 200, and an HTML extractor would happily read it
// as an application with every field empty. The page marker decides instead.

function pageMarker(html) {
  const m = String(html).match(/<body[^>]*\sdata-page="([^"]+)"/i);
  return m ? m[1] : 'unknown';
}

function run(items, ctx, options = {}) {
  const html = String(items[0].json.data || '');
  const page = pageMarker(html);

  if (page === 'login') {
    if (options.strict) {
      throw new Error('[SESSION_EXPIRED] the portal returned its login page again right after a fresh login');
    }
    return [{ json: { state: 'expired', html: '' } }];
  }
  if (page !== 'application-detail') {
    throw new Error(`[PORTAL_LAYOUT_CHANGED] expected the application page, got page marker "${page}"`);
  }
  return [{ json: { state: 'ok', html } }];
}

module.exports = { run, pageMarker };
