const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, logEvent } = require('./db');
const { classFor } = require('./vehicles');
const GEO = require('./geo');
const M = require('./match');
const T = require('./triage');
const crypto = require('crypto');
require('./seed');
const V = require('./views');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS));

const storage = multer.diskStorage({
  destination: (r, f, cb) => cb(null, UPLOADS),
  filename: (r, f, cb) => cb(null, Date.now() + '-' + f.fieldname + path.extname(f.originalname || '.jpg')),
});
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } });

/* ---------------- payment provider (stub) ----------------
   Swap this object for Stripe. authorize -> PaymentIntent(capture_method:'manual'),
   capture -> paymentIntents.capture, release -> paymentIntents.cancel.
   The authorize/capture split IS the no fix, no fee promise. */
const payments = {
  authorize(job_id, cents, stage = 'repair') {
    const ref = 'auth_' + Math.random().toString(36).slice(2, 12);
    db.prepare(`INSERT INTO payments (job_id, stage, provider_ref, authorized_cents, status, authorized_at)
                VALUES (?,?,?,?,'authorized',datetime('now'))`).run(job_id, stage, ref, cents);
    logEvent(job_id, null, 'payment_authorized', { stage, cents, ref });
    return ref;
  },
  capture(job_id, stage = null) {
    const rows = stage
      ? db.prepare(`SELECT * FROM payments WHERE job_id=? AND stage=? AND status='authorized'`).all(job_id, stage)
      : db.prepare(`SELECT * FROM payments WHERE job_id=? AND status='authorized'`).all(job_id);
    let total = 0;
    for (const p of rows) {
      db.prepare(`UPDATE payments SET captured_cents=authorized_cents, status='captured',
                  captured_at=datetime('now') WHERE id=?`).run(p.id);
      total += p.authorized_cents;
    }
    if (total) logEvent(job_id, null, 'payment_captured', { stage: stage || 'all', cents: total });
    return total;
  },
  release(job_id, stage = null, reason = 'job not completed') {
    const q = stage
      ? db.prepare(`UPDATE payments SET status='released', released_at=datetime('now'), captured_cents=0
                    WHERE job_id=? AND stage=? AND status='authorized'`)
      : db.prepare(`UPDATE payments SET status='released', released_at=datetime('now'), captured_cents=0
                    WHERE job_id=? AND status='authorized'`);
    stage ? q.run(job_id, stage) : q.run(job_id);
    logEvent(job_id, null, 'payment_released', { stage: stage || 'all', reason });
  },
};

/* ---------------- sms provider (stub) ---------------- */
function sendSms(to_phone, body, job_id) {
  db.prepare(`INSERT INTO sms_outbox (to_phone, body, job_id) VALUES (?,?,?)`).run(to_phone, body, job_id);
}

/* ---------------- customer flow ---------------- */

/* ---------------- triage API ---------------- */
const sessions = new Map();
setInterval(() => {
  const cutoff = Date.now() - 45 * 60 * 1000;
  for (const [k, v] of sessions) if (v.t < cutoff) sessions.delete(k);
}, 300000);

const DIAGNOSTIC_CENTS = 8900;

app.post('/api/triage/start', express.json(), (req, res) => {
  const { safe_location } = req.body || {};
  const id = crypto.randomUUID();
  sessions.set(id, { t: Date.now(), scores: {}, safe_location, answers: [],
    informative: 0, safety: null, plan: [], step: 0, note: '' });
  // Options first, always. Typing a description of a fault you cannot name is
  // the hardest thing we could ask of someone standing next to a broken car.
  res.json({ session: id, question: { ...T.BOARD }, step: 1, total: 4, board: true });
});

app.post('/api/triage/answer', express.json(), (req, res) => {
  const { session, question_id, option_indexes } = req.body || {};
  const s = sessions.get(session);
  if (!s) return res.status(404).json({ error: 'session expired' });

  const qObj = question_id === 'board' ? T.BOARD : T.QUESTIONS[question_id];
  const r = T.applyAnswer(s.scores, qObj, option_indexes);
  s.scores = r.scores;
  s.informative += r.informative || 0;
  s.answers.push({ question_id, label: r.answerLabel });
  s.t = Date.now();

  if (r.safety && (!s.safety || r.safety === 'stop')) {
    s.safety = { level: r.safety, text: r.safety === 'stop'
      ? "That's the kind of thing we'd rather you didn't drive on. Leave it where it is — we come to the car."
      : 'Worth being careful with. Short trips only until someone has looked at it.' };
  }

  if (question_id === 'board') {
    const idxs = Array.isArray(option_indexes) ? option_indexes : [option_indexes];
    s.wantsNote = idxs.some((i) => (T.BOARD.options[i] || {}).wantsNote);
    s.plan = (r.informative > 0) ? T.planFor(s.scores) : ['driving_change', 'how_long'];
    s.step = 0;
    const first = s.plan[0];
    return res.json({ safety: s.safety, done: false,
      question: { id: first, ...T.QUESTIONS[first] }, step: 2, total: s.plan.length + 1 });
  }

  s.step += 1;
  const nextId = s.plan[s.step];
  if (nextId) {
    return res.json({ safety: s.safety, done: false,
      question: { id: nextId, ...T.QUESTIONS[nextId] },
      step: s.step + 2, total: s.plan.length + 1 });
  }

  // Questions done. Now — and only now — offer the keyboard.
  res.json({ safety: s.safety, done: false, ask_note: true, wants_note: !!s.wantsNote });
});

/* Optional free text, after the guided questions. Skippable. */
app.post('/api/triage/note', express.json(), async (req, res) => {
  const { session, text } = req.body || {};
  const s = sessions.get(session);
  if (!s) return res.status(404).json({ error: 'session expired' });

  let restate = null;
  if (text && text.trim()) {
    s.note = text.trim();
    const claude = await T.detectWithClaude(text);
    if (claude && Object.keys(claude.scores || {}).length) {
      for (const [c, v] of Object.entries(claude.scores)) s.scores[c] = (s.scores[c] || 0) + v;
      s.informative += 1;
      restate = claude.restate || null;
    } else {
      const r = T.applyNote(s.scores, text);
      s.scores = r.scores;
      s.informative += r.informative;
      if (r.safety && (!s.safety || r.safety.level === 'stop')) {
        s.safety = { level: r.safety.level, text: r.safety.text };
      }
    }
    s.answers.push({ question_id: 'note', label: s.note });
  }
  s.t = Date.now();

  const out = T.assess(s.scores, s.informative);
  s.assessment = out;
  s.lead_code = out.lead_code;
  res.json({ safety: s.safety, restate, done: true, ...out });
});

app.post('/api/triage/price', express.json(), (req, res) => {
  const { session, make, model } = req.body || {};
  const s = sessions.get(session);
  if (!s) return res.status(404).json({ error: 'session expired' });
  const vclass = classFor(make, model);
  const a = s.assessment || { rangeable: false, lead_code: 'other', no_range_reason: T.NO_RANGE_REASON.other };
  const code = a.lead_code || 'other';
  s.vclass = vclass;

  const rate = db.prepare(`SELECT * FROM rate_card WHERE symptom_code=? AND vehicle_class=?`).get(code, vclass);
  const payload = { diagnostic_cents: DIAGNOSTIC_CENTS, vehicle_class: vclass,
    mobile_eligible: rate ? !!rate.mobile_eligible : true,
    rangeable: !!a.rangeable, no_range_reason: a.no_range_reason || null };

  if (a.rangeable && rate) {
    const mid = rate.labor_cents + rate.parts_cents + rate.trip_cents;
    payload.low_cents = Math.round(mid * 0.84 / 500) * 500;
    payload.high_cents = Math.round(mid * 1.18 / 500) * 500;
  }
  res.json(payload);
});

app.get('/', (req, res) => res.send(V.intake()));

app.post('/book', (req, res) => {
  const b = req.body;
  const vclass = classFor(b.make, b.model);
  const code = b.symptom_code || 'other';
  const rate = db.prepare(`SELECT * FROM rate_card WHERE symptom_code=? AND vehicle_class=?`).get(code, vclass);
  if (!rate) return res.status(400).send('No rate card entry for that job and vehicle type.');

  const sess = b.triage_session ? sessions.get(b.triage_session) : null;

  const cust = db.prepare(`INSERT INTO customers (name, phone, email) VALUES (?,?,?)`)
    .run(b.name, b.phone, b.email || null);
  const veh = db.prepare(`INSERT INTO vehicles (customer_id, vin, year, make, model, vehicle_class, odometer_last)
    VALUES (?,?,?,?,?,?,?)`).run(cust.lastInsertRowid, (b.vin || '').trim().toUpperCase() || null,
    b.year || null, b.make, b.model, vclass, b.odometer || null);

  const loc = GEO.byCode[b.zone] || GEO.byCode['minneapolis_dt'];
  const token = crypto.randomBytes(9).toString('hex');
  const a = sess && sess.assessment ? sess.assessment : { certain: false, findings: [], rangeable: false };
  const findings = a.findings || [];
  const lead = findings.find((f) => f.lead) || findings[0] || null;

  const job = db.prepare(`INSERT INTO jobs (customer_id, vehicle_id, service_address, zone, lat, lng,
    est_minutes, symptom_code, symptom_notes, requested_window, status,
    triage_answers, triage_findings, predicted_code, predicted_confidence,
    safe_location, safety_level, public_token)
    VALUES (?,?,?,?,?,?,?,?,?,?,'quoted',?,?,?,?,?,?,?)`)
    .run(cust.lastInsertRowid, veh.lastInsertRowid, b.service_address, b.zone, loc.lat, loc.lng,
      M.jobMinutes(code), code, (sess && sess.note) || b.symptom_notes || null, b.requested_window,
      sess ? JSON.stringify(sess.answers) : null,
      findings.length ? JSON.stringify(findings) : null,
      a.lead_code || null, lead ? lead.confidence : null,
      sess ? sess.safe_location : null,
      sess && sess.safety ? sess.safety.level : null,
      token);

  // Stage 1: the diagnostic. Fixed, and the only thing authorized at booking.
  const mid = rate.labor_cents + rate.parts_cents + rate.trip_cents;
  const canRange = !!a.rangeable;
  db.prepare(`INSERT INTO quotes (job_id, stage, labor_cents, parts_cents, trip_cents, total_cents, low_cents, high_cents)
    VALUES (?,'diagnostic',?,0,0,?,?,?)`)
    .run(job.lastInsertRowid, DIAGNOSTIC_CENTS, DIAGNOSTIC_CENTS,
      canRange ? Math.round(mid * 0.84 / 500) * 500 : null,
      canRange ? Math.round(mid * 1.18 / 500) * 500 : null);

  logEvent(job.lastInsertRowid, null, 'triage_completed', {
    predicted: lead ? lead.code : null, confidence: lead ? lead.confidence : null,
    questions_answered: sess ? sess.answers.length : 0, safety: sess && sess.safety ? sess.safety.level : null });

  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(job.lastInsertRowid);
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=? AND stage='diagnostic'`).get(j.id);
  const vv = db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(j.vehicle_id);
  res.send(V.quoteView(j, vv, q, !!rate.mobile_eligible, findings, a));
});

/* ---------- matching context: what the engine needs to know right now ---------- */
function matchContext(job) {
  const veh = db.prepare(`SELECT vehicle_class FROM vehicles WHERE id=?`).get(job.vehicle_id);
  const loadRows = db.prepare(`
    SELECT contractor_id, COALESCE(SUM(est_minutes),0) mins FROM jobs
    WHERE contractor_id IS NOT NULL AND status IN ('accepted','completed')
      AND requested_window = ? GROUP BY contractor_id`).all(job.requested_window);
  const loadByContractor = Object.fromEntries(loadRows.map(r => [r.contractor_id, r.mins]));

  const compType = db.prepare(`SELECT contractor_id, symptom_code, COUNT(*) n FROM jobs
    WHERE status='completed' GROUP BY contractor_id, symptom_code`).all();
  const completionsByType = Object.fromEntries(compType.map(r => [`${r.contractor_id}:${r.symptom_code}`, r.n]));

  const compClass = db.prepare(`SELECT j.contractor_id, v.vehicle_class, COUNT(*) n FROM jobs j
    JOIN vehicles v ON v.id=j.vehicle_id WHERE j.status='completed'
    GROUP BY j.contractor_id, v.vehicle_class`).all();
  const completionsByClass = Object.fromEntries(compClass.map(r => [`${r.contractor_id}:${r.vehicle_class}`, r.n]));

  return {
    today: new Date().toISOString().slice(0, 10),
    vehicleClass: veh ? veh.vehicle_class : 'standard',
    loadByContractor, completionsByType, completionsByClass,
  };
}

function rankedFor(job) {
  const all = db.prepare(`SELECT * FROM contractors`).all();
  return M.rank(all, job, matchContext(job));
}

/* ---------- send one wave of offers ---------- */
function dispatchWave(job, waveIndex) {
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=? AND stage='diagnostic'`).get(job.id);
  const ranked = rankedFor(job);
  const slice = M.waveSlice(ranked, waveIndex);
  if (!slice.length) return 0;

  const expires = new Date(Date.now() + M.WAVE_SECONDS * 1000).toISOString().replace('T', ' ').slice(0, 19);

  for (const r of slice) {
    const est = q.low_cents ? Math.round((q.low_cents + q.high_cents) / 2) : q.total_cents;
    const payout = M.payoutCents(est, r.drive_minutes);
    db.prepare(`INSERT INTO offers (job_id, contractor_id, payout_cents, wave, score, drive_minutes, breakdown, expires_at)
      VALUES (?,?,?,?,?,?,?,?)`).run(job.id, r.contractor.id, payout, waveIndex,
      r.score, r.drive_minutes, JSON.stringify(r.breakdown), expires);
    logEvent(job.id, r.contractor.id, 'offer_sent', {
      wave: waveIndex, score: r.score, drive_minutes: r.drive_minutes, payout_cents: payout });
    sendSms(r.contractor.phone,
      `Wrenchmark ${V.jobRef(job.id)}: ${V.symLabel(job.symptom_code)}, ${r.drive_minutes} min away. Payout ${V.money(payout)}. Accept or decline: /tech/${r.contractor.id}`,
      job.id);
  }
  db.prepare(`UPDATE jobs SET status='offered' WHERE id=?`).run(job.id);
  return slice.length;
}

/* ---------- background: expire stale waves, cascade to the next ---------- */
setInterval(() => {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const stale = db.prepare(`
    SELECT DISTINCT job_id, wave FROM offers
    WHERE status='sent' AND expires_at IS NOT NULL AND expires_at < ?`).all(now);

  for (const row of stale) {
    db.prepare(`UPDATE offers SET status='expired', responded_at=datetime('now')
                WHERE job_id=? AND wave=? AND status='sent'`).run(row.job_id, row.wave);
    const job = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(row.job_id);
    if (!job || job.status !== 'offered') continue;

    logEvent(job.id, null, 'wave_expired', { wave: row.wave });
    const next = row.wave + 1;
    if (next >= M.MAX_WAVES || dispatchWave(job, next) === 0) {
      db.prepare(`UPDATE jobs SET status='unmatched' WHERE id=?`).run(job.id);
      logEvent(job.id, null, 'no_match', { waves_tried: next });
      payments.release(job.id);
      const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(job.customer_id);
      sendSms(cust.phone, `Wrenchmark ${V.jobRef(job.id)}: we couldn't find a mechanic for that window. Your card hold is released — nothing charged. A coordinator will call with other options.`, job.id);
    }
  }
}, 15000);

app.post('/jobs/:id/accept', (req, res) => {
  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(req.params.id);
  if (!j) return res.status(404).send('Job not found');
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=? AND stage='diagnostic'`).get(j.id);

  db.prepare(`UPDATE quotes SET accepted_at=datetime('now') WHERE id=?`).run(q.id);
  logEvent(j.id, null, 'diagnostic_accepted', { total_cents: q.total_cents });
  // Only the diagnostic is authorized now. The repair is authorized after approval.
  payments.authorize(j.id, q.total_cents, 'diagnostic');

  const sent = dispatchWave(j, 0);

  if (sent === 0) {
    db.prepare(`UPDATE jobs SET status='shop_routing' WHERE id=?`).run(j.id);
    logEvent(j.id, null, 'no_mobile_coverage', { zone: j.zone, symptom: j.symptom_code });
    payments.release(j.id);
    const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id);
    sendSms(cust.phone, `Wrenchmark ${V.jobRef(j.id)}: no mobile mechanic can cover this one. We've released the hold on your card and a coordinator will call you with a verified shop nearby.`, j.id);
    return res.redirect('/j/' + j.public_token);
  }

  res.redirect('/j/' + j.public_token);
});

/* ---------------- customer job page (token-scoped, no login) ---------------- */

function jobBundle(token) {
  const j = db.prepare(`SELECT * FROM jobs WHERE public_token=?`).get(token);
  if (!j) return null;
  return {
    job: j,
    cust: db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id),
    veh: db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(j.vehicle_id),
    diag: db.prepare(`SELECT * FROM quotes WHERE job_id=? AND stage='diagnostic'`).get(j.id),
    repair: db.prepare(`SELECT * FROM quotes WHERE job_id=? AND stage='repair' ORDER BY id DESC`).get(j.id),
    contractor: j.contractor_id ? db.prepare(`SELECT * FROM contractors WHERE id=?`).get(j.contractor_id) : null,
    dx: db.prepare(`SELECT * FROM diagnoses WHERE job_id=? ORDER BY id DESC`).get(j.id),
    pays: db.prepare(`SELECT * FROM payments WHERE job_id=?`).all(j.id),
    deferred: db.prepare(`SELECT * FROM deferred_items WHERE job_id=?`).all(j.id),
  };
}

app.get('/j/:token', (req, res) => {
  const b = jobBundle(req.params.token);
  if (!b) return res.status(404).send('Not found');
  const media = b.dx ? db.prepare(`SELECT * FROM diagnosis_media WHERE diagnosis_id=?`).all(b.dx.id) : [];
  const history = db.prepare(`
    SELECT j.*, d.system, d.component, d.recommendation FROM jobs j
    LEFT JOIN diagnoses d ON d.job_id=j.id
    WHERE j.vehicle_id=? AND j.status='completed' AND j.id<>? ORDER BY j.id DESC`).all(b.veh.id, b.job.id);
  res.send(V.customerJob(b, media, history));
});

/* Customer approves or declines the repair estimate. This is the moment the
   whole product exists for — evidence first, price second, decision theirs. */
app.post('/j/:token/approve', (req, res) => {
  const b = jobBundle(req.params.token);
  if (!b || !b.repair || b.repair.accepted_at) return res.redirect('/j/' + req.params.token);
  db.prepare(`UPDATE quotes SET accepted_at=datetime('now') WHERE id=?`).run(b.repair.id);
  db.prepare(`UPDATE jobs SET status='approved' WHERE id=?`).run(b.job.id);
  logEvent(b.job.id, b.job.contractor_id, 'repair_approved', {
    total_cents: b.repair.total_cents, credit_cents: b.repair.credit_cents });
  // Authorize the balance. The diagnostic already on hold covers the credit.
  const balance = Math.max(0, b.repair.total_cents - b.repair.credit_cents);
  if (balance > 0) payments.authorize(b.job.id, balance, 'repair');
  sendSms(b.contractor ? b.contractor.phone : '', `Wrenchmark ${V.jobRef(b.job.id)}: customer approved the repair. Go ahead.`, b.job.id);
  res.redirect('/j/' + req.params.token);
});

app.post('/j/:token/decline', (req, res) => {
  const b = jobBundle(req.params.token);
  if (!b || !b.repair || b.repair.accepted_at) return res.redirect('/j/' + req.params.token);
  db.prepare(`UPDATE quotes SET declined_at=datetime('now') WHERE id=?`).run(b.repair.id);
  db.prepare(`UPDATE jobs SET status='completed', outcome='diagnostic_only', completed_at=datetime('now')
              WHERE id=?`).run(b.job.id);
  logEvent(b.job.id, b.job.contractor_id, 'repair_declined', { total_cents: b.repair.total_cents });
  payments.capture(b.job.id, 'diagnostic'); // they still get the report and the photos
  sendSms(b.cust.phone, `Wrenchmark ${V.jobRef(b.job.id)}: understood — no repair. You're charged the ${V.money(b.diag.total_cents)} diagnostic only, and the full report with photos is yours to take anywhere.`, b.job.id);
  res.redirect('/j/' + req.params.token);
});

/* ---------------- contractor flow ---------------- */

app.get('/tech', (req, res) => {
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM offers o WHERE o.contractor_id=c.id AND o.status='sent') AS open
                           FROM contractors c ORDER BY c.id`).all();
  res.send(V.techPicker(rows));
});

app.get('/tech/:cid', (req, res) => {
  const c = db.prepare(`SELECT * FROM contractors WHERE id=?`).get(req.params.cid);
  if (!c) return res.status(404).send('Mechanic not found');
  const offers = db.prepare(`
    SELECT o.*, j.symptom_code, j.symptom_notes, j.service_address, j.requested_window, j.zone,
           j.est_minutes, v.year, v.make, v.model
    FROM offers o JOIN jobs j ON j.id=o.job_id JOIN vehicles v ON v.id=j.vehicle_id
    WHERE o.contractor_id=? AND o.status='sent' AND j.status='offered' ORDER BY o.id DESC`).all(c.id);
  const active = db.prepare(`
    SELECT j.*, v.year, v.make, v.model FROM jobs j JOIN vehicles v ON v.id=j.vehicle_id
    WHERE j.contractor_id=? AND j.status IN ('accepted','awaiting_approval','approved')
    ORDER BY j.id DESC`).all(c.id);
  res.send(V.techBoard(c, offers, active));
});

app.post('/offers/:id/accept', (req, res) => {
  const o = db.prepare(`SELECT * FROM offers WHERE id=?`).get(req.params.id);
  if (!o) return res.status(404).send('Offer not found');
  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(o.job_id);

  if (j.status !== 'offered') {
    logEvent(j.id, o.contractor_id, 'offer_lost', { reason: 'already taken' });
    db.prepare(`UPDATE offers SET status='expired', responded_at=datetime('now') WHERE id=?`).run(o.id);
    return res.redirect('/tech/' + o.contractor_id);
  }

  db.prepare(`UPDATE offers SET status='accepted', responded_at=datetime('now') WHERE id=?`).run(o.id);
  db.prepare(`UPDATE offers SET status='expired', responded_at=datetime('now')
              WHERE job_id=? AND id<>? AND status='sent'`).run(j.id, o.id);
  db.prepare(`UPDATE jobs SET contractor_id=?, status='accepted', accepted_at=datetime('now') WHERE id=?`)
    .run(o.contractor_id, j.id);
  logEvent(j.id, o.contractor_id, 'offer_accepted', {
    wave: o.wave, score: o.score, drive_minutes: o.drive_minutes, payout_cents: o.payout_cents });
  res.redirect('/tech/' + o.contractor_id);
});

app.post('/offers/:id/decline', (req, res) => {
  const o = db.prepare(`SELECT * FROM offers WHERE id=?`).get(req.params.id);
  if (!o) return res.status(404).send('Offer not found');
  db.prepare(`UPDATE offers SET status='declined', responded_at=datetime('now') WHERE id=?`).run(o.id);
  logEvent(o.job_id, o.contractor_id, 'offer_declined', null);
  res.redirect('/tech/' + o.contractor_id);
});

app.get('/tech/job/:jid', (req, res) => {
  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(req.params.jid);
  if (!j) return res.status(404).send('Job not found');
  const veh = db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(j.vehicle_id);
  const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id);
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=? AND stage='diagnostic'`).get(j.id);
  let findings = [], answers = [];
  try { findings = JSON.parse(j.triage_findings || '[]'); } catch {}
  try { answers = JSON.parse(j.triage_answers || '[]'); } catch {}
  if (j.status === 'approved') return res.send(V.completeForm(j, veh, cust, q));
  if (!j.arrived_at) {
    db.prepare(`UPDATE jobs SET arrived_at=datetime('now') WHERE id=?`).run(j.id);
    logEvent(j.id, j.contractor_id, 'arrived', null);
  }
  res.send(V.diagnosisForm(j, veh, cust, q, findings, answers));
});

const photoFields = upload.fields([
  { name: 'photo_fault', maxCount: 1 },
  { name: 'photo_part', maxCount: 1 },
  { name: 'photo_completed', maxCount: 1 },
]);

app.post('/tech/job/:jid/diagnosis', photoFields, (req, res) => {
  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(req.params.jid);
  if (!j) return res.status(404).send('Job not found');
  const b = req.body;
  const diagQ = db.prepare(`SELECT * FROM quotes WHERE job_id=? AND stage='diagnostic'`).get(j.id);
  const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id);

  const dx = db.prepare(`INSERT INTO diagnoses (job_id, vin_confirmed, odometer, fault_codes, system,
    component, findings_notes, labor_hours_est, severity, recommendation)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(j.id, b.vin_confirmed || null, b.odometer || null,
    b.fault_codes || null, b.system || null, b.component || null, b.findings_notes || null,
    b.labor_hours_est ? parseFloat(b.labor_hours_est) : null, b.severity || null, b.recommendation || null);

  if (b.vin_confirmed) db.prepare(`UPDATE vehicles SET vin=? WHERE id=?`).run(b.vin_confirmed, j.vehicle_id);
  if (b.odometer) db.prepare(`UPDATE vehicles SET odometer_last=? WHERE id=?`).run(b.odometer, j.vehicle_id);

  const files = req.files || {};
  const roleMap = { photo_fault: 'fault', photo_part: 'part', photo_completed: 'completed_work' };
  let shots = 0;
  for (const [field, role] of Object.entries(roleMap)) {
    const f = files[field]?.[0];
    if (f) {
      db.prepare(`INSERT INTO diagnosis_media (diagnosis_id, url, media_role) VALUES (?,?,?)`)
        .run(dx.lastInsertRowid, '/uploads/' + f.filename, role);
      shots++;
    }
  }

  // Did triage get it right? This one comparison is the data asset.
  const actual = b.actual_code || j.symptom_code;
  const correct = j.predicted_code ? (actual === j.predicted_code ? 1 : 0) : null;
  db.prepare(`UPDATE jobs SET actual_code=?, prediction_correct=? WHERE id=?`).run(actual, correct, j.id);
  logEvent(j.id, j.contractor_id, 'diagnosis_recorded', {
    predicted: j.predicted_code, actual, correct, fault_codes: b.fault_codes, photos: shots });

  // Things noticed but deliberately not fixed. Logged, never upsold on the spot.
  for (let i = 1; i <= 3; i++) {
    const note = (b['deferred_note_' + i] || '').trim();
    if (note) {
      db.prepare(`INSERT INTO deferred_items (job_id, vehicle_id, system, note, urgency)
        VALUES (?,?,?,?,?)`).run(j.id, j.vehicle_id, b['deferred_system_' + i] || null, note,
        b['deferred_urgency_' + i] || 'monitor');
    }
  }

  if (b.outcome === 'aborted') {
    db.prepare(`UPDATE jobs SET status='aborted', outcome='aborted', abort_reason_code=? WHERE id=?`)
      .run(b.abort_reason_code || 'unspecified', j.id);
    logEvent(j.id, j.contractor_id, 'aborted', { reason: b.abort_reason_code });
    payments.release(j.id, null, 'could not complete');
    sendSms(cust.phone, `Wrenchmark ${V.jobRef(j.id)}: we couldn't get this one done on site, so every hold on your card is released. You have not been charged a cent. Your report: /j/${j.public_token}`, j.id);
    return res.redirect('/tech/' + j.contractor_id);
  }

  // Diagnosis done. Build the repair quote and hand the decision to the customer.
  const labor = Math.round(parseFloat(b.repair_labor || 0) * 100);
  const parts = Math.round(parseFloat(b.repair_parts || 0) * 100);
  const total = labor + parts;
  const credit = diagQ ? diagQ.total_cents : 0;

  if (total > 0) {
    db.prepare(`INSERT INTO quotes (job_id, stage, labor_cents, parts_cents, trip_cents,
      credit_cents, total_cents) VALUES (?,'repair',?,?,0,?,?)`)
      .run(j.id, labor, parts, credit, total);
    db.prepare(`UPDATE jobs SET status='awaiting_approval' WHERE id=?`).run(j.id);
    logEvent(j.id, j.contractor_id, 'repair_quoted', { total_cents: total, credit_cents: credit });
    sendSms(cust.phone, `Wrenchmark ${V.jobRef(j.id)}: diagnosis done, with photos. ${b.recommendation || 'See the report'} — ${V.money(Math.max(0, total - credit))} more after your ${V.money(credit)} diagnostic credit. Approve or decline: /j/${j.public_token}`, j.id);
  } else {
    // Nothing to repair — the honest outcome nobody else offers.
    db.prepare(`UPDATE jobs SET status='completed', outcome='diagnostic_only', completed_at=datetime('now') WHERE id=?`).run(j.id);
    payments.capture(j.id, 'diagnostic');
    logEvent(j.id, j.contractor_id, 'diagnostic_only', { note: 'no repair required' });
    sendSms(cust.phone, `Wrenchmark ${V.jobRef(j.id)}: good news — nothing needs replacing. You're charged the diagnostic only. Full report: /j/${j.public_token}`, j.id);
  }
  res.redirect('/tech/' + j.contractor_id);
});

/* Mechanic marks the approved repair finished. */
app.post('/tech/job/:jid/complete', photoFields, (req, res) => {
  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(req.params.jid);
  if (!j || j.status !== 'approved') return res.redirect('/tech/' + (j ? j.contractor_id : ''));
  const dx = db.prepare(`SELECT * FROM diagnoses WHERE job_id=? ORDER BY id DESC`).get(j.id);
  const f = (req.files || {}).photo_completed?.[0];
  if (f && dx) {
    db.prepare(`INSERT INTO diagnosis_media (diagnosis_id, url, media_role) VALUES (?,?,'completed_work')`)
      .run(dx.id, '/uploads/' + f.filename);
  }
  db.prepare(`UPDATE jobs SET status='completed', outcome='completed', completed_at=datetime('now') WHERE id=?`).run(j.id);
  const captured = payments.capture(j.id);
  logEvent(j.id, j.contractor_id, 'completed', { captured_cents: captured });
  const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id);
  sendSms(cust.phone, `Wrenchmark ${V.jobRef(j.id)}: all done. Charged ${V.money(captured)} — exactly what you approved. Report and photos: /j/${j.public_token}`, j.id);
  res.redirect('/tech/' + j.contractor_id);
});

/* ---------------- admin ---------------- */

function metrics() {
  const booked = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status<>'quoted'`).get().c;
  const completed = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status='completed'`).get().c;
  const aborted = db.prepare(`SELECT COUNT(*) c FROM jobs WHERE status='aborted'`).get().c;
  const settled = completed + aborted;
  const captured = db.prepare(`SELECT COALESCE(SUM(captured_cents),0) s FROM payments WHERE status='captured'`).get().s;
  const varRow = db.prepare(`SELECT COALESCE(SUM(p.captured_cents),0) cap, COALESCE(SUM(q.total_cents),0) quo
    FROM jobs j JOIN quotes q ON q.job_id=j.id JOIN payments p ON p.job_id=j.id WHERE j.status='completed'`).get();
  const redo = db.prepare(`
    SELECT COUNT(*) c FROM diagnoses d1 JOIN jobs j1 ON j1.id=d1.job_id
    WHERE EXISTS (SELECT 1 FROM diagnoses d2 JOIN jobs j2 ON j2.id=d2.job_id
      WHERE j2.vehicle_id=j1.vehicle_id AND d2.system=d1.system AND d2.id<d1.id
      AND julianday(d1.created_at)-julianday(d2.created_at) <= 90)`).get().c;
  return {
    booked, completed,
    abortRate: settled ? Math.round((aborted / settled) * 100) : 0,
    variance: varRow.quo ? Math.round(((varRow.cap - varRow.quo) / varRow.quo) * 100) : 0,
    captured,
    redoRate: completed ? Math.round((redo / completed) * 100) : 0,
  };
}

app.get('/admin', (req, res) => {
  const jobs = db.prepare(`
    SELECT j.*, v.year, v.make, v.model, c.legal_name AS contractor,
           COALESCE(q.total_cents,0) total_cents, COALESCE(p.captured_cents,0) captured_cents
    FROM jobs j JOIN vehicles v ON v.id=j.vehicle_id
    LEFT JOIN contractors c ON c.id=j.contractor_id
    LEFT JOIN quotes q ON q.job_id=j.id
    LEFT JOIN payments p ON p.job_id=j.id
    ORDER BY j.id DESC`).all();
  const sms = db.prepare(`SELECT * FROM sms_outbox ORDER BY id DESC LIMIT 15`).all();
  res.send(V.adminHome(jobs, metrics(), sms));
});

app.get('/admin/dispatch', (req, res) => {
  const live = db.prepare(`
    SELECT j.*, v.year, v.make, v.model FROM jobs j JOIN vehicles v ON v.id=j.vehicle_id
    WHERE j.status IN ('offered','accepted') ORDER BY j.id DESC`).all();
  const contractors = db.prepare(`SELECT * FROM contractors`).all();
  const focusId = req.query.job ? Number(req.query.job) : (live[0] ? live[0].id : null);
  const focus = focusId ? db.prepare(`SELECT * FROM jobs WHERE id=?`).get(focusId) : null;
  const ranked = focus ? rankedFor(focus) : [];
  const focusVeh = focus ? db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(focus.vehicle_id) : null;
  const offers = focus ? db.prepare(`SELECT * FROM offers WHERE job_id=?`).all(focus.id) : [];
  res.send(V.dispatchView(live, contractors, focus, focusVeh, ranked, offers));
});

app.get('/admin/export.csv', (req, res) => {
  const rows = db.prepare(`
    SELECT j.id job_id, j.created_at, j.status, j.outcome, j.abort_reason_code, j.zone,
           j.symptom_code, v.vin, v.year, v.make, v.model, v.vehicle_class, v.odometer_last,
           d.system, d.component, d.fault_codes, d.labor_hours_est, d.severity, d.recommendation,
           q.labor_cents, q.parts_cents, q.trip_cents, q.total_cents,
           p.authorized_cents, p.captured_cents, p.status payment_status,
           c.legal_name contractor, c.entity_name contractor_entity,
           (SELECT COUNT(*) FROM diagnosis_media m WHERE m.diagnosis_id=d.id) photo_count
    FROM jobs j JOIN vehicles v ON v.id=j.vehicle_id
    LEFT JOIN diagnoses d ON d.job_id=j.id
    LEFT JOIN quotes q ON q.job_id=j.id
    LEFT JOIN payments p ON p.job_id=j.id
    LEFT JOIN contractors c ON c.id=j.contractor_id
    ORDER BY j.id`).all();
  const cols = rows.length ? Object.keys(rows[0]) : ['job_id'];
  const csv = [cols.join(',')].concat(rows.map((r) =>
    cols.map((k) => {
      const v = r[k] ?? '';
      return /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v;
    }).join(','))).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="wrenchmark-jobs.csv"');
  res.send(csv);
});

app.get('/admin/job/:id', (req, res) => {
  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(req.params.id);
  if (!j) return res.status(404).send('Job not found');
  const veh = db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(j.vehicle_id);
  const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id);
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=? ORDER BY version DESC`).get(j.id);
  const dx = db.prepare(`SELECT * FROM diagnoses WHERE job_id=? ORDER BY id DESC`).get(j.id);
  const media = dx ? db.prepare(`SELECT * FROM diagnosis_media WHERE diagnosis_id=?`).all(dx.id) : [];
  const pay = db.prepare(`SELECT * FROM payments WHERE job_id=?`).get(j.id);
  const events = db.prepare(`SELECT * FROM job_events WHERE job_id=? ORDER BY id`).all(j.id);
  const contractor = j.contractor_id ? db.prepare(`SELECT * FROM contractors WHERE id=?`).get(j.contractor_id) : null;
  res.send(V.jobReport(j, veh, cust, q, dx, media, pay, events, contractor));
});

app.listen(PORT, () => console.log(`Wrenchmark prototype running on http://localhost:${PORT}`));
