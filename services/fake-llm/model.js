'use strict';
// A deterministic stand-in for the Messages API, used offline and in CI.
// It reads the same request the workflow sends to Claude and answers in the
// same shape: one rating per criterion with a quoted sentence as evidence.
//
// Its "judgement" is word overlap between each criterion and the best
// matching resume sentence. For weak matches it sometimes paraphrases the
// quote instead of copying it, which is the failure real models show most
// often, so the workflow's grounding check has something real to catch.

const STOP = new Set(('a an the and or of in on at for to with as by from per into within over under is are was were be been '
  + 'this that these those their its our who which what when where while also including include such than then other '
  + 'least more most recent current currently prior previous two three four five one using use used every both each '
  + 'all any not no yes can will has have had do did done etc via '
  // Words nearly every clinical resume line contains carry no evidence on their own.
  + 'experience nursing years year skill skills').split(' '));

function stem(word) {
  let w = word.toLowerCase();
  if (w.endsWith('ies') && w.length > 4) w = `${w.slice(0, -3)}y`;
  else if (w.endsWith('ses') && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 4) w = w.slice(0, -1);
  if (w.endsWith('ing') && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
  return w;
}

function contentWords(text) {
  return [...new Set(String(text).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)).map(stem))];
}

function sentences(resume) {
  return String(resume)
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=\.)\s+(?=[A-Z])/))
    .map((s) => s.replace(/^[\s\-•*]+/, '').trim())
    .filter((s) => s.length >= 12 && !/^\[[A-Z]+\]/.test(s));
}

function ratingFor(overlap) {
  if (overlap >= 0.6) return 3;
  if (overlap >= 0.4) return 2;
  if (overlap >= 0.25) return 1;
  return 0;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function paraphrase(sentence) {
  const words = sentence.replace(/\.$/, '').split(' ');
  return `Has ${words[0].toLowerCase()} ${words.slice(1).join(' ')}`.trim();
}

function rateCriteria(criteria, resume) {
  const pool = sentences(resume).map((s) => ({ text: s, words: new Set(contentWords(s)) }));
  return criteria.map((c) => {
    const want = contentWords(c.text);
    let best = { overlap: 0, text: '' };
    for (const s of pool) {
      const overlap = want.filter((w) => s.words.has(w)).length / (want.length || 1);
      if (overlap > best.overlap) best = { overlap, text: s.text };
    }
    const rating = ratingFor(best.overlap);
    let evidence = rating > 0 ? best.text : '';
    if (rating === 1 && hash(best.text) % 2 === 0) evidence = paraphrase(best.text);
    return { id: c.id, rating, evidence };
  });
}

function parseRequest(body) {
  const message = (body.messages || []).map((m) => (typeof m.content === 'string' ? m.content
    : (m.content || []).map((b) => b.text || '').join('\n'))).join('\n');
  const reqBlock = (message.match(/Criteria:\n([\s\S]*?)\n<\/requisition>/) || [])[1] || '';
  const criteria = reqBlock.split('\n').map((line) => {
    const m = line.match(/^(c\d+)(?: \(must have\))?: (.+)$/);
    return m ? { id: m[1], text: m[2] } : null;
  }).filter(Boolean);
  const resume = (message.match(/<resume>\n([\s\S]*?)\n<\/resume>/) || [])[1] || '';
  return { criteria, resume };
}

function respond(body) {
  const { criteria, resume } = parseRequest(body);
  const rated = rateCriteria(criteria, resume);
  const strong = rated.filter((r) => r.rating >= 2 && r.evidence && !r.evidence.startsWith('Has '));
  const summary = strong.length
    ? `Relevant experience includes: ${strong.slice(0, 2).map((r) => r.evidence.replace(/\.$/, '')).join('; ')}.`
    : 'The resume shows little direct evidence for the requisition criteria.';
  const concerns = rated.filter((r) => r.rating === 0).slice(0, 3)
    .map((r) => `No evidence for ${r.id}: ${criteria.find((c) => c.id === r.id).text}.`);
  const text = JSON.stringify({ criteria: rated, summary, concerns });
  return {
    id: `msg_fake_${hash(text).toString(16)}`,
    type: 'message',
    role: 'assistant',
    model: body.model || 'claude-opus-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: Math.ceil(JSON.stringify(body).length / 4), output_tokens: Math.ceil(text.length / 4) },
  };
}

module.exports = { respond, rateCriteria, parseRequest, contentWords, sentences, stem };
