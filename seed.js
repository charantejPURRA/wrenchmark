const { db } = require('./db');

const SYMPTOMS = [
  { code: 'no_start', label: "Won't start", blurb: 'Dead, clicking, or cranks and quits', system: 'Starting & charging', icon: 'key' },
  { code: 'battery', label: 'Battery', blurb: 'Test and replace, on site', system: 'Starting & charging', icon: 'battery' },
  { code: 'alternator', label: 'Alternator', blurb: 'Battery light, dimming, not charging', system: 'Starting & charging', icon: 'bolt' },
  { code: 'starter', label: 'Starter', blurb: 'Single click, no crank', system: 'Starting & charging', icon: 'gear' },
  { code: 'brakes', label: 'Brakes', blurb: 'Pads, rotors, grinding or squeal', system: 'Brakes', icon: 'disc' },
  { code: 'oil_change', label: 'Oil change', blurb: 'Oil, filter, and a quick inspection', system: 'Maintenance', icon: 'drop' },
  { code: 'check_engine', label: 'Check engine light', blurb: 'Full code scan and diagnosis', system: 'Diagnostics', icon: 'engine' },
  { code: 'overheating', label: 'Overheating', blurb: 'Coolant, hoses, temperature gauge', system: 'Cooling', icon: 'temp' },
  { code: 'suspension', label: 'Suspension noise', blurb: 'Clunks, knocks, rough ride', system: 'Suspension', icon: 'wave' },
  { code: 'other', label: 'Something else', blurb: "Describe it and we'll diagnose", system: 'Diagnostics', icon: 'help' },
];

const CLASSES = ['economy', 'standard', 'truck_suv', 'euro_luxury'];

// base labor / parts / trip in cents for 'standard'; scaled per class
const BASE = {
  no_start:     [12000,     0, 4900],
  battery:      [ 8000, 21000, 4900],
  alternator:   [24000, 32000, 4900],
  starter:      [26000, 29000, 4900],
  brakes:       [22000, 26000, 4900],
  oil_change:   [ 6000,  8500, 4900],
  check_engine: [11000,     0, 4900],
  overheating:  [18000, 14000, 4900],
  suspension:   [15000,     0, 4900],
  other:        [11000,     0, 4900],
};

const CLASS_MULT = { economy: 0.9, standard: 1.0, truck_suv: 1.15, euro_luxury: 1.4 };

// jobs a mobile tech cannot complete on a driveway -> route to shop
const NOT_MOBILE = { overheating: ['euro_luxury'], suspension: ['truck_suv', 'euro_luxury'] };

const insRate = db.prepare(`INSERT OR IGNORE INTO rate_card
  (symptom_code, vehicle_class, labor_cents, parts_cents, trip_cents, payout_pct, mobile_eligible)
  VALUES (?,?,?,?,?,?,?)`);

for (const s of SYMPTOMS) {
  for (const c of CLASSES) {
    const [l, p, t] = BASE[s.code];
    const m = CLASS_MULT[c];
    const notMobile = (NOT_MOBILE[s.code] || []).includes(c);
    insRate.run(s.code, c, Math.round(l * m), Math.round(p * m), t, 0.65, notMobile ? 0 : 1);
  }
}

const contractors = [
  {
    legal_name: 'John Doe', entity_name: 'Doe Mobile Auto LLC', entity_type: 'LLC',
    ein_last4: '4417', phone: '+16125550142',
    license_number: 'MN-DLR-88213', license_expiry: '2027-03-31',
    insurance_carrier: 'Western National', insurance_policy: 'GL-2291884',
    insurance_expiry: '2027-01-15', coi_on_file: 1,
    agreement_signed_at: '2026-08-01',
    service_zones: JSON.stringify(['minneapolis', 'st_paul']),
    job_types_approved: JSON.stringify(['no_start','battery','alternator','starter','brakes','oil_change','check_engine']),
  },
  {
    legal_name: 'Marcus Reed', entity_name: 'Reed Wrench Works LLC', entity_type: 'LLC',
    ein_last4: '9032', phone: '+16515550188',
    license_number: 'MN-DLR-91007', license_expiry: '2026-11-30',
    insurance_carrier: 'Auto-Owners', insurance_policy: 'GL-7741220',
    insurance_expiry: '2026-12-01', coi_on_file: 1,
    agreement_signed_at: '2026-08-05',
    service_zones: JSON.stringify(['st_paul', 'bloomington']),
    job_types_approved: JSON.stringify(['no_start','battery','brakes','oil_change','check_engine','suspension','overheating']),
  },
];

const insC = db.prepare(`INSERT INTO contractors
  (legal_name, entity_name, entity_type, ein_last4, phone, license_number, license_expiry,
   insurance_carrier, insurance_policy, insurance_expiry, coi_on_file, agreement_signed_at,
   service_zones, job_types_approved)
  VALUES (@legal_name,@entity_name,@entity_type,@ein_last4,@phone,@license_number,@license_expiry,
   @insurance_carrier,@insurance_policy,@insurance_expiry,@coi_on_file,@agreement_signed_at,
   @service_zones,@job_types_approved)`);

if (db.prepare(`SELECT COUNT(*) c FROM contractors`).get().c === 0) {
  for (const c of contractors) insC.run(c);
}

module.exports = { SYMPTOMS, CLASSES };
