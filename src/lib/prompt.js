'use strict';
// The screening prompt. Its version is stored with every run, so a score can
// always be traced to the exact instructions that produced it.

const PROMPT_VERSION = 'screen-v3';

const SYSTEM_PROMPT = [
  'You screen job applications for a healthcare staffing agency.',
  'You receive one requisition with numbered criteria and one candidate resume with personal details removed.',
  'For each criterion, rate the evidence in the resume:',
  '0 = no evidence, 1 = weak or indirect evidence, 2 = partial evidence, 3 = clear and direct evidence.',
  'For every rating of 1 or more, copy the single sentence from the resume that supports it, word for word, into "evidence".',
  'Do not paraphrase, shorten or combine sentences. Use an empty string when the rating is 0.',
  'Rate only what the resume states. Do not infer experience that is not written down.',
  'Do not consider or mention age, gender, ethnicity, nationality, religion, disability, family status or any other protected characteristic.',
  'Write a neutral two or three sentence summary of relevant experience, and list up to three concerns a recruiter should check.',
  'Return one entry per criterion id, using the ids exactly as given.',
].join('\n');

function buildUserMessage(requisition, resumeText) {
  const criteria = requisition.criteria
    .map((c) => `${c.id}${c.must_have ? ' (must have)' : ''}: ${c.text}`)
    .join('\n');
  return [
    `<requisition id="${requisition.requisition_id}">`,
    `Title: ${requisition.title}`,
    'Criteria:',
    criteria,
    '</requisition>',
    '<resume>',
    resumeText,
    '</resume>',
  ].join('\n');
}

module.exports = { PROMPT_VERSION, SYSTEM_PROMPT, buildUserMessage };
