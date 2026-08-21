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
    agreement_signed_at: '2026-08-01', training_completed_at: '2026-08-04',
    base_label: 'Minneapolis — South', base_lat: 44.9330, base_lng: -93.2620,
    max_drive_minutes: 40, max_minutes_per_day: 480,
    service_zones: JSON.stringify(['minneapolis_dt','minneapolis_s','minneapolis_ne','st_louis_park','richfield','edina']),
    job_types_approved: JSON.stringify(['no_start','battery','alternator','starter','brakes','oil_change','check_engine']),
    vehicle_classes_approved: JSON.stringify(['economy','standard','truck_suv']),
    parts_stocked: JSON.stringify(['battery','oil_change','brakes','starter']),
  },
  {
    legal_name: 'Marcus Reed', entity_name: 'Reed Wrench Works LLC', entity_type: 'LLC',
    ein_last4: '9032', phone: '+16515550188',
    license_number: 'MN-DLR-91007', license_expiry: '2027-11-30',
    insurance_carrier: 'Auto-Owners', insurance_policy: 'GL-7741220',
    insurance_expiry: '2027-12-01', coi_on_file: 1,
    agreement_signed_at: '2026-08-05', training_completed_at: '2026-08-09',
    base_label: 'St. Paul — Downtown', base_lat: 44.9537, base_lng: -93.0900,
    max_drive_minutes: 45, max_minutes_per_day: 540,
    service_zones: JSON.stringify(['st_paul_dt','st_paul_e','woodbury','roseville','eagan']),
    job_types_approved: JSON.stringify(['no_start','battery','brakes','oil_change','check_engine','suspension','overheating','alternator']),
    vehicle_classes_approved: JSON.stringify(['economy','standard','truck_suv','euro_luxury']),
    parts_stocked: JSON.stringify(['battery','oil_change','alternator']),
  },
  {
    legal_name: 'Dani Alvarez', entity_name: 'Alvarez Auto Service LLC', entity_type: 'LLC',
    ein_last4: '2260', phone: '+19525550164',
    license_number: 'MN-DLR-94551', license_expiry: '2027-06-30',
    insurance_carrier: 'Grinnell Mutual', insurance_policy: 'GL-5518902',
    insurance_expiry: '2027-05-20', coi_on_file: 1,
    agreement_signed_at: '2026-08-02', training_completed_at: '2026-08-07',
    base_label: 'Bloomington', base_lat: 44.8408, base_lng: -93.2983,
    max_drive_minutes: 35, max_minutes_per_day: 420,
    service_zones: JSON.stringify(['bloomington','edina','richfield','burnsville','eagan','apple_valley']),
    job_types_approved: JSON.stringify(['no_start','battery','starter','alternator','oil_change','check_engine','overheating']),
    vehicle_classes_approved: JSON.stringify(['economy','standard','truck_suv','euro_luxury']),
    parts_stocked: JSON.stringify(['battery','starter','alternator','oil_change']),
  },
  {
    legal_name: 'Ty Nguyen', entity_name: 'Northline Mobile Repair LLC', entity_type: 'LLC',
    ein_last4: '7714', phone: '+17635550119',
    license_number: 'MN-DLR-90882', license_expiry: '2027-09-30',
    insurance_carrier: 'Western National', insurance_policy: 'GL-6640117',
    insurance_expiry: '2027-08-15', coi_on_file: 1,
    agreement_signed_at: '2026-08-08', training_completed_at: '2026-08-12',
    base_label: 'Maple Grove', base_lat: 45.0725, base_lng: -93.4557,
    max_drive_minutes: 45, max_minutes_per_day: 480,
    service_zones: JSON.stringify(['maple_grove','plymouth','brooklyn_park','minnetonka','minneapolis_ne']),
    job_types_approved: JSON.stringify(['no_start','battery','brakes','oil_change','check_engine','suspension']),
    vehicle_classes_approved: JSON.stringify(['economy','standard','truck_suv']),
    parts_stocked: JSON.stringify(['battery','brakes','oil_change']),
  },
  {
    legal_name: 'Priya Raman', entity_name: 'Raman Diagnostics LLC', entity_type: 'LLC',
    ein_last4: '3391', phone: '+16125550177',
    license_number: 'MN-DLR-95120', license_expiry: '2028-01-31',
    insurance_carrier: 'Auto-Owners', insurance_policy: 'GL-8802441',
    insurance_expiry: '2027-11-10', coi_on_file: 1,
    agreement_signed_at: '2026-08-10',
    training_completed_at: null,  // in training — gated out of dispatch
    base_label: 'Roseville', base_lat: 45.0061, base_lng: -93.1566,
    max_drive_minutes: 40, max_minutes_per_day: 360,
    service_zones: JSON.stringify(['roseville','st_paul_dt','minneapolis_ne']),
    job_types_approved: JSON.stringify(['check_engine','no_start','battery','alternator']),
    vehicle_classes_approved: JSON.stringify(['economy','standard','truck_suv','euro_luxury']),
    parts_stocked: JSON.stringify(['battery']),
  },
];

const insC = db.prepare(`INSERT INTO contractors
  (legal_name, entity_name, entity_type, ein_last4, phone, license_number, license_expiry,
   insurance_carrier, insurance_policy, insurance_expiry, coi_on_file, agreement_signed_at,
   training_completed_at, base_label, base_lat, base_lng, max_drive_minutes, max_minutes_per_day,
   service_zones, job_types_approved, vehicle_classes_approved, parts_stocked)
  VALUES (@legal_name,@entity_name,@entity_type,@ein_last4,@phone,@license_number,@license_expiry,
   @insurance_carrier,@insurance_policy,@insurance_expiry,@coi_on_file,@agreement_signed_at,
   @training_completed_at,@base_label,@base_lat,@base_lng,@max_drive_minutes,@max_minutes_per_day,
   @service_zones,@job_types_approved,@vehicle_classes_approved,@parts_stocked)`);

if (db.prepare(`SELECT COUNT(*) c FROM contractors`).get().c === 0) {
  for (const c of contractors) insC.run(c);
}

module.exports = { SYMPTOMS, CLASSES };
