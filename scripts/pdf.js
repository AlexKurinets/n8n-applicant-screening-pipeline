'use strict';
// Synthetic attachment files. A text resume is real PDF text; a "scanned"
// resume is drawn shapes only, so it has no text layer at all, which is what
// a phone photo or a flatbed scan of a printed resume looks like to a parser.
const PDFDocument = require('pdfkit');

function toBuffer(draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 54, info: { Title: 'Resume', Producer: 'synthetic' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw(doc);
    doc.end();
  });
}

function resumePdf(text) {
  return toBuffer((doc) => {
    const [name, ...rest] = text.split('\n');
    doc.font('Helvetica-Bold').fontSize(18).text(name);
    doc.moveDown(0.3);
    for (const line of rest) {
      if (/^[A-Z][A-Z ]+$/.test(line)) doc.moveDown(0.4).font('Helvetica-Bold').fontSize(11).text(line);
      else doc.font('Helvetica').fontSize(10).text(line || ' ');
    }
  });
}

function scannedResumePdf(seed) {
  return toBuffer((doc) => {
    doc.rect(54, 54, 504, 684).fill('#f4f1ea');
    let y = 80;
    for (let i = 0; i < 34; i++) {
      const width = 220 + ((seed * 37 + i * 53) % 260);
      doc.rect(72, y, i % 9 === 0 ? 160 : width, i % 9 === 0 ? 9 : 6).fill('#3b3b3b');
      y += i % 9 === 0 ? 24 : 17;
    }
  });
}

function documentPdf(title, lines) {
  return toBuffer((doc) => {
    doc.font('Helvetica-Bold').fontSize(16).text(title);
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(11);
    for (const line of lines) doc.text(line);
  });
}

module.exports = { resumePdf, scannedResumePdf, documentPdf };
