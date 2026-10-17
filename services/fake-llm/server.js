'use strict';
// Offline stand-in for POST /v1/messages. Point settings.llm_base_url at the
// real API (and give the n8n "Anthropic" credential a real key) to use Claude.
const express = require('express');
const { respond } = require('./model');

const app = express();
app.use(express.json({ limit: '5mb' }));

const state = { outage: false, requests: 0, rejected: 0 };

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/admin/state', (req, res) => res.json(state));
app.post('/admin/outage', (req, res) => {
  state.outage = Boolean(req.body && req.body.on);
  res.json(state);
});

app.post('/v1/messages', (req, res) => {
  state.requests += 1;
  if (!req.get('x-api-key')) {
    return res.status(401).json({ type: 'error', error: { type: 'authentication_error', message: 'x-api-key header is required' } });
  }
  if (state.outage) {
    state.rejected += 1;
    return res.status(529).json({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
  }
  const body = req.body || {};
  if (!body.model || !Array.isArray(body.messages) || !body.max_tokens) {
    return res.status(400).json({ type: 'error', error: { type: 'invalid_request_error', message: 'model, max_tokens and messages are required' } });
  }
  return res.json(respond(body));
});

const port = Number(process.env.PORT || 8060);
app.listen(port, () => console.log(`fake-llm listening on ${port}`));
