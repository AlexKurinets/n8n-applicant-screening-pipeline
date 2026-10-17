'use strict';
// Code node "Collect new IDs".
// The list page is fetched page by page; each page yields an array of IDs.
// This flattens and de-duplicates them, and refuses a page that came back
// without the list marker (a login page or an error page has no rows either).

function run(items) {
  const ids = new Set();
  items.forEach(({ json }, i) => {
    if (json.page_marker !== 'application-list') {
      throw new Error(`[PORTAL_LAYOUT_CHANGED] list page ${i + 1} has marker "${json.page_marker || 'none'}"`);
    }
    const list = Array.isArray(json.ids) ? json.ids : json.ids ? [json.ids] : [];
    list.filter((id) => /^A-\d{5}$/.test(id)).forEach((id) => ids.add(id));
  });
  return [{ json: { ids: [...ids].sort(), pages: items.length } }];
}

module.exports = { run };
