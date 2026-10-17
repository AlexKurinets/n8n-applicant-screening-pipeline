'use strict';
// Text extraction and Word rendering, kept free of HTTP so they can be tested
// directly. Extraction sniffs the file's first bytes rather than trusting the
// filename or the content type the portal sent.
const fs = require('node:fs');
const path = require('node:path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const mammoth = require('mammoth');

let unpdf;
const loadUnpdf = async () => (unpdf ||= await import('unpdf'));

const TEMPLATE_DIR = process.env.TEMPLATE_DIR || path.join(__dirname, '..', '..', 'templates');

function sniff(buffer) {
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'docx';
  return 'text';
}

async function extractText(buffer) {
  const format = sniff(buffer);
  if (format === 'pdf') {
    const { extractText: pdfText } = await loadUnpdf();
    const out = await pdfText(new Uint8Array(buffer), { mergePages: true });
    const text = String(out.text).trim();
    return { format, pages: out.totalPages, chars: text.replace(/\s+/g, '').length, text };
  }
  if (format === 'docx') {
    const out = await mammoth.extractRawText({ buffer });
    const text = out.value.trim();
    return { format, pages: null, chars: text.replace(/\s+/g, '').length, text };
  }
  const text = buffer.toString('utf8').trim();
  return { format, pages: null, chars: text.replace(/\s+/g, '').length, text };
}

const TEMPLATES = { 'submittal-profile': 'submittal-profile.docx' };

// docxtemplater escapes XML itself, so "Ash & Willow" or "O'Connell" render as
// written. The first version of this step string-replaced into document.xml
// and produced a corrupt file whenever a field held an ampersand.
function renderDocx(templateName, data) {
  const file = TEMPLATES[templateName];
  if (!file) throw Object.assign(new Error(`unknown template ${templateName}`), { status: 400 });
  const zip = new PizZip(fs.readFileSync(path.join(TEMPLATE_DIR, file)));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, nullGetter: () => '' });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// The template uses flat tags ({cand_name}, {req_title}) so Word users can
// edit it without knowing docxtemplater's expression syntax.
function submittalView(payload) {
  const { requisition: req, candidate: cand } = payload;
  return {
    application_id: payload.application_id,
    req_id: req.id,
    req_title: req.title,
    req_facility: req.facility,
    cand_name: cand.name,
    cand_specialty: cand.specialty,
    cand_license: cand.license,
    cand_shift: cand.shift_preference,
    years: cand.years_experience,
    score: payload.score,
    summary: payload.summary,
    criteria: payload.criteria,
    generated_date: new Date(payload.generated_at).toISOString().slice(0, 10),
  };
}

module.exports = { sniff, extractText, renderDocx, submittalView };
