'use strict';
// Synthetic requisitions and applications. Every company, facility, place,
// person, email address and phone number here is invented. Generation is
// seeded, so every run of the seed produces the same 160 applications.
const { parse, evaluate } = require('../src/lib/boolean-query');
const { profileFields } = require('../src/code-nodes/boolean-prefilter');

const RECRUITERS = {
  dana: 'dana.whitlock@agency.example.com',
  ravi: 'ravi.anand@agency.example.com',
  june: 'june.castellanos@agency.example.com',
};
const ACCOUNT_MANAGERS = {
  marcus: 'marcus.feld@agency.example.com',
  priya: 'priya.oduya@agency.example.com',
};

const REQUISITIONS = [
  {
    id: 'REQ-101', title: 'ICU Registered Nurse, Nights (13-week travel)', facility: 'Harbor Point Medical Center',
    city: 'Port Ellison', state: 'TX', profession: 'rn', specialty: 'ICU', minYears: 2, licenseStates: ['TX'], newGradBlocked: true,
    boolean_screen: '("registered nurse" OR RN) AND (ICU OR "intensive care" OR "critical care") AND (license:TX OR license:compact) AND years>=2 AND NOT "new grad"',
    required_documents: ['resume', 'license'], recruiter: RECRUITERS.dana, accountManager: ACCOUNT_MANAGERS.marcus, shift: 'Nights',
    summary: (y) => `Registered nurse (RN) with ${y} in ICU settings.`,
    titles: ['Staff Nurse, Adult ICU', 'Travel RN, Critical Care'],
    criteria: [
      { id: 'c1', weight: 3, must_have: true, text: 'Two or more years of recent ICU or critical care nursing experience',
        strong: ['Critical care nursing experience in a 24-bed adult ICU, rotating days and nights.', 'Critical care nursing in a mixed medical and surgical ICU, including nights.'],
        partial: ['Floated to the ICU and step-down units during critical care staffing shortages.'],
        weak: ['Completed a critical care orientation module during hospital onboarding.'] },
      { id: 'c2', weight: 3, must_have: true, text: 'Current BLS and ACLS certifications',
        strong: ['BLS and ACLS certifications are current and renewed on schedule.'],
        partial: ['ACLS certified since 2021.'],
        weak: ['ACLS certified since 2021.'] },
      { id: 'c3', weight: 2, must_have: false, text: 'Experience managing ventilated patients and titrating vasoactive drips',
        strong: ['Managed ventilated patients and titrated vasoactive drips under unit protocols.'],
        partial: ['Cared for ventilated patients and assisted with vasoactive drips.'],
        weak: ['Familiar with ventilated patients from clinical rotations.'] },
      { id: 'c4', weight: 1, must_have: false, text: 'Prior travel or agency nursing assignments',
        strong: ['Completed three travel nursing assignments through a staffing agency.'],
        partial: ['Completed two travel assignments in other states.'],
        weak: ['Open to travel.'] },
    ],
  },
  {
    id: 'REQ-102', title: 'Emergency Department RN', facility: 'Sablewood General Hospital',
    city: 'Sablewood', state: 'AZ', profession: 'rn', specialty: 'Emergency', minYears: 2, licenseStates: ['AZ'],
    boolean_screen: '("registered nurse" OR RN) AND ("emergency department" OR ED OR ER OR trauma) AND (license:AZ OR license:compact) AND years>=2',
    required_documents: ['resume', 'license'], recruiter: RECRUITERS.ravi, accountManager: ACCOUNT_MANAGERS.marcus,
    summary: (y) => `Registered nurse (RN) with ${y} in the emergency department.`,
    titles: ['ED Staff Nurse', 'Travel RN, Emergency'],
    criteria: [
      { id: 'c1', weight: 3, must_have: true, text: 'Two or more years of emergency department nursing experience',
        strong: ['Emergency department nursing experience in a 40-bed ED with a trauma bay.'],
        partial: ['Picked up emergency department shifts as a float nurse.'],
        weak: ['Covered emergency holds on the observation unit.'] },
      { id: 'c2', weight: 3, must_have: true, text: 'Current TNCC or ENPC trauma nursing certification',
        strong: ['Holds a current TNCC trauma nursing certification.'],
        partial: ['Completed a trauma nursing course in 2025.'],
        weak: ['Completed a trauma nursing course in 2025.'] },
      { id: 'c3', weight: 2, must_have: false, text: 'Triage experience using the Emergency Severity Index',
        strong: ['Performed triage using the Emergency Severity Index for walk-in and ambulance arrivals.'],
        partial: ['Assisted the triage nurse during high-volume emergency shifts.'],
        weak: ['Assisted the triage nurse during high-volume emergency shifts.'] },
      { id: 'c4', weight: 1, must_have: false, text: 'Experience caring for pediatric patients in an emergency setting',
        strong: ['Cared for pediatric patients in a mixed adult and pediatric emergency setting.'],
        partial: ['Treated pediatric patients during community health fairs.'],
        weak: ['Treated pediatric patients during community health fairs.'] },
    ],
  },
  {
    id: 'REQ-103', title: 'Labor and Delivery RN', facility: 'Quillmont Community Medical Center',
    city: 'Quillmont', state: 'OR', profession: 'rn', specialty: 'Labor and Delivery', minYears: 1, licenseStates: null, newGradBlocked: true,
    boolean_screen: '("registered nurse" OR RN) AND ("labor and delivery" OR "L&D" OR obstetric*) AND years>=1 AND NOT "new grad"',
    required_documents: ['resume', 'license'], recruiter: RECRUITERS.june, accountManager: ACCOUNT_MANAGERS.priya,
    summary: (y) => `Registered nurse (RN) focused on L&D for ${y}.`,
    titles: ['L&D Staff Nurse', 'Travel RN, Obstetrics'],
    criteria: [
      { id: 'c1', weight: 3, must_have: true, text: 'Labor and delivery nursing experience including high-risk pregnancies',
        strong: ['Labor and delivery nursing experience with high-risk pregnancies.'],
        partial: ['Labor and delivery nursing in a community hospital birthing center.'],
        weak: ['Rotated through labor and delivery as a student nurse.'] },
      { id: 'c2', weight: 3, must_have: true, text: 'Current NRP certification and electronic fetal monitoring skills',
        strong: ['Current NRP certification; competent in electronic fetal monitoring.'],
        partial: ['Interprets electronic fetal monitoring strips during labor.'],
        weak: ['Interprets electronic fetal monitoring strips during labor.'] },
      { id: 'c3', weight: 2, must_have: false, text: 'Experience circulating or assisting in cesarean sections',
        strong: ['Circulated and assisted in cesarean sections in the obstetric operating room.'],
        partial: ['Prepared patients for scheduled cesarean sections.'],
        weak: ['Prepared patients for scheduled cesarean sections.'] },
      { id: 'c4', weight: 1, must_have: false, text: 'Postpartum and newborn care experience',
        strong: ['Provided postpartum and newborn care on a mother-baby unit.'],
        partial: ['Floated to postpartum when census was low.'],
        weak: ['Floated to postpartum when census was low.'] },
    ],
  },
  {
    id: 'REQ-104', title: 'Respiratory Therapist, ICU Coverage', facility: 'Ash & Willow Regional Hospital',
    city: 'Ashbourne Flats', state: 'NV', profession: 'rt', specialty: 'Respiratory Therapy', minYears: 1, licenseStates: null,
    boolean_screen: '("respiratory therapist" OR RRT) AND (ventilator* OR "mechanical ventilation") AND years>=1',
    required_documents: ['resume', 'license'], recruiter: RECRUITERS.ravi, accountManager: ACCOUNT_MANAGERS.priya,
    summary: (y, strong) => `${strong ? 'Registered' : 'Certified'} respiratory therapist with ${y} of ventilator care.`,
    titles: ['Respiratory Therapist II', 'Travel Respiratory Therapist'],
    criteria: [
      { id: 'c1', weight: 3, must_have: true, text: 'Registered Respiratory Therapist (RRT) credential',
        strong: ['Registered Respiratory Therapist (RRT) credential held since 2020.'],
        partial: ['Certified respiratory therapist (CRT).'],
        weak: ['Certified respiratory therapist (CRT).'] },
      { id: 'c2', weight: 3, must_have: true, text: 'Adult mechanical ventilation management in an ICU',
        strong: ['Managed adult mechanical ventilation in a 30-bed medical ICU.'],
        partial: ['Set up mechanical ventilation circuits for transport.'],
        weak: ['Set up mechanical ventilation circuits for transport.'] },
      { id: 'c3', weight: 2, must_have: false, text: 'Arterial blood gas sampling and analysis',
        strong: ['Performed arterial blood gas sampling and analysis on every shift.'],
        partial: ['Drew blood gases for the pulmonary clinic.'],
        weak: ['Drew blood gases for the pulmonary clinic.'] },
      { id: 'c4', weight: 1, must_have: false, text: 'Neonatal or pediatric respiratory care experience',
        strong: ['Provided neonatal and pediatric respiratory care in a level III NICU.'],
        partial: ['Covered pediatric respiratory treatments on weekends.'],
        weak: ['Covered pediatric respiratory treatments on weekends.'] },
    ],
  },
  {
    id: 'REQ-105', title: 'CT Technologist', facility: 'Northvale Health Partners',
    city: 'Northvale', state: 'WA', profession: 'ct', specialty: 'CT Imaging', minYears: 2, licenseStates: null,
    boolean_screen: '("radiologic technologist" OR "CT technologist" OR ARRT) AND (CT OR "computed tomography") AND years>=2',
    required_documents: ['resume', 'certification'], recruiter: RECRUITERS.june, accountManager: ACCOUNT_MANAGERS.marcus,
    summary: (y) => `Radiologic technologist with ${y} in CT imaging.`,
    titles: ['CT Technologist', 'Radiologic Technologist, CT'],
    criteria: [
      { id: 'c1', weight: 3, must_have: true, text: 'ARRT registration with CT post-primary certification',
        strong: ['ARRT registration with CT post-primary certification, both current.'],
        partial: ['ARRT registered radiologic technologist; CT certification in progress.'],
        weak: ['ARRT registered radiologic technologist; CT certification in progress.'] },
      { id: 'c2', weight: 3, must_have: true, text: 'Two or more years performing CT scans in a hospital',
        strong: ['Performed CT scans daily in a busy hospital imaging department.'],
        partial: ['Assisted with CT scans at an outpatient center.'],
        weak: ['Assisted with CT scans at an outpatient center.'] },
      { id: 'c3', weight: 2, must_have: false, text: 'Contrast injection and IV starts for CT angiography',
        strong: ['Managed contrast injection and IV starts for CT angiography studies.'],
        partial: ['Prepared contrast injection for CT studies.'],
        weak: ['Prepared contrast injection for CT studies.'] },
      { id: 'c4', weight: 1, must_have: false, text: 'Trauma and stroke protocol imaging experience',
        strong: ['Ran trauma and stroke protocol imaging for a regional stroke center.'],
        partial: ['Familiar with stroke protocol timing goals.'],
        weak: ['Familiar with stroke protocol timing goals.'] },
    ],
  },
  {
    id: 'REQ-106', title: 'Med-Surg RN, Days', facility: 'Brightwater Surgical Hospital',
    city: 'Brightwater', state: 'CO', profession: 'rn', specialty: 'Med-Surg', minYears: 0, licenseStates: ['CO'],
    boolean_screen: '("registered nurse" OR RN) AND ("med surg" OR "medical surgical" OR telemetry) AND (license:CO OR license:compact)',
    required_documents: ['resume', 'license'], recruiter: RECRUITERS.dana, accountManager: ACCOUNT_MANAGERS.priya, shift: 'Days',
    summary: (y) => `Registered nurse (RN) with ${y} on med-surg and telemetry units.`,
    titles: ['Staff Nurse, Med-Surg', 'Travel RN, Telemetry'],
    criteria: [
      { id: 'c1', weight: 3, must_have: true, text: 'Medical surgical or telemetry nursing experience',
        strong: ['Medical surgical and telemetry nursing experience on a 32-bed unit.'],
        partial: ['Floated to telemetry and medical units as needed.'],
        weak: ['Floated to telemetry and medical units as needed.'] },
      { id: 'c2', weight: 3, must_have: true, text: 'Current BLS certification',
        strong: ['BLS certification current through 2027.'],
        partial: ['BLS renewal due next month.'],
        weak: ['BLS renewal due next month.'] },
      { id: 'c3', weight: 2, must_have: false, text: 'Electronic health record charting and barcode medication administration',
        strong: ['Charted in electronic health records and used barcode medication administration on every pass.'],
        partial: ['Documented care in electronic health records.'],
        weak: ['Documented care in electronic health records.'] },
      { id: 'c4', weight: 1, must_have: false, text: 'Patient education and discharge planning experience',
        strong: ['Led patient education and discharge planning for post-surgical patients.'],
        partial: ['Reviewed discharge instructions with patients.'],
        weak: ['Reviewed discharge instructions with patients.'] },
    ],
  },
];

// How many applications of each kind each requisition receives.
const PLAN = {
  'REQ-101': { strong: 6, mid: 6, weak: 3, bool_specialty: 4, bool_license: 3, bool_years: 2, bool_newgrad: 2, incomplete: 2, scanned: 1, layout: 1 },
  'REQ-102': { strong: 5, mid: 6, weak: 4, bool_specialty: 5, bool_license: 3, bool_years: 3, incomplete: 1, scanned: 1 },
  'REQ-103': { strong: 4, mid: 6, weak: 3, bool_specialty: 5, bool_years: 2, bool_newgrad: 3, incomplete: 1, layout: 1 },
  'REQ-104': { strong: 4, mid: 5, weak: 3, bool_specialty: 7, bool_years: 3, incomplete: 1, scanned: 1 },
  'REQ-105': { strong: 4, mid: 5, weak: 3, bool_specialty: 8, bool_years: 3, incomplete: 2 },
  'REQ-106': { strong: 5, mid: 6, weak: 4, bool_specialty: 7, bool_license: 4, incomplete: 1, scanned: 1 },
};

const FIRST = ['Maya', 'Jonah', 'Priscilla', 'Tomas', 'Adaeze', 'Wren', 'Callum', 'Imani', 'Desmond', 'Lucía', 'Harriet', 'Kofi',
  'Noor', 'Elliot', 'Marisol', 'Teagan', 'Rafael', 'Ingrid', 'Bastian', 'Yara', 'Corinne', 'Emeka', 'Linnea', 'Arjun', 'Zoë', 'Thaddeus',
  'Siobhán', 'Odalys', 'Pieter', 'Saoirse'];
const LAST = ['Okonkwo', 'Hallberg', 'Marchetti', 'Delacroix', 'Ferreira', 'Abernathy', 'Nakashima', 'Lindqvist', 'Bramwell', 'Quintero',
  'Achterberg', 'Moreau', 'Valderrama', 'Ostrowski', 'Pemberton', 'Castellano', 'Iwu', 'Rasmussen', 'Thornbury', 'Ellingsen', 'Szabo',
  "O'Connell", 'Núñez', 'Dunmore-Ortega', 'Hartigan'];
const CITIES = ['Larkfield', 'Fallow Creek', 'Port Ellison', 'Quillmont', 'Sablewood', 'Northvale', 'Brightwater', 'Ashbourne Flats'];
const STREETS = ['Maple Street', 'Juniper Lane', 'Harbor Road', 'Cedar Avenue', 'Orchard Drive', 'Linden Court', 'Willow Way'];
const STATES = ['TX', 'AZ', 'OR', 'NV', 'WA', 'CO', 'NM', 'UT', 'OK', 'ID', 'KS', 'MT'];
const COMPACT_HOME = ['NM', 'UT', 'ID', 'KS', 'MT', 'TX', 'AZ', 'CO'];
const EMPLOYERS = ['Larkfield Regional Hospital', 'Fallow Creek Medical Center', 'Northvale Children\'s Hospital', 'Quillmont Valley Health',
  'Sablewood Community Hospital', 'Brightwater General'];
const SCHOOLS = ['Quillmont State University', 'Northvale College of Health Sciences', 'Fallow Creek Community College'];
const FILLER = {
  rn: ['Served as charge nurse on weekend shifts.', 'Precepted newly hired nurses on unit workflows.', 'Participated in the unit falls-prevention committee.'],
  rt: ['Maintained respiratory equipment logs and infection control checks.', 'Precepted respiratory therapy students on clinical rotations.'],
  ct: ['Performed daily quality control on imaging equipment.', 'Trained front desk staff on patient screening forms.'],
};
const PROFESSION_LICENSE = { rn: 'Registered Nurse license', rt: 'Respiratory Care Practitioner license', ct: 'State radiologic technologist license' };
const PROFESSION_DEGREE = { rn: 'Bachelor of Science in Nursing', rt: 'Associate of Science in Respiratory Care', ct: 'Associate of Applied Science in Radiologic Technology' };

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rnd, list) {
  return list[Math.floor(rnd() * list.length)];
}

function shuffle(rnd, list) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Which sentence strength each criterion gets, by kind of applicant.
const TIER_MIX = {
  strong: [['strong', 'strong', 'partial'], ['strong'], ['strong', 'partial'], ['strong', 'partial', 'none']],
  mid: [['partial', 'strong'], ['weak', 'strong', 'none'], ['partial', 'none'], ['none', 'weak', 'partial']],
  weak: [['weak', 'none'], ['none', 'weak'], ['none'], ['weak', 'none']],
};

function evidenceSentences(rnd, req, tier) {
  const mix = TIER_MIX[tier] || TIER_MIX.mid;
  const out = [];
  req.criteria.forEach((c, i) => {
    const level = pick(rnd, mix[i]);
    if (level !== 'none') out.push(pick(rnd, c[level]));
  });
  return out;
}

function buildCandidate(rnd, n, req, kind) {
  const first = FIRST[n % FIRST.length];
  const last = LAST[(n * 7 + 3) % LAST.length];
  const name = `${first} ${last}`;
  const ascii = (s) => s.normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase();
  const email = `${ascii(first)}.${ascii(last)}${n}@example.com`;
  const phone = `555-01${String(n % 100).padStart(2, '0')}`;
  const home = req.licenseStates && kind !== 'bool_license' ? pick(rnd, [req.state, req.state, ...COMPACT_HOME]) : pick(rnd, STATES);

  let licenseState = home;
  let multistate = COMPACT_HOME.includes(home) && rnd() < 0.6;
  if (req.licenseStates && kind !== 'bool_license' && !multistate) licenseState = req.state;
  if (kind === 'bool_license') {
    licenseState = pick(rnd, STATES.filter((s) => !req.licenseStates.includes(s)));
    multistate = false;
  }

  let years = req.minYears + 1 + Math.floor(rnd() * 6);
  if (kind === 'bool_years') years = req.minYears >= 2 ? 1 : 0.5;
  if (kind === 'bool_newgrad') years = Math.max(req.minYears, 1);

  return {
    name, email, phone,
    city: pick(rnd, CITIES),
    street: `${100 + Math.floor(rnd() * 8800)} ${pick(rnd, STREETS)}`,
    home_state: home,
    license_state: licenseState,
    license_multistate: multistate,
    specialty: req.specialty,
    years_experience: years,
    shift_preference: req.shift || pick(rnd, ['Days', 'Nights', 'Any']),
  };
}

function yearsPhrase(y) {
  if (y < 1) return 'six months';
  return y === 1 ? '1 year' : `${y} years`;
}

function resumeText(rnd, candidate, req, lines, opts = {}) {
  const prof = req.profession;
  const summary = opts.summary || req.summary(yearsPhrase(candidate.years_experience), opts.tier === 'strong');
  const [title1, title2] = req.titles;
  const half = Math.ceil(lines.length / 2);
  const startYear = 2026 - Math.max(1, Math.ceil(candidate.years_experience));
  const multistate = candidate.license_multistate ? ' (multistate)' : '';
  return [
    candidate.name,
    `${candidate.city}, ${candidate.home_state} · ${candidate.email} · ${candidate.phone}`,
    `${candidate.street}, ${candidate.city}, ${candidate.home_state}`,
    '',
    'SUMMARY',
    summary,
    '',
    'EXPERIENCE',
    `${title1}, ${pick(rnd, EMPLOYERS)}, ${startYear} to present`,
    ...lines.slice(0, half).map((s) => `- ${s}`),
    `- ${pick(rnd, FILLER[prof])}`,
    `${title2}, ${pick(rnd, EMPLOYERS)}, ${startYear - 2} to ${startYear}`,
    ...lines.slice(half).map((s) => `- ${s}`),
    '',
    'LICENSES AND CERTIFICATIONS',
    `- ${PROFESSION_LICENSE[prof]}, ${candidate.license_state}${multistate}.`,
    '',
    'EDUCATION',
    `- ${PROFESSION_DEGREE[prof]}, ${pick(rnd, SCHOOLS)}`,
  ].join('\n');
}

function screenPasses(req, candidate, text, kinds) {
  const application = {
    candidate: { ...candidate, shift_preference: String(candidate.shift_preference).toLowerCase() },
    attachments: kinds.map((kind) => ({ kind })),
  };
  return evaluate(parse(req.boolean_screen), { text: `${candidate.specialty}\n${text}`, fields: profileFields(application) }).passed;
}

function generateApplications() {
  const rnd = mulberry32(20260914);
  const slots = [];
  for (const req of REQUISITIONS) {
    for (const [kind, count] of Object.entries(PLAN[req.id])) {
      for (let i = 0; i < count; i++) slots.push({ req, kind });
    }
  }
  const ordered = shuffle(rnd, slots);
  const faultable = shuffle(rnd, ordered.map((_, i) => i).filter((i) => ordered[i].kind !== 'layout'));
  const transient = new Set(faultable.slice(0, 6));
  const expiry = new Set(faultable.slice(6, 12));
  const weekStart = Date.UTC(2026, 8, 14, 13, 0, 0);

  return ordered.map(({ req, kind }, i) => {
    const n = i + 1;
    let candidate = buildCandidate(rnd, n, req, kind);
    const kinds = ['resume', req.required_documents[1]];
    if (kind === 'incomplete') kinds.splice(n % 2 === 0 ? 0 : 1, 1);

    let text;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (kind === 'bool_specialty') {
        const other = pick(rnd, REQUISITIONS.filter((r) => r.id !== req.id));
        const borrowed = { ...candidate, specialty: other.specialty };
        text = resumeText(rnd, borrowed, other, evidenceSentences(rnd, other, 'strong'), { tier: 'strong' });
        candidate = borrowed;
      } else if (kind === 'bool_newgrad') {
        text = resumeText(rnd, candidate, req, evidenceSentences(rnd, req, 'weak'),
          { summary: `New grad registered nurse (RN) finishing a ${req.specialty} residency.` });
      } else {
        const tier = ['strong', 'mid', 'weak'].includes(kind) ? kind : 'mid';
        text = resumeText(rnd, candidate, req, evidenceSentences(rnd, req, tier), { tier });
      }
      const shouldPass = !kind.startsWith('bool_');
      if (screenPasses(req, candidate, text, kinds) === shouldPass) break;
      if (attempt === 49) throw new Error(`could not generate a ${kind} application for ${req.id}`);
    }

    // Spread received times over Monday to Friday, 07:00 to 17:00 local.
    const day = Math.floor((i / 160) * 5);
    const minutes = Math.floor(rnd() * 600);
    const receivedAt = new Date(weekStart + day * 86400000 + minutes * 60000).toISOString();

    return {
      id: `A-${10000 + n}`,
      requisition_id: req.id,
      kind,
      candidate,
      resume_text: text,
      attachment_kinds: kinds,
      received_at: receivedAt,
      fault: kind === 'layout' ? 'layout_v2' : transient.has(i) ? 'transient_503' : expiry.has(i) ? 'session_expiry' : null,
      scanned: kind === 'scanned',
    };
  });
}

// The application the Loom demo submits live, through the public apply form.
function demoApplication() {
  const req = REQUISITIONS[0];
  const candidate = {
    name: 'Siobhán Ortega-Dunmore', email: 'siobhan.ortega-dunmore@example.com', phone: '555-0142',
    city: 'Larkfield', street: '2210 Juniper Lane', home_state: 'NM', license_state: 'NM', license_multistate: true,
    specialty: 'ICU', years_experience: 5, shift_preference: 'Nights',
  };
  const lines = [
    req.criteria[0].strong[0], req.criteria[1].strong[0], req.criteria[2].strong[0], req.criteria[3].partial[0],
  ];
  const rnd = mulberry32(42);
  return { requisition_id: req.id, candidate, resume_text: resumeText(rnd, candidate, req, lines, { tier: 'strong' }), attachment_kinds: ['resume', 'license'] };
}

module.exports = { REQUISITIONS, PLAN, generateApplications, demoApplication, mulberry32 };
