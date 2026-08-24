/* Matching engine.

   Uber scores one dimension that matters: proximity. Supply is fungible —
   any driver can take any trip.

   Ours isn't. A mechanic is eligible only if they can actually finish the job:
   approved for the job type, carrying the parts, with room left in the window.
   Proximity is a tiebreaker among the capable, not the primary filter.

   Dispatch goes out in waves. The top-ranked few get the offer first; if nobody
   takes it inside the window, it widens to the next wave. Every offer is still
   accept-or-decline, and declining carries no penalty of any kind — ranking is
   about who is capable and nearby, never about who has been compliant. */

const { driveMinutes, seasonalFactor, byCode } = require('./geo');

const WAVE_SIZE = 3;
const WAVE_SECONDS = 120;
const MAX_WAVES = 3;

/* Rough on-site duration by job type, minutes. Real values come from
   completed-job data once there is any — this is the cold-start prior. */
const JOB_MINUTES = {
  no_start: 60, battery: 40, alternator: 110, starter: 120, brakes: 105,
  oil_change: 40, check_engine: 55, overheating: 95, suspension: 90, other: 60,
};

function jobMinutes(code) { return JOB_MINUTES[code] || 60; }

function parseJson(s, fallback) {
  try { return JSON.parse(s || ''); } catch { return fallback; }
}

/* ---------- eligibility: hard gates, no scoring ---------- */

function gate(contractor, job, ctx) {
  const reasons = [];

  if (contractor.status !== 'active') reasons.push('inactive');
  if (!contractor.coi_on_file) reasons.push('no insurance on file');
  if (contractor.insurance_expiry && contractor.insurance_expiry < ctx.today) reasons.push('insurance expired');
  if (contractor.license_expiry && contractor.license_expiry < ctx.today) reasons.push('license expired');
  if (!contractor.agreement_signed_at) reasons.push('agreement unsigned');
  if (!contractor.training_completed_at) reasons.push('training incomplete');

  const approved = parseJson(contractor.job_types_approved, []);
  if (!approved.includes(job.symptom_code)) reasons.push('not approved for this job type');

  const classes = parseJson(contractor.vehicle_classes_approved, []);
  if (classes.length && !classes.includes(ctx.vehicleClass)) reasons.push('not approved for this vehicle class');

  const drive = driveMinutes(
    { lat: contractor.base_lat, lng: contractor.base_lng },
    { lat: job.lat, lng: job.lng }
  );
  if (drive > (contractor.max_drive_minutes || 45)) reasons.push(`${drive} min away, past their limit`);

  const load = ctx.loadByContractor[contractor.id] || 0;
  const needed = jobMinutes(job.symptom_code);
  const cap = (contractor.max_minutes_per_day || 480);
  if (load + needed > cap) reasons.push('no capacity left in this window');

  return { eligible: reasons.length === 0, reasons, drive, load, needed };
}

/* ---------- scoring: only among the eligible ---------- */

function score(contractor, job, g, ctx) {
  // Proximity — dominant term. 0 min => 50, 45 min => 0.
  const proximity = Math.max(0, 50 - (g.drive / 45) * 50);

  // Parts on the van. The single biggest predictor of a completed job,
  // and the thing no rideshare model has to think about.
  const stock = parseJson(contractor.parts_stocked, []);
  const partsReady = stock.includes(job.symptom_code) ? 22 : 0;

  // Utilization — prefer someone with room, so the day doesn't fragment.
  const cap = contractor.max_minutes_per_day || 480;
  const headroom = Math.max(0, 1 - (g.load + g.needed) / cap) * 14;

  // Demonstrated competence on this exact job type.
  const done = ctx.completionsByType[`${contractor.id}:${job.symptom_code}`] || 0;
  const experience = Math.min(10, done * 2);

  // Vehicle-class familiarity.
  const cls = ctx.completionsByClass[`${contractor.id}:${ctx.vehicleClass}`] || 0;
  const familiarity = Math.min(4, cls);

  const total = proximity + partsReady + headroom + experience + familiarity;

  return {
    total: Math.round(total * 10) / 10,
    parts: {
      proximity: Math.round(proximity * 10) / 10,
      partsReady, headroom: Math.round(headroom * 10) / 10,
      experience, familiarity,
    },
  };
}

/* ---------- the ranked field ---------- */

function rank(contractors, job, ctx) {
  const rows = contractors.map((c) => {
    const g = gate(c, job, ctx);
    const s = g.eligible ? score(c, job, g, ctx) : { total: 0, parts: {} };
    return {
      contractor: c,
      eligible: g.eligible,
      reasons: g.reasons,
      drive_minutes: g.drive,
      load_minutes: g.load,
      job_minutes: g.needed,
      score: s.total,
      breakdown: s.parts,
    };
  });
  rows.sort((a, b) => (b.eligible - a.eligible) || (b.score - a.score));
  return rows;
}

/* Contractors who should receive wave N (0-indexed). */
function waveSlice(ranked, waveIndex) {
  const eligible = ranked.filter((r) => r.eligible);
  return eligible.slice(waveIndex * WAVE_SIZE, (waveIndex + 1) * WAVE_SIZE);
}

/* Payout: base share of the ticket plus a distance allowance, because a
   40-minute drive to a $90 oil change is a job nobody rational accepts. */
/* Payout has two parts, because at dispatch time we genuinely do not know what
   the repair is worth yet.

   The mechanic is guaranteed the diagnostic share plus a drive allowance the
   moment they arrive — that is what makes accepting a job rational even if it
   turns out to be nothing. The repair share is added once the customer
   approves a figure.

   Offering a single blended number here was wrong in both directions: it
   underpaid real repairs and overpaid pure diagnostics. */
function payoutCents(diagnosticCents, driveMin, estRepairCents, pct = 0.65, date = new Date()) {
  const guaranteed = Math.round(diagnosticCents * pct + driveMin * 55 * seasonalFactor(date));
  const onApproval = estRepairCents ? Math.round(estRepairCents * pct) : null;
  return { guaranteed, onApproval, total: guaranteed + (onApproval || 0) };
}

/* What the mechanic actually earns once a repair is approved. */
function repairPayoutCents(repairTotalCents, pct = 0.65) {
  return Math.round(repairTotalCents * pct);
}

module.exports = {
  rank, waveSlice, gate, score, jobMinutes, payoutCents, repairPayoutCents,
  WAVE_SIZE, WAVE_SECONDS, MAX_WAVES, JOB_MINUTES,
};
