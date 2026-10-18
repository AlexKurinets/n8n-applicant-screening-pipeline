'use strict';
// Server-rendered pages with inline SVG charts. Single-series charts use one
// hue; text stays in ink colours; status red is reserved for dead letters and
// always comes with a label.

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '0%');
const fmtTime = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 19) : '');
const secs = (s) => (s === null || s === undefined ? '' : `${Number(s).toFixed(1)} s`);

const CSS = `
.viz-root { color-scheme: light; --surface:#fcfcfb; --page:#f4f4f1; --ink:#0b0b0b; --ink-2:#52514e; --muted:#898781;
  --grid:#e1e0d9; --axis:#c3c2b7; --ring:rgba(11,11,11,.10); --series:#2a78d6; --series-soft:#cde2fb; --critical:#d03b3b; --good:#006300; }
@media (prefers-color-scheme: dark) { :root:where(:not([data-theme="light"])) .viz-root { color-scheme: dark; --surface:#1a1a19; --page:#0d0d0d;
  --ink:#f0efec; --ink-2:#c3c2b7; --grid:#2c2c2a; --axis:#383835; --ring:rgba(255,255,255,.10); --series:#3987e5; --series-soft:#184f95; --good:#0ca30c; } }
* { box-sizing:border-box; }
body.viz-root { margin:0; background:var(--page); color:var(--ink); font:14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
header { display:flex; align-items:baseline; gap:24px; padding:14px 24px; border-bottom:1px solid var(--ring); background:var(--surface); flex-wrap:wrap; }
header h1 { font-size:17px; margin:0; } header nav a { color:var(--ink-2); text-decoration:none; margin-right:18px; }
header nav a.on { color:var(--ink); font-weight:600; } header .src { margin-left:auto; color:var(--muted); font-size:12px; }
main { max-width:1240px; margin:0 auto; padding:20px 24px 40px; }
.tiles { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); gap:12px; margin-bottom:16px; }
.tile, .card { background:var(--surface); border:1px solid var(--ring); border-radius:8px; padding:14px 16px; }
.tile .label { color:var(--ink-2); font-size:12px; } .tile .value { font-size:28px; font-weight:600; margin-top:2px; }
.tile .sub { color:var(--muted); font-size:12px; }
.tile.alert .value { color:var(--critical); }
.grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; }
@media (max-width: 900px) { .grid2 { grid-template-columns:1fr; } }
.card h2 { font-size:14px; margin:0 0 2px; } .card .hint { color:var(--muted); font-size:12px; margin:0 0 10px; }
table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
th, td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--grid); vertical-align:top; }
th { color:var(--muted); font-weight:500; font-size:12px; } td.num, th.num { text-align:right; }
a { color:var(--series); }
.chip { display:inline-block; padding:0 8px; border-radius:10px; font-size:12px; border:1px solid var(--axis); color:var(--ink-2); white-space:nowrap; }
.chip.dead { border-color:var(--critical); color:var(--critical); }
.chip.dead::before { content:"\\26A0\\FE0E  "; }
.flag { color:var(--critical); font-size:12px; } .ok { color:var(--good); font-size:12px; }
.mono { font-family:ui-monospace, Consolas, monospace; font-size:12px; }
.quote { color:var(--ink-2); } .muted { color:var(--muted); }
svg text { font-family:system-ui, -apple-system, "Segoe UI", sans-serif; }
.filters { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; }
.filters a { padding:3px 10px; border:1px solid var(--ring); border-radius:14px; text-decoration:none; color:var(--ink-2); background:var(--surface); font-size:12px; }
.filters a.on { border-color:var(--series); color:var(--ink); }
button { font:inherit; padding:4px 12px; border-radius:6px; border:1px solid var(--series); background:var(--series); color:#fff; cursor:pointer; }
dl.facts { display:grid; grid-template-columns:200px 1fr; gap:4px 12px; margin:0; } dl.facts dt { color:var(--muted); } dl.facts dd { margin:0; }
.banner { padding:10px 14px; border-radius:8px; border:1px solid var(--ring); background:var(--surface); margin-bottom:12px; }
`;

function layout({ title, active, body, links }) {
  const tab = (href, name) => `<a href="${href}" class="${active === name ? 'on' : ''}">${name}</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Screening runs</title><style>${CSS}</style></head>
<body class="viz-root"><header><h1>Applicant screening</h1>
<nav>${tab('/', 'Overview')}${tab('/runs', 'Runs')}${tab('/dead-letters', 'Dead letters')}</nav>
<span class="src">Reads the run ledger the n8n workflows write · <a href="${esc(links.n8n)}">n8n</a> · <a href="${esc(links.portal)}">portal</a> · <a href="${esc(links.mail)}">mail</a></span></header>
<main>${body}</main></body></html>`;
}

// Horizontal bar with a 4px rounded end, anchored square at the baseline.
function hbar(x, y, w, h) {
  if (w <= 0) return '';
  const r = Math.min(4, w, h / 2);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}
function vbar(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function outcomeChart(rows, total) {
  const W = 560; const labelW = 130; const barH = 22; const gap = 10; const right = 70;
  const max = Math.max(1, ...rows.map((r) => r.n));
  const H = rows.length * (barH + gap) + 4;
  const scale = (W - labelW - right) / max;
  const bars = rows.map((r, i) => {
    const y = i * (barH + gap) + 2;
    const w = r.n * scale;
    return `<g><title>${esc(r.outcome)}: ${r.n} of ${total} (${pct(r.n, total)})</title>
<text x="${labelW - 10}" y="${y + barH / 2 + 4}" text-anchor="end" font-size="12" fill="var(--ink-2)">${esc(r.outcome)}</text>
<path d="${hbar(labelW, y, w, barH)}" fill="${r.outcome === 'Dead letter' ? 'var(--critical)' : 'var(--series)'}"/>
<rect x="${labelW}" y="${y - gap / 2}" width="${W - labelW}" height="${barH + gap}" fill="transparent"/>
<text x="${labelW + w + 8}" y="${y + barH / 2 + 4}" font-size="12" fill="var(--ink)">${r.n} <tspan fill="var(--muted)">${pct(r.n, total)}</tspan></text></g>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Applications by outcome">
<line x1="${labelW}" y1="0" x2="${labelW}" y2="${H}" stroke="var(--axis)"/>${bars}</svg>`;
}

function histogram(bins, thresholds) {
  const W = 560; const H = 210; const left = 34; const bottom = 28; const top = 18;
  const max = Math.max(1, ...bins.map((b) => b.n));
  const plotH = H - bottom - top; const plotW = W - left - 8;
  const bw = plotW / bins.length;
  const yOf = (n) => top + plotH - (n / max) * plotH;
  const ticks = [0, Math.ceil(max / 2), max];
  const grid = ticks.map((t) => `<line x1="${left}" x2="${W - 8}" y1="${yOf(t)}" y2="${yOf(t)}" stroke="var(--grid)"/>
<text x="${left - 6}" y="${yOf(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${t}</text>`).join('');
  const bars = bins.map((b, i) => {
    const x = left + i * bw + 1; const h = (b.n / max) * plotH;
    return `<g><title>Score ${b.from} to ${b.to}: ${b.n} application${b.n === 1 ? '' : 's'}</title>
<path d="${vbar(x, top + plotH - h, bw - 2, h)}" fill="var(--series)"/>
<rect x="${x}" y="${top}" width="${bw - 2}" height="${plotH}" fill="transparent"/>
${i % 2 === 0 ? `<text x="${x - 1}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">${b.from}</text>` : ''}</g>`;
  }).join('');
  const marker = (score, label) => {
    const x = left + (score / 100) * plotW;
    return `<line x1="${x}" x2="${x}" y1="${top - 6}" y2="${top + plotH}" stroke="var(--ink-2)" stroke-dasharray="4 3"/>
<text x="${x + 4}" y="${top - 6}" font-size="11" fill="var(--ink-2)">${label}</text>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Score distribution">${grid}${bars}
<line x1="${left}" x2="${W - 8}" y1="${top + plotH}" y2="${top + plotH}" stroke="var(--axis)"/>
${marker(thresholds.review, `Recruiter review ≥ ${thresholds.review}`)}${marker(thresholds.shortlist, `Shortlist ≥ ${thresholds.shortlist}`)}</svg>`;
}

function chip(outcome, status) {
  if (status === 'failed') return '<span class="chip dead">Dead letter</span>';
  if (status === 'processing') return '<span class="chip">In progress</span>';
  return `<span class="chip">${esc(outcome)}</span>`;
}

function runsTable(rows, links) {
  if (!rows.length) return '<p class="muted">No runs yet. Trigger the sweep or submit an application.</p>';
  return `<table><thead><tr><th>Run</th><th>Application</th><th>Req</th><th>Source</th><th>Outcome</th><th class="num">Score</th><th>Checks</th><th class="num">Time</th><th>Started (UTC)</th></tr></thead><tbody>
${rows.map((r) => `<tr><td><a href="/runs/${r.id}">#${r.id}</a></td>
<td><a href="${esc(links.portal)}/applications/${esc(r.application_id)}">${esc(r.application_id)}</a></td>
<td>${esc(r.requisition_id || '')}</td><td>${esc(r.source)}</td><td>${chip(r.outcome, r.status)}${r.error_code ? ` <span class="mono">${esc(r.error_code)}</span>` : ''}</td>
<td class="num">${r.score ?? ''}</td>
<td>${r.relogged ? '<span class="muted">re-login</span> ' : ''}${r.ungrounded ? `<span class="flag">${r.ungrounded} ungrounded</span> ` : ''}${r.submittal && r.submittal.sent ? '<span class="ok">submittal sent</span>' : ''}</td>
<td class="num">${secs(r.seconds)}</td><td>${fmtTime(r.started_at)}</td></tr>`).join('\n')}
</tbody></table>`;
}

function overviewPage({ s, outcomes, bins, clauses, reqs, recent, settings, links }) {
  const tiles = [
    ['Applications screened', s.applications, `${s.completed} completed · ${s.in_progress} in progress`],
    ['Screened out by Boolean pre-filter', s.screened_out, `${pct(s.screened_out, s.applications)} of applications, no model call`],
    ['Scored by the model', s.scored, `${s.with_ungrounded} with a quote not found in the resume`],
    ['Shortlisted', s.shortlisted, `${s.submittals_sent} Word submittals emailed`],
    ['Need a person', s.needs_person, 'Incomplete or unreadable resume'],
    ['Open dead letters', s.open_dead_letters, `${s.dead_letters_total} recorded · ${s.duplicates_skipped} duplicate triggers skipped`, s.open_dead_letters > 0],
    ['Median time per application', s.median_seconds === null ? '–' : secs(s.median_seconds), `${s.relogged} runs recovered an expired session`],
  ];
  const body = `
<div class="tiles">${tiles.map(([label, value, sub, alert]) => `<div class="tile${alert ? ' alert' : ''}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="sub">${esc(sub)}</div></div>`).join('')}</div>
<div class="grid2">
<div class="card"><h2>Outcome per application</h2><p class="hint">Latest run per application. Hover a bar for the exact share.</p>${outcomeChart(outcomes, s.applications)}</div>
<div class="card"><h2>Score distribution</h2><p class="hint">Computed in code from the model's per-criterion ratings (${esc(settings.model)}, effort ${esc(settings.effort)}).</p>${histogram(bins, settings.thresholds)}</div>
</div>
<div class="grid2">
<div class="card"><h2>Requisitions</h2><p class="hint">Screened → passed the pre-filter → scored → shortlisted.</p>
<table><thead><tr><th>Requisition</th><th class="num">Screened</th><th class="num">Screened out</th><th class="num">Scored</th><th class="num">Shortlisted</th><th class="num">Avg score</th></tr></thead><tbody>
${reqs.map((r) => `<tr><td><a href="/runs?requisition=${esc(r.requisition_id)}">${esc(r.requisition_id)}</a></td><td class="num">${r.screened}</td><td class="num">${r.screened_out}</td><td class="num">${r.scored}</td><td class="num">${r.shortlisted}</td><td class="num">${r.avg_score ?? ''}</td></tr>`).join('')}
</tbody></table></div>
<div class="card"><h2>Why the pre-filter screened people out</h2><p class="hint">Top failed clauses of the recruiters' Boolean screens.</p>
<table><thead><tr><th>Failed clause</th><th class="num">Applications</th></tr></thead><tbody>
${clauses.map((c) => `<tr><td class="mono">${esc(c.clause)}</td><td class="num">${c.n}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">None yet</td></tr>'}
</tbody></table></div>
</div>
<div class="card"><h2>Recent runs</h2><p class="hint"><a href="/runs">All runs</a></p>${runsTable(recent, links)}</div>`;
  return layout({ title: 'Overview', active: 'Overview', body, links });
}

function runsPage({ rows, outcome, requisition, outcomes, links }) {
  const filter = (o) => `<a class="${outcome === o ? 'on' : ''}" href="/runs?${o ? `outcome=${encodeURIComponent(o)}` : ''}${requisition ? `${o ? '&' : ''}requisition=${encodeURIComponent(requisition)}` : ''}">${esc(o || 'All')}</a>`;
  const body = `<div class="filters">${filter('')}${outcomes.map(filter).join('')}</div>
<div class="card"><h2>Runs${requisition ? ` for ${esc(requisition)}` : ''}${outcome ? ` · ${esc(outcome)}` : ''}</h2><p class="hint">Newest first. Every run links to its record.</p>${runsTable(rows, links)}</div>`;
  return layout({ title: 'Runs', active: 'Runs', body, links });
}

function runPage({ r, links }) {
  const sc = r.screening;
  const pf = r.prefilter;
  const facts = [
    ['Application', `<a href="${esc(links.portal)}/applications/${esc(r.application_id)}">${esc(r.application_id)}</a> in the portal`],
    ['Requisition', esc(r.requisition_id || '')],
    ['Outcome', `${chip(r.outcome, r.status)} ${r.reason ? `<span class="mono">${esc(r.reason)}</span>` : ''}`],
    ['Note written to the portal', r.note ? esc(r.note) : '<span class="muted">none</span>'],
    ['Status written', r.status_written ? '<span class="ok">yes, through the portal form</span>' : (r.status === 'completed' ? 'no, a recruiter had already changed it' : '–')],
    ['Triggered by', esc(r.source)],
    ['Started / finished (UTC)', `${fmtTime(r.started_at)} → ${fmtTime(r.finished_at)} (${secs(r.seconds)})`],
    ['Session', r.relogged ? 'expired mid-run; logged in again and continued' : 'one login'],
    ['Resume', r.resume_chars ? `${r.resume_chars} characters extracted · <span class="mono">sha256 ${esc(String(r.content_hash).slice(0, 16))}…</span>` : '<span class="muted">no text</span>'],
    ['n8n execution', r.n8n_execution_id ? `<a href="${esc(links.n8n)}/workflow/ScrApp0000000001/executions/${esc(r.n8n_execution_id)}">#${esc(r.n8n_execution_id)}</a>` : '–'],
  ];
  if (r.submittal && r.submittal.document_name) {
    facts.push(['Word submittal', `<a href="/documents/${encodeURIComponent(r.submittal.document_name)}">${esc(r.submittal.document_name)}</a> · emailed to the recruiter`]);
  }
  if (r.error_code) facts.push(['Error', `<span class="flag">${esc(r.error_code)}</span> ${esc(r.error_detail || '')}`]);

  const criteria = sc ? `<div class="card"><h2>Model ratings (${esc(sc.model)}, ${esc(sc.prompt_version)})</h2>
<p class="hint">Score ${sc.score}/100 → ${esc(sc.band)}. A rating counts only if its quote appears word for word in the resume the model was shown.</p>
<table><thead><tr><th>Criterion</th><th class="num">Weight</th><th class="num">Rating</th><th>Evidence quoted by the model</th><th>Grounded</th></tr></thead><tbody>
${sc.criteria.map((c) => `<tr><td>${esc(c.text)}${c.must_have ? ' <span class="muted">must have</span>' : ''}</td><td class="num">${c.weight}</td><td class="num">${c.rating}</td>
<td class="quote">${c.evidence ? `“${esc(c.evidence)}”` : '<span class="muted">none</span>'}</td>
<td>${c.grounded ? '<span class="ok">yes</span>' : '<span class="flag">not in resume, rated 0</span>'}</td></tr>`).join('')}
</tbody></table><p><b>Summary.</b> ${esc(sc.summary)}</p>${sc.concerns.length ? `<p><b>Concerns.</b> ${sc.concerns.map(esc).join(' ')}</p>` : ''}</div>` : '';

  const prefilter = pf ? `<div class="card"><h2>Pre-filter</h2><dl class="facts">
<dt>Outcome</dt><dd>${esc(pf.outcome)}</dd>
<dt>Boolean screen</dt><dd>${pf.boolean_passed === null ? '<span class="muted">not evaluated</span>' : pf.boolean_passed ? '<span class="ok">passed</span>' : '<span class="flag">failed</span>'}</dd>
<dt>Failed clauses</dt><dd class="mono">${pf.failed_clauses.map(esc).join('<br>') || '–'}</dd>
<dt>Matched terms</dt><dd class="mono">${pf.matched_terms.map(esc).join(', ') || '–'}</dd>
<dt>Missing documents</dt><dd>${pf.missing_documents.map(esc).join(', ') || '–'}</dd></dl></div>` : '';

  const history = `<div class="card"><h2>Triggers and other runs for ${esc(r.application_id)}</h2><table><thead><tr><th>When (UTC)</th><th>Source</th><th>Result</th></tr></thead><tbody>
${r.events.map((e) => `<tr><td>${fmtTime(e.received_at)}</td><td>${esc(e.source)}</td><td>${e.outcome === 'duplicate' ? 'duplicate, skipped' : e.outcome === 'parked' ? 'parked by an open dead letter, skipped' : `claimed as run <a href="/runs/${e.run_id}">#${e.run_id}</a>`}</td></tr>`).join('')}
${r.dead_letters.map((d) => `<tr><td>${fmtTime(d.created_at)}</td><td>dead letter #${d.id}</td><td><span class="flag">${esc(d.error_code)}</span>${d.replayed_at ? ` · replayed: ${esc(d.replay_outcome)}` : ''}</td></tr>`).join('')}
</tbody></table></div>`;

  const body = `<div class="card" style="margin-bottom:16px"><h2>Run #${r.id}</h2><dl class="facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
${criteria}<div class="grid2">${prefilter}${history}</div>`;
  return layout({ title: `Run #${r.id}`, active: 'Runs', body, links });
}

function deadLettersPage({ rows, flash, links }) {
  const body = `${flash ? `<div class="banner">${esc(flash)}</div>` : ''}
<div class="card"><h2>Dead letters</h2><p class="hint">Every run that could not finish lands here with a reason code; nothing fails silently. Retryable ones can be replayed once the cause has cleared.</p>
<table><thead><tr><th>#</th><th>Application</th><th>Error</th><th>Failed node</th><th>Detail</th><th>Recorded (UTC)</th><th>Replay</th></tr></thead><tbody>
${rows.map((d) => `<tr><td>${d.id}</td><td>${d.application_id ? `<a href="${esc(links.portal)}/applications/${esc(d.application_id)}">${esc(d.application_id)}</a>` : '<span class="muted">n/a</span>'}</td>
<td><span class="chip dead">${esc(d.error_code)}</span><br><span class="muted">${d.retryable ? 'retryable' : 'needs a fix first'}</span></td>
<td>${esc(d.failed_node || '')}</td><td class="mono">${esc(String(d.error_detail || '').slice(0, 220))}</td><td>${fmtTime(d.created_at)}</td>
<td>${d.replayed_at ? `replayed: ${esc(d.replay_outcome)}` : d.application_id ? `<form method="post" action="/dead-letters/${d.id}/replay"><button type="submit">Replay</button></form>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No dead letters.</td></tr>'}
</tbody></table></div>`;
  return layout({ title: 'Dead letters', active: 'Dead letters', body, links });
}

module.exports = { overviewPage, runsPage, runPage, deadLettersPage, layout };
