'use strict';
// Versioned contracts between workflow steps. Every Code node that produces one
// of these shapes validates it before handing it on, so a portal layout change
// or a malformed model reply stops the run with a reason code instead of
// travelling downstream as empty fields.

const STATUSES = ['Shortlisted', 'Recruiter review', 'Low match', 'Screened out', 'Incomplete', 'Manual review'];
const BANDS = ['Shortlisted', 'Recruiter review', 'Low match'];
const ATTACHMENT_KINDS = ['resume', 'license', 'certification', 'other'];

const applicationV1 = {
  $id: 'application.v1',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'application_id', 'requisition_id', 'received_at', 'portal_status', 'csrf_token', 'candidate', 'attachments'],
  properties: {
    schema_version: { const: 'application.v1' },
    application_id: { type: 'string', pattern: '^A-\\d{5}$' },
    requisition_id: { type: 'string', pattern: '^REQ-\\d{3}$' },
    received_at: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T' },
    portal_status: { type: 'string', minLength: 1 },
    csrf_token: { type: 'string', minLength: 16 },
    candidate: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'email', 'phone', 'home_state', 'license_state', 'license_multistate', 'specialty', 'years_experience', 'shift_preference'],
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 120 },
        email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+$' },
        phone: { type: 'string', minLength: 7 },
        home_state: { type: 'string', pattern: '^[A-Z]{2}$' },
        license_state: { type: 'string', pattern: '^[A-Z]{2}$' },
        license_multistate: { type: 'boolean' },
        specialty: { type: 'string', minLength: 2 },
        years_experience: { type: 'number', minimum: 0, maximum: 60 },
        shift_preference: { enum: ['days', 'nights', 'any'] },
      },
    },
    attachments: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'url', 'filename'],
        properties: {
          kind: { enum: ATTACHMENT_KINDS },
          url: { type: 'string', pattern: '^/attachments/\\d+$' },
          filename: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

const requisitionV1 = {
  $id: 'requisition.v1',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'requisition_id', 'title', 'facility', 'boolean_screen', 'required_documents', 'criteria', 'recruiter_email', 'account_manager_email'],
  properties: {
    schema_version: { const: 'requisition.v1' },
    requisition_id: { type: 'string', pattern: '^REQ-\\d{3}$' },
    title: { type: 'string', minLength: 3 },
    facility: { type: 'string', minLength: 3 },
    boolean_screen: { type: 'string', minLength: 3 },
    required_documents: { type: 'array', items: { enum: ATTACHMENT_KINDS } },
    criteria: {
      type: 'array',
      minItems: 2,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text', 'weight', 'must_have'],
        properties: {
          id: { type: 'string', pattern: '^c\\d+$' },
          text: { type: 'string', minLength: 10 },
          weight: { type: 'integer', minimum: 1, maximum: 3 },
          must_have: { type: 'boolean' },
        },
      },
    },
    recruiter_email: { type: 'string', pattern: '@' },
    account_manager_email: { type: 'string', pattern: '@' },
  },
};

const prefilterV1 = {
  $id: 'prefilter.v1',
  type: 'object',
  additionalProperties: false,
  required: ['outcome', 'boolean_passed', 'failed_clauses', 'matched_terms', 'missing_documents'],
  properties: {
    outcome: { enum: ['score', 'screened_out', 'incomplete', 'unreadable'] },
    boolean_passed: { type: ['boolean', 'null'] },
    failed_clauses: { type: 'array', items: { type: 'string' } },
    matched_terms: { type: 'array', items: { type: 'string' } },
    missing_documents: { type: 'array', items: { type: 'string' } },
  },
};

// What the model must return. Sent to the API as the structured-output schema
// (structure only, see toApiSchema) and enforced in full by the Code node.
const modelOutputV1 = {
  $id: 'model_output.v1',
  type: 'object',
  additionalProperties: false,
  required: ['criteria', 'summary', 'concerns'],
  properties: {
    criteria: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'rating', 'evidence'],
        properties: {
          id: { type: 'string', pattern: '^c\\d+$' },
          rating: { type: 'integer', minimum: 0, maximum: 3 },
          evidence: { type: 'string', maxLength: 400 },
        },
      },
    },
    summary: { type: 'string', minLength: 20, maxLength: 900 },
    concerns: { type: 'array', maxItems: 5, items: { type: 'string', maxLength: 300 } },
  },
};

const screeningV1 = {
  $id: 'screening.v1',
  type: 'object',
  additionalProperties: false,
  required: ['score', 'band', 'criteria', 'ungrounded', 'must_have_gaps', 'summary', 'concerns', 'model', 'prompt_version'],
  properties: {
    score: { type: 'integer', minimum: 0, maximum: 100 },
    band: { enum: BANDS },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'text', 'weight', 'must_have', 'rating', 'evidence', 'grounded'],
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          weight: { type: 'integer' },
          must_have: { type: 'boolean' },
          rating: { type: 'integer', minimum: 0, maximum: 3 },
          evidence: { type: 'string' },
          grounded: { type: 'boolean' },
        },
      },
    },
    ungrounded: { type: 'integer', minimum: 0 },
    must_have_gaps: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
    concerns: { type: 'array', items: { type: 'string' } },
    model: { type: 'string', minLength: 1 },
    prompt_version: { type: 'string', minLength: 1 },
  },
};

const submittalV1 = {
  $id: 'submittal.v1',
  type: 'object',
  additionalProperties: false,
  required: ['schema_version', 'application_id', 'requisition', 'candidate', 'score', 'criteria', 'summary', 'generated_at'],
  properties: {
    schema_version: { const: 'submittal.v1' },
    application_id: { type: 'string', pattern: '^A-\\d{5}$' },
    requisition: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'title', 'facility'],
      properties: { id: { type: 'string' }, title: { type: 'string' }, facility: { type: 'string' } },
    },
    candidate: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'specialty', 'years_experience', 'license', 'shift_preference'],
      properties: {
        name: { type: 'string' },
        specialty: { type: 'string' },
        years_experience: { type: 'number' },
        license: { type: 'string' },
        shift_preference: { type: 'string' },
      },
    },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'rating_label', 'evidence'],
        properties: { text: { type: 'string' }, rating_label: { type: 'string' }, evidence: { type: 'string' } },
      },
    },
    summary: { type: 'string' },
    generated_at: { type: 'string' },
  },
};

module.exports = { STATUSES, BANDS, applicationV1, requisitionV1, prefilterV1, modelOutputV1, screeningV1, submittalV1 };
