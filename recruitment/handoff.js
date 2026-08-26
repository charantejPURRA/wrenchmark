'use strict';
/* Wrenchmark — recruit → contractor handoff.
 *
 * The recruitment module owns `recruits` (applicants moving through the
 * pipeline). The main app owns `contractors` (mechanics who can receive
 * offers). Nothing connected them, so an approved recruit could never be
 * dispatched a job. This is that connection.
 *
 * Called when John flips a recruit to ACTIVE on the recruiting board.
 * Creates a contractors row, mints an access_token, and hands back the
 * magic link John texts to the mechanic.
 */

const crypto = require('crypto');

// Cluster -> the ZIPs it covers. Mirrors ZIP_CLUSTERS in recruitment/db.js.
const CLUSTER_ZIPS = {
  'C1 Uptown / Whittier':       ['55403', '55405', '55408', '55409'],
  'C2 Longfellow / Powderhorn': ['55406', '55407'],
  'C3 Northeast':               ['55413', '55418', '55421'],
  'C4 Como / University':       ['55414', '55455', '55412'],
};

/** A mechanic driving 15 miles in the metro is roughly 30 minutes. */
function driveMinutes(radiusMi) {
  const mi = Number(radiusMi) || 15;
  return Math.max(15, Math.min(90, Math.round(mi * 2)));
}

function token() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * @param {object} db        the MAIN app database (better-sqlite3), not the recruitment one
 * @param {object} recruit   a decorated recruit record from recruitment/db.js
 * @param {object} [opts]
 * @param {function} [opts.geocode]  (zip) => {lat, lng} | null
 * @returns {{contractor_id:number, access_token:string, path:string, created:boolean, warnings:string[]}}
 */
function promoteToContractor(db, recruit, opts = {}) {
  if (!db) throw new Error('handoff: main database required');
  if (!recruit) throw new Error('handoff: recruit required');
  if (recruit.status !== 'ACTIVE') {
    throw new Error(`handoff: refusing to create a contractor for a ${recruit.status} recruit`);
  }
  // Belt and braces: the recruitment gate should already have caught this,
  // but a contractor row is what makes someone dispatchable, so check again.
  if (!recruit.can_activate) {
    throw new Error('handoff: recruit does not pass the activation check — ' +
                    (recruit.blockers || []).join('; '));
  }

  const warnings = [];
  const digits = (s) => String(s || '').replace(/\D/g, '');

  // Idempotent on phone. Re-running must not create a second contractor.
  const existing = db.prepare(
    `SELECT id, access_token FROM contractors WHERE REPLACE(REPLACE(REPLACE(REPLACE(phone,'(',''),')',''),'-',''),' ','') = ?`
  ).get(digits(recruit.phone));

  if (existing) {
    let tok = existing.access_token;
    if (!tok) {
      tok = token();
      db.prepare(`UPDATE contractors SET access_token=? WHERE id=?`).run(tok, existing.id);
    }
    return {
      contractor_id: existing.id,
      access_token: tok,
      path: '/tech?k=' + tok,
      created: false,
      warnings: ['A contractor with this phone number already existed — reused it rather than creating a duplicate.'],
    };
  }

  const zips = CLUSTER_ZIPS[recruit.zip_cluster] || [recruit.home_zip];
  if (!CLUSTER_ZIPS[recruit.zip_cluster]) {
    warnings.push('Recruit is outside the four wedge clusters — service_zones set to their home ZIP only.');
  }

  let lat = null, lng = null;
  if (typeof opts.geocode === 'function') {
    try {
      const g = opts.geocode(recruit.home_zip);
      if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) { lat = g.lat; lng = g.lng; }
    } catch (e) { warnings.push('Geocoding failed: ' + e.message); }
  }
  if (lat === null) {
    warnings.push('No base_lat/base_lng set. The matching engine uses these for drive time — '
                + 'set them on the contractor before this mechanic can be offered jobs.');
  }

  const tok = token();
  const info = db.prepare(`
    INSERT INTO contractors (
      legal_name, phone, insurance_carrier, insurance_policy, insurance_expiry,
      coi_on_file, service_zones, job_types_approved, base_label, base_lat, base_lng,
      max_drive_minutes, access_token, status
    ) VALUES (
      @legal_name, @phone, @carrier, @policy, @expiry,
      @coi, @zones, @jobs, @base_label, @lat, @lng,
      @drive, @token, 'active'
    )`).run({
    legal_name: recruit.full_name,
    phone: recruit.phone,
    carrier: recruit.ins_carrier || null,
    policy: recruit.ins_policy_ref || null,
    expiry: recruit.ins_expires_on || null,
    coi: recruit.ins_verified_at ? 1 : 0,
    zones: zips.join(','),
    jobs: (recruit.services || []).join(','),
    base_label: recruit.zip_cluster || recruit.home_zip,
    lat, lng,
    drive: driveMinutes(recruit.service_radius_mi),
    token: tok,
  });

  return {
    contractor_id: info.lastInsertRowid,
    access_token: tok,
    path: '/tech?k=' + tok,
    created: true,
    warnings,
  };
}

/** Mint a fresh token — use if a mechanic loses their phone or the link leaks. */
function rotateToken(db, contractorId) {
  const tok = token();
  const r = db.prepare(`UPDATE contractors SET access_token=? WHERE id=?`).run(tok, contractorId);
  if (!r.changes) throw new Error('handoff: no contractor with id ' + contractorId);
  return { access_token: tok, path: '/tech?k=' + tok };
}

module.exports = { promoteToContractor, rotateToken, CLUSTER_ZIPS, driveMinutes };
