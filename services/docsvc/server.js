'use strict';
// Document service: resume text extraction and Word submittal rendering.
// n8n calls it with HTTP Request nodes; the dashboard links to stored files.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { extractText, renderDocx, submittalView } = require('./documents');

const OUT_DIR = process.env.DOCUMENT_DIR || '/data/documents';
fs.mkdirSync(OUT_DIR, { recursive: true });

const app = express();

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.post('/extract', express.raw({ type: () => true, limit: '20mb' }), async (req, res) => {
  try {
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'empty body' });
    return res.json(await extractText(req.body));
  } catch (e) {
    return res.status(422).json({ error: `could not extract text: ${e.message}` });
  }
});

app.post('/render', express.json({ limit: '2mb' }), (req, res) => {
  const { template, data, filename } = req.body || {};
  if (!filename || !/^[\w.-]+\.docx$/.test(filename)) return res.status(400).json({ error: 'filename must be a plain .docx name' });
  try {
    const buffer = renderDocx(template, submittalView(data));
    fs.writeFileSync(path.join(OUT_DIR, filename), buffer);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(buffer);
  } catch (e) {
    return res.status(e.status || 422).json({ error: e.message });
  }
});

app.get('/documents/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const file = path.join(OUT_DIR, name);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'not found' });
  return res.download(file, name);
});

const port = Number(process.env.PORT || 8070);
app.listen(port, () => console.log(`docsvc listening on ${port}`));
