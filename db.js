const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || __dirname;
const fs = require('fs');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'wrenchmark.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS contractors (
  id INTEGER PRIMARY KEY,
  legal_name TEXT NOT NULL,
  entity_name TEXT,
  entity_type TEXT,
  ein_last4 TEXT,
  phone TEXT,
  license_number TEXT,
  license_expiry TEXT,
  insurance_carrier TEXT,
  insurance_policy TEXT,
  insurance_expiry TEXT,
  coi_on_file INTEGER DEFAULT 0,
  agreement_signed_at TEXT,
  service_zones TEXT,
  job_types_approved TEXT,
  vehicle_classes_approved TEXT,
  parts_stocked TEXT,
  base_label TEXT,
  base_lat REAL,
  base_lng REAL,
  max_drive_minutes INTEGER DEFAULT 40,
  max_minutes_per_day INTEGER DEFAULT 480,
  training_completed_at TEXT,
  access_token TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vehicles (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  vin TEXT,
  year INTEGER,
  make TEXT,
  model TEXT,
  trim TEXT,
  vehicle_class TEXT,
  odometer_last INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  contractor_id INTEGER REFERENCES contractors(id),
  service_address TEXT,
  zone TEXT,
  lat REAL,
  lng REAL,
  est_minutes INTEGER,
  symptom_code TEXT NOT NULL,
  symptom_notes TEXT,
  requested_window TEXT,
  status TEXT DEFAULT 'quoted',
  outcome TEXT,
  abort_reason_code TEXT,
  triage_answers TEXT,
  triage_findings TEXT,
  predicted_code TEXT,
  predicted_confidence INTEGER,
  actual_code TEXT,
  prediction_correct INTEGER,
  safe_location TEXT,
  safety_level TEXT,
  public_token TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  accepted_at TEXT,
  arrived_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  version INTEGER DEFAULT 1,
  stage TEXT DEFAULT 'repair',
  labor_cents INTEGER DEFAULT 0,
  parts_cents INTEGER DEFAULT 0,
  trip_cents INTEGER DEFAULT 0,
  credit_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  low_cents INTEGER,
  high_cents INTEGER,
  presented_at TEXT DEFAULT (datetime('now')),
  accepted_at TEXT,
  declined_at TEXT
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  contractor_id INTEGER NOT NULL REFERENCES contractors(id),
  payout_cents INTEGER,
  wave INTEGER DEFAULT 0,
  score REAL,
  drive_minutes INTEGER,
  breakdown TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  responded_at TEXT
);

CREATE TABLE IF NOT EXISTS diagnoses (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  vin_confirmed TEXT,
  odometer INTEGER,
  fault_codes TEXT,
  system TEXT,
  component TEXT,
  findings_notes TEXT,
  labor_hours_est REAL,
  severity TEXT,
  recommendation TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS diagnosis_media (
  id INTEGER PRIMARY KEY,
  diagnosis_id INTEGER NOT NULL REFERENCES diagnoses(id),
  url TEXT NOT NULL,
  media_role TEXT,
  captured_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parts_lines (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  part_number TEXT,
  description TEXT,
  qty REAL DEFAULT 1,
  unit_cost_cents INTEGER DEFAULT 0,
  source TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  stage TEXT DEFAULT 'repair',
  provider_ref TEXT,
  authorized_cents INTEGER DEFAULT 0,
  captured_cents INTEGER DEFAULT 0,
  status TEXT DEFAULT 'none',
  authorized_at TEXT,
  captured_at TEXT,
  released_at TEXT
);

CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY,
  job_id INTEGER REFERENCES jobs(id),
  contractor_id INTEGER REFERENCES contractors(id),
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deferred_items (
  id INTEGER PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  system TEXT,
  note TEXT,
  urgency TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sms_outbox (
  id INTEGER PRIMARY KEY,
  to_phone TEXT,
  body TEXT,
  job_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_card (
  id INTEGER PRIMARY KEY,
  symptom_code TEXT NOT NULL,
  vehicle_class TEXT NOT NULL,
  labor_cents INTEGER NOT NULL,
  parts_cents INTEGER NOT NULL,
  trip_cents INTEGER NOT NULL,
  payout_pct REAL DEFAULT 0.65,
  mobile_eligible INTEGER DEFAULT 1,
  UNIQUE(symptom_code, vehicle_class)
);

CREATE TABLE IF NOT EXISTS funnel_events (
  id INTEGER PRIMARY KEY,
  session TEXT NOT NULL,
  step TEXT NOT NULL,
  branch TEXT,
  meta TEXT,
  job_id INTEGER REFERENCES jobs(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_funnel_session ON funnel_events(session);
CREATE INDEX IF NOT EXISTS idx_funnel_step ON funnel_events(step);
`);

function logEvent(job_id, contractor_id, event_type, payload) {
  db.prepare(
    `INSERT INTO job_events (job_id, contractor_id, event_type, payload) VALUES (?,?,?,?)`
  ).run(job_id, contractor_id || null, event_type, payload ? JSON.stringify(payload) : null);
}

module.exports = {
  logFunnel, attachFunnelJob, db, logEvent };

/* Funnel instrumentation. Separate from logEvent, which is a per-job audit trail:
   most people who leave never create a job, and they are exactly the ones worth
   counting. */
function logFunnel(session, step, { branch = null, meta = null, job_id = null } = {}) {
  if (!session) return;
  try {
    db.prepare(`INSERT INTO funnel_events (session, step, branch, meta, job_id)
                VALUES (?,?,?,?,?)`)
      .run(session, step, branch, meta ? JSON.stringify(meta) : null, job_id);
  } catch (e) { /* never let measurement break a booking */ }
}

function attachFunnelJob(session, job_id) {
  if (!session || !job_id) return;
  try { db.prepare(`UPDATE funnel_events SET job_id=? WHERE session=? AND job_id IS NULL`).run(job_id, session); }
  catch (e) {}
}
