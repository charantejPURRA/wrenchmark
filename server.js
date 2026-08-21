const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db, logEvent } = require('./db');
const { classFor } = require('./vehicles');
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
  authorize(job_id, cents) {
    const ref = 'auth_' + Math.random().toString(36).slice(2, 12);
    db.prepare(`INSERT INTO payments (job_id, provider_ref, authorized_cents, status, authorized_at)
                VALUES (?,?,?,'authorized',datetime('now'))`).run(job_id, ref, cents);
    logEvent(job_id, null, 'payment_authorized', { cents, ref });
    return ref;
  },
  capture(job_id, cents) {
    db.prepare(`UPDATE payments SET captured_cents=?, status='captured', captured_at=datetime('now')
                WHERE job_id=?`).run(cents, job_id);
    logEvent(job_id, null, 'payment_captured', { cents });
  },
  release(job_id) {
    db.prepare(`UPDATE payments SET status='released', released_at=datetime('now'), captured_cents=0
                WHERE job_id=?`).run(job_id);
    logEvent(job_id, null, 'payment_released', { reason: 'job not completed' });
  },
};

/* ---------------- sms provider (stub) ---------------- */
function sendSms(to_phone, body, job_id) {
  db.prepare(`INSERT INTO sms_outbox (to_phone, body, job_id) VALUES (?,?,?)`).run(to_phone, body, job_id);
}

/* ---------------- customer flow ---------------- */

app.get('/', (req, res) => res.send(V.intake()));

app.post('/book', (req, res) => {
  const b = req.body;
  // Never trust the class from the client — derive it from the catalogue.
  const vclass = classFor(b.make, b.model);
  const rate = db.prepare(`SELECT * FROM rate_card WHERE symptom_code=? AND vehicle_class=?`)
    .get(b.symptom_code, vclass);
  if (!rate) return res.status(400).send('No rate card entry for that job and vehicle type.');

  const cust = db.prepare(`INSERT INTO customers (name, phone, email) VALUES (?,?,?)`)
    .run(b.name, b.phone, b.email || null);
  const veh = db.prepare(`INSERT INTO vehicles (customer_id, vin, year, make, model, vehicle_class, odometer_last)
    VALUES (?,?,?,?,?,?,?)`).run(cust.lastInsertRowid, (b.vin || '').trim().toUpperCase() || null,
    b.year || null, b.make, b.model, vclass, b.odometer || null);
  const job = db.prepare(`INSERT INTO jobs (customer_id, vehicle_id, service_address, zone, symptom_code,
    symptom_notes, requested_window, status) VALUES (?,?,?,?,?,?,?,'quoted')`)
    .run(cust.lastInsertRowid, veh.lastInsertRowid, b.service_address, b.zone, b.symptom_code,
      b.symptom_notes || null, b.requested_window);

  const total = rate.labor_cents + rate.parts_cents + rate.trip_cents;
  db.prepare(`INSERT INTO quotes (job_id, labor_cents, parts_cents, trip_cents, total_cents)
    VALUES (?,?,?,?,?)`).run(job.lastInsertRowid, rate.labor_cents, rate.parts_cents, rate.trip_cents, total);

  logEvent(job.lastInsertRowid, null, 'quote_presented', { total_cents: total, mobile_eligible: !!rate.mobile_eligible });

  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(job.lastInsertRowid);
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=?`).get(j.id);
  const vv = db.prepare(`SELECT * FROM vehicles WHERE id=?`).get(j.vehicle_id);
  res.send(V.quoteView(j, vv, q, !!rate.mobile_eligible));
});

app.post('/jobs/:id/accept', (req, res) => {
  const j = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(req.params.id);
  if (!j) return res.status(404).send('Job not found');
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=?`).get(j.id);

  db.prepare(`UPDATE quotes SET accepted_at=datetime('now') WHERE id=?`).run(q.id);
  db.prepare(`UPDATE jobs SET status='offered' WHERE id=?`).run(j.id);
  logEvent(j.id, null, 'quote_accepted', { total_cents: q.total_cents });
  payments.authorize(j.id, q.total_cents);

  // Offer to every eligible contractor in the zone. Offer / accept — never assign.
  const all = db.prepare(`SELECT * FROM contractors WHERE status='active' AND coi_on_file=1`).all();
  const eligible = all.filter((c) =>
    JSON.parse(c.service_zones || '[]').includes(j.zone) &&
    JSON.parse(c.job_types_approved || '[]').includes(j.symptom_code));

  const rate = db.prepare(`SELECT payout_pct FROM rate_card WHERE symptom_code=? AND vehicle_class=?`)
    .get(j.symptom_code, db.prepare(`SELECT vehicle_class FROM vehicles WHERE id=?`).get(j.vehicle_id).vehicle_class);
  const payout = Math.round(q.total_cents * (rate?.payout_pct ?? 0.65));

  // No eligible mobile mechanic — never sit on a customer's card. Release and route to a shop.
  if (eligible.length === 0) {
    db.prepare(`UPDATE jobs SET status='shop_routing' WHERE id=?`).run(j.id);
    logEvent(j.id, null, 'no_mobile_coverage', { zone: j.zone, symptom: j.symptom_code });
    payments.release(j.id);
    const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id);
    sendSms(cust.phone, `Wrenchmark ${V.jobRef(j.id)}: this repair needs shop equipment. We've released the hold on your card and a coordinator will call you with a verified shop nearby.`, j.id);
    return res.send(V.bookedView(j, 0));
  }

  for (const c of eligible) {
    db.prepare(`INSERT INTO offers (job_id, contractor_id, payout_cents) VALUES (?,?,?)`).run(j.id, c.id, payout);
    logEvent(j.id, c.id, 'offer_sent', { payout_cents: payout });
    sendSms(c.phone, `Wrenchmark ${V.jobRef(j.id)}: ${V.symLabel(j.symptom_code)} in ${j.zone}. Payout ${V.money(payout)}. Accept or decline: /tech/${c.id}`, j.id);
  }

  res.send(V.bookedView(j, eligible.length));
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
    SELECT o.*, j.symptom_code, j.symptom_notes, j.service_address, j.requested_window,
           v.year, v.make, v.model
    FROM offers o JOIN jobs j ON j.id=o.job_id JOIN vehicles v ON v.id=j.vehicle_id
    WHERE o.contractor_id=? AND o.status='sent' AND j.status='offered' ORDER BY o.id DESC`).all(c.id);
  const active = db.prepare(`
    SELECT j.*, v.year, v.make, v.model FROM jobs j JOIN vehicles v ON v.id=j.vehicle_id
    WHERE j.contractor_id=? AND j.status='accepted' ORDER BY j.id DESC`).all(c.id);
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
  logEvent(j.id, o.contractor_id, 'offer_accepted', { payout_cents: o.payout_cents });
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
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=? ORDER BY version DESC`).get(j.id);
  if (!j.arrived_at) {
    db.prepare(`UPDATE jobs SET arrived_at=datetime('now') WHERE id=?`).run(j.id);
    logEvent(j.id, j.contractor_id, 'arrived', null);
  }
  res.send(V.diagnosisForm(j, veh, cust, q));
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
  const q = db.prepare(`SELECT * FROM quotes WHERE job_id=? ORDER BY version DESC`).get(j.id);

  const dx = db.prepare(`INSERT INTO diagnoses (job_id, vin_confirmed, odometer, fault_codes, system,
    component, findings_notes, labor_hours_est, severity, recommendation)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(j.id, b.vin_confirmed || null, b.odometer || null,
    b.fault_codes || null, b.system || null, b.component || null, b.findings_notes || null,
    b.labor_hours_est ? parseFloat(b.labor_hours_est) : null, b.severity || null, b.recommendation || null);
  logEvent(j.id, j.contractor_id, 'diagnosis_recorded', { fault_codes: b.fault_codes, component: b.component });

  if (b.vin_confirmed) db.prepare(`UPDATE vehicles SET vin=? WHERE id=?`).run(b.vin_confirmed, j.vehicle_id);
  if (b.odometer) db.prepare(`UPDATE vehicles SET odometer_last=? WHERE id=?`).run(b.odometer, j.vehicle_id);

  const files = req.files || {};
  const roleMap = { photo_fault: 'fault', photo_part: 'part', photo_completed: 'completed_work' };
  let shotCount = 0;
  for (const [field, role] of Object.entries(roleMap)) {
    const f = files[field]?.[0];
    if (f) {
      db.prepare(`INSERT INTO diagnosis_media (diagnosis_id, url, media_role) VALUES (?,?,?)`)
        .run(dx.lastInsertRowid, '/uploads/' + f.filename, role);
      shotCount++;
    }
  }

  const completed = b.outcome === 'completed';
  if (completed) {
    db.prepare(`UPDATE jobs SET status='completed', outcome='completed', completed_at=datetime('now') WHERE id=?`).run(j.id);
    logEvent(j.id, j.contractor_id, 'completed', { photos: shotCount });
    payments.capture(j.id, q.total_cents);
    const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id);
    sendSms(cust.phone, `Wrenchmark ${V.jobRef(j.id)}: work complete. Charged ${V.money(q.total_cents)} — the price you were quoted. Your report and photos are on the way.`, j.id);
  } else {
    db.prepare(`UPDATE jobs SET status='aborted', outcome='aborted', abort_reason_code=? WHERE id=?`)
      .run(b.abort_reason_code || 'unspecified', j.id);
    logEvent(j.id, j.contractor_id, 'aborted', { reason: b.abort_reason_code });
    payments.release(j.id);
    const cust = db.prepare(`SELECT * FROM customers WHERE id=?`).get(j.customer_id);
    sendSms(cust.phone, `Wrenchmark ${V.jobRef(j.id)}: we couldn't finish this one on site, so the hold on your card is released. You have not been charged.`, j.id);
  }
  res.redirect('/admin/job/' + j.id);
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
