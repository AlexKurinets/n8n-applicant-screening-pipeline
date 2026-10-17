'use strict';
// Server-rendered pages. Stable ids, classes and the body's data-page marker
// are what the n8n HTML nodes select on; the rest is for people.

const STATUS_OPTIONS = ['New', 'Shortlisted', 'Recruiter review', 'Low match', 'Screened out', 'Incomplete', 'Manual review', 'Submitted', 'Rejected'];

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 16);
const statusClass = (s) => `status status-${String(s).toLowerCase().replace(/[^a-z]+/g, '-')}`;

const CSS = `
:root { --ink:#1d2733; --muted:#5b6675; --line:#d5dbe3; --bg:#f3f5f8; --panel:#fff; --brand:#24527a; }
* { box-sizing:border-box; }
body { margin:0; font:14px/1.45 "Segoe UI", Arial, sans-serif; color:var(--ink); background:var(--bg); }
header { background:var(--brand); color:#fff; padding:10px 20px; display:flex; justify-content:space-between; align-items:center; }
header a { color:#fff; text-decoration:none; margin-right:16px; }
header .who { font-size:12px; opacity:.85; }
main { max-width:1100px; margin:18px auto; padding:0 16px; }
.panel { background:var(--panel); border:1px solid var(--line); border-radius:6px; padding:16px 18px; margin-bottom:14px; }
h1 { font-size:20px; margin:0 0 6px; } h1 small { font-size:13px; color:var(--muted); font-weight:normal; margin-left:8px; }
h2 { font-size:15px; margin:0 0 10px; }
table { border-collapse:collapse; width:100%; }
th, td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
th { font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; }
dl.profile { display:grid; grid-template-columns:180px 1fr; gap:6px 12px; margin:0; }
dl.profile dt { color:var(--muted); }
dl.profile dd { margin:0; }
.status { display:inline-block; padding:1px 8px; border-radius:10px; font-size:12px; background:#e6eaf0; }
.status-new { background:#fff3cd; } .status-shortlisted { background:#d4edda; } .status-recruiter-review { background:#dbe9f7; }
.status-low-match { background:#ece4f5; } .status-screened-out, .status-rejected { background:#f1dede; }
.status-incomplete, .status-manual-review { background:#ffe5cc; }
.muted { color:var(--muted); } .note { white-space:pre-wrap; }
pre { background:#f7f9fb; border:1px solid var(--line); padding:8px 10px; border-radius:4px; white-space:pre-wrap; }
form.inline { display:grid; grid-template-columns:200px 1fr 90px; gap:8px; align-items:start; }
input, select, textarea, button { font:inherit; padding:5px 7px; }
button { background:var(--brand); color:#fff; border:0; border-radius:4px; cursor:pointer; }
.pager { margin-top:10px; display:flex; gap:12px; }
.login { max-width:340px; margin:80px auto; }
.login label { display:block; margin:8px 0 2px; } .login input { width:100%; }
.error { color:#9b1c1c; }
`;

function layout({ title, marker, user, body }) {
  const nav = user
    ? `<nav><a href="/applications">Applications</a><a href="/applications?status=New">New</a><a href="/requisitions">Requisitions</a></nav><span class="who">Signed in as ${esc(user.display_name)}</span>`
    : '<nav><span>Applicant Portal</span></nav>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Applicant Portal</title><style>${CSS}</style></head>
<body data-page="${marker}"><header>${nav}</header><main>${body}</main></body></html>`;
}

function loginPage(error) {
  return layout({
    title: 'Sign in', marker: 'login', user: null,
    body: `<div class="panel login"><h1>Applicant Portal</h1><p class="muted">Sign in to continue.</p>
${error ? `<p class="error">${esc(error)}</p>` : ''}
<form method="post" action="/login"><label for="u">Username</label><input id="u" name="username" autocomplete="username">
<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password">
<p><button type="submit">Sign in</button></p></form></div>`,
  });
}

function listPage({ user, rows, status, page, hasNext, total }) {
  const filter = status ? `status=${encodeURIComponent(status)}&` : '';
  const body = `<div class="panel"><h1>Applications <small>${esc(status || 'All statuses')} · ${total} total</small></h1>
<table><thead><tr><th>Application</th><th>Candidate</th><th>Requisition</th><th>Received</th><th>Status</th></tr></thead><tbody>
${rows.map((r) => `<tr data-application-id="${esc(r.id)}"><td><a href="/applications/${esc(r.id)}">${esc(r.id)}</a></td>
<td>${esc(r.candidate.name)}</td><td>${esc(r.requisition_id)} · ${esc(r.title)}</td><td>${fmtDate(r.received_at)}</td>
<td><span class="${statusClass(r.status)}">${esc(r.status)}</span></td></tr>`).join('\n')}
</tbody></table>
<nav class="pager" data-page-number="${page}" data-has-next="${hasNext}">
${page > 1 ? `<a class="prev" href="/applications?${filter}page=${page - 1}">Previous</a>` : ''}
${hasNext ? `<a class="next" href="/applications?${filter}page=${page + 1}">Next</a>` : ''}
<span class="muted">Page ${page}</span></nav></div>`;
  return layout({ title: 'Applications', marker: 'application-list', user, body });
}

// layout_v2 is the vendor's redesigned profile block that rolled out to some
// records first. The license fields get new class names, nothing else changes.
function detailPage({ user, app, req, attachments, history, csrf, variant }) {
  const c = app.candidate;
  const lic = variant === 'layout_v2'
    ? `<dt>License</dt><dd class="lic-state">${esc(c.license_state)}</dd><dt>License type</dt><dd class="lic-type">${c.license_multistate ? 'Multistate (NLC)' : 'Single-state'}</dd>`
    : `<dt>License state</dt><dd class="field-license-state">${esc(c.license_state)}</dd><dt>License type</dt><dd class="field-license-type">${c.license_multistate ? 'Multistate (NLC)' : 'Single-state'}</dd>`;
  const body = `<div class="panel"><h1><span id="candidate-name">${esc(c.name)}</span><small>Application <span id="application-id">${esc(app.id)}</span></small></h1>
<p>Requisition <a href="/requisitions/${esc(req.id)}"><span id="requisition-id">${esc(req.id)}</span></a> · ${esc(req.title)} · received
<time class="received" datetime="${new Date(app.received_at).toISOString()}">${fmtDate(app.received_at)}</time></p>
<p>Status: <strong id="current-status" class="${statusClass(app.status)}">${esc(app.status)}</strong></p></div>
<div class="panel"><h2>Profile</h2><dl class="profile">
<dt>Email</dt><dd class="field-email">${esc(c.email)}</dd>
<dt>Phone</dt><dd class="field-phone">${esc(c.phone)}</dd>
<dt>Home state</dt><dd class="field-home-state">${esc(c.home_state)}</dd>
${lic}
<dt>Specialty</dt><dd class="field-specialty">${esc(c.specialty)}</dd>
<dt>Years of experience</dt><dd class="field-years">${esc(c.years_experience)}</dd>
<dt>Shift preference</dt><dd class="field-shift">${esc(c.shift_preference)}</dd>
</dl></div>
<div class="panel"><h2>Attachments</h2><ul>
${attachments.map((a) => `<li><a class="attachment" data-kind="${esc(a.kind)}" href="/attachments/${a.id}">${esc(a.filename)}</a> <span class="muted">${esc(a.kind)}</span></li>`).join('\n') || '<li class="muted">None</li>'}
</ul></div>
<div class="panel"><h2>Update status</h2>
<form id="status-form" class="inline" method="post" action="/applications/${esc(app.id)}/status">
<input type="hidden" name="_csrf" value="${esc(csrf)}">
<select name="status">${STATUS_OPTIONS.map((s) => `<option${s === app.status ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>
<textarea name="note" rows="2" placeholder="Note"></textarea><button type="submit">Save</button></form></div>
<div class="panel"><h2>History</h2><table><thead><tr><th>When</th><th>Status</th><th>By</th><th>Note</th></tr></thead><tbody>
${history.map((h) => `<tr><td>${fmtDate(h.at)}</td><td><span class="${statusClass(h.status)}">${esc(h.status)}</span></td><td>${esc(h.actor)}</td><td class="note">${esc(h.note)}</td></tr>`).join('\n') || '<tr><td colspan="4" class="muted">No changes yet</td></tr>'}
</tbody></table></div>`;
  return layout({ title: `${app.id} · ${c.name}`, marker: 'application-detail', user, body });
}

function requisitionList({ user, rows }) {
  const body = `<div class="panel"><h1>Requisitions</h1><table><thead><tr><th>Requisition</th><th>Facility</th><th>New</th><th>Total</th></tr></thead><tbody>
${rows.map((r) => `<tr><td><a href="/requisitions/${esc(r.id)}">${esc(r.id)}</a> · ${esc(r.title)}</td><td>${esc(r.facility)}, ${esc(r.city)}, ${esc(r.state)}</td><td>${r.new_count}</td><td>${r.total}</td></tr>`).join('\n')}
</tbody></table></div>`;
  return layout({ title: 'Requisitions', marker: 'requisition-list', user, body });
}

function requisitionPage({ user, req }) {
  const body = `<div class="panel"><h1 id="requisition-title">${esc(req.title)}</h1><p class="muted"><span id="requisition-id">${esc(req.id)}</span></p>
<dl class="profile">
<dt>Facility</dt><dd class="field-facility">${esc(req.facility)}</dd>
<dt>Location</dt><dd class="field-location">${esc(req.city)}, ${esc(req.state)}</dd>
<dt>Required documents</dt><dd class="field-required-documents">${esc(req.required_documents.join(', '))}</dd>
<dt>Recruiter</dt><dd class="field-recruiter-email">${esc(req.recruiter_email)}</dd>
<dt>Account manager</dt><dd class="field-account-manager-email">${esc(req.account_manager_email)}</dd>
</dl></div>
<div class="panel"><h2>Boolean screen</h2><pre id="boolean-screen">${esc(req.boolean_screen)}</pre></div>
<div class="panel"><h2>Screening criteria</h2><ol>
${req.criteria.map((c) => `<li class="criterion" data-id="${esc(c.id)}" data-weight="${c.weight}" data-must-have="${c.must_have}"><span class="criterion-text">${esc(c.text)}</span>${c.must_have ? ' <em class="muted">must have</em>' : ''} <span class="muted">weight ${c.weight}</span></li>`).join('\n')}
</ol></div>`;
  return layout({ title: req.id, marker: 'requisition-detail', user, body });
}

function errorPage(user, status, message) {
  return layout({ title: `Error ${status}`, marker: 'error', user, body: `<div class="panel"><h1>Error ${status}</h1><p>${esc(message)}</p></div>` });
}

module.exports = { STATUS_OPTIONS, loginPage, listPage, detailPage, requisitionList, requisitionPage, errorPage };
