'use strict';
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// --- Minneapolis wedge. Four clusters only. Do not widen without a density check.
const ZIP_CLUSTERS = {
  'C1 Uptown / Whittier':      ['55403', '55405', '55408', '55409'],
  'C2 Longfellow / Powderhorn':['55406', '55407'],
  'C3 Northeast':              ['55413', '55418', '55421'],
  'C4 Como / University':      ['55414', '55455', '55412'],
};

const STATUSES = ['APPLIED','SCREENED','INTERVIEWED','BACKGROUND','REGISTERED','ACTIVE','PAUSED','REJECTED'];

// Legal forward moves. Keeps someone from being dragged straight to ACTIVE in the UI.
const TRANSITIONS = {
  APPLIED:    ['SCREENED','REJECTED'],
  SCREENED:   ['INTERVIEWED','REJECTED'],
  INTERVIEWED:['BACKGROUND','REJECTED'],
  BACKGROUND: ['REGISTERED','REJECTED'],
  REGISTERED: ['ACTIVE','PAUSED','REJECTED'],
  ACTIVE:     ['PAUSED','REJECTED'],
  PAUSED:     ['ACTIVE','REGISTERED','REJECTED'],
  REJECTED:   ['APPLIED'],
};

function clusterFor(zip) {
  for (const [name, zips] of Object.entries(ZIP_CLUSTERS)) {
    if (zips.includes(String(zip).trim())) return name;
  }
  return null; // outside the wedge
}

function nowISO() { return new Date().toISOString(); }
function today()  { return new Date().toISOString().slice(0, 10); }

/**
 * The gate. A recruit may only go ACTIVE with all four insurance conditions
 * met, a human-verified COI, and an expiry date in the future.
 * Returns { ok, blockers[] }.
 */
function activationCheck(r, asOf = today()) {
  const blockers = [];
  if (!r.ins_cgl)                blockers.push('No commercial general liability');
  if (!r.ins_garagekeepers)      blockers.push('No garagekeepers (customer vehicle not covered)');
  if (!r.ins_commercial_auto)    blockers.push('No commercial auto on the service vehicle');
  if (!r.ins_additional_insured) blockers.push('Wrenchmark not named as additional insured');
  if (!r.ins_verified_at)        blockers.push('COI not verified with the carrier or broker');
  if (!r.ins_expires_on)         blockers.push('No policy expiry on file');
  else if (r.ins_expires_on <= asOf) blockers.push(`Policy expired ${r.ins_expires_on}`);
  if (r.bg_check_status !== 'CLEAR') blockers.push('Background check not clear');
  return { ok: blockers.length === 0, blockers };
}

function daysToExpiry(r, asOf = today()) {
  if (!r.ins_expires_on) return null;
  return Math.round((Date.parse(r.ins_expires_on) - Date.parse(asOf)) / 86400000);
}

function decorate(r) {
  if (!r) return r;
  const check = activationCheck(r);
  return {
    ...r,
    services: safeParse(r.services),
    availability: safeParse(r.availability),
    can_activate: check.ok,
    blockers: check.blockers,
    days_to_expiry: daysToExpiry(r),
    insurance_ready: !!(r.ins_cgl && r.ins_garagekeepers && r.ins_commercial_auto),
  };
}

function safeParse(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }

function open(file = path.join(__dirname, 'wrenchmark-recruitment.db')) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const logEvent = db.prepare(
    `INSERT INTO recruit_events (recruit_id, at, actor, kind, detail) VALUES (?,?,?,?,?)`
  );

  const api = {
    db,
    ZIP_CLUSTERS, STATUSES, TRANSITIONS,
    clusterFor, activationCheck, decorate,

    nextRef() {
      const n = db.prepare(`SELECT COUNT(*) c FROM recruits`).get().c + 1;
      return 'WM-' + String(n).padStart(4, '0');
    },

    create(input) {
      const ref = api.nextRef();
      const ts = nowISO();
      const info = db.prepare(`
        INSERT INTO recruits (
          ref, created_at, updated_at, full_name, phone, email, home_zip, zip_cluster,
          operator_type, years_experience, ase_certified, ase_detail, service_radius_mi,
          vehicle, has_scan_tool, tool_notes, services, availability, hours_per_week,
          ins_cgl, ins_garagekeepers, ins_commercial_auto, ins_carrier, ins_expires_on,
          source, source_detail, notes
        ) VALUES (
          @ref,@created_at,@updated_at,@full_name,@phone,@email,@home_zip,@zip_cluster,
          @operator_type,@years_experience,@ase_certified,@ase_detail,@service_radius_mi,
          @vehicle,@has_scan_tool,@tool_notes,@services,@availability,@hours_per_week,
          @ins_cgl,@ins_garagekeepers,@ins_commercial_auto,@ins_carrier,@ins_expires_on,
          @source,@source_detail,@notes
        )`).run({
        ref, created_at: ts, updated_at: ts,
        full_name: input.full_name, phone: input.phone, email: input.email,
        home_zip: input.home_zip, zip_cluster: clusterFor(input.home_zip),
        operator_type: input.operator_type || 'other',
        years_experience: Number(input.years_experience) || 0,
        ase_certified: input.ase_certified ? 1 : 0,
        ase_detail: input.ase_detail || null,
        service_radius_mi: Number(input.service_radius_mi) || 15,
        vehicle: input.vehicle || null,
        has_scan_tool: input.has_scan_tool ? 1 : 0,
        tool_notes: input.tool_notes || null,
        services: JSON.stringify(input.services || []),
        availability: JSON.stringify(input.availability || []),
        hours_per_week: Number(input.hours_per_week) || 0,
        ins_cgl: input.ins_cgl ? 1 : 0,
        ins_garagekeepers: input.ins_garagekeepers ? 1 : 0,
        ins_commercial_auto: input.ins_commercial_auto ? 1 : 0,
        ins_carrier: input.ins_carrier || null,
        ins_expires_on: input.ins_expires_on || null,
        source: input.source || 'direct',
        source_detail: input.source_detail || null,
        notes: input.notes || null,
      });
      logEvent.run(info.lastInsertRowid, ts, 'applicant', 'status', 'APPLIED');
      return api.get(info.lastInsertRowid);
    },

    get(id) {
      return decorate(db.prepare(`SELECT * FROM recruits WHERE id = ?`).get(id));
    },

    list({ status, cluster } = {}) {
      let sql = `SELECT * FROM recruits WHERE 1=1`;
      const p = [];
      if (status)  { sql += ` AND status = ?`;      p.push(status); }
      if (cluster) { sql += ` AND zip_cluster = ?`; p.push(cluster); }
      sql += ` ORDER BY created_at DESC`;
      return db.prepare(sql).all(...p).map(decorate);
    },

    events(id) {
      return db.prepare(
        `SELECT * FROM recruit_events WHERE recruit_id = ? ORDER BY at DESC`
      ).all(id);
    },

    /** Status moves go through here so the gate cannot be bypassed by the UI. */
    setStatus(id, next, actor = 'john', detail = null) {
      const r = api.get(id);
      if (!r) throw new Error('Recruit not found');
      if (!STATUSES.includes(next)) throw new Error(`Unknown status ${next}`);
      if (!TRANSITIONS[r.status].includes(next)) {
        throw new Error(`${r.status} cannot move to ${next}`);
      }
      if (next === 'ACTIVE') {
        const check = activationCheck(r);
        if (!check.ok) {
          const e = new Error('Cannot activate: ' + check.blockers.join('; '));
          e.blockers = check.blockers;
          throw e;
        }
      }
      const ts = nowISO();
      db.prepare(`UPDATE recruits SET status=?, updated_at=?, reject_reason=? WHERE id=?`)
        .run(next, ts, next === 'REJECTED' ? detail : null, id);
      logEvent.run(id, ts, actor, 'status', `${r.status} -> ${next}${detail ? ' | ' + detail : ''}`);
      return api.get(id);
    },

    updateInsurance(id, ins, actor = 'john') {
      const ts = nowISO();
      db.prepare(`
        UPDATE recruits SET
          ins_cgl=@cgl, ins_garagekeepers=@gk, ins_commercial_auto=@auto,
          ins_additional_insured=@ai, ins_carrier=@carrier, ins_policy_ref=@policy,
          ins_expires_on=@expires, ins_verified_at=@verified_at, ins_verified_by=@verified_by,
          updated_at=@ts
        WHERE id=@id`).run({
        id, ts,
        cgl: ins.ins_cgl ? 1 : 0,
        gk: ins.ins_garagekeepers ? 1 : 0,
        auto: ins.ins_commercial_auto ? 1 : 0,
        ai: ins.ins_additional_insured ? 1 : 0,
        carrier: ins.ins_carrier || null,
        policy: ins.ins_policy_ref || null,
        expires: ins.ins_expires_on || null,
        verified_at: ins.verified ? ts : null,
        verified_by: ins.verified ? actor : null,
      });
      logEvent.run(id, ts, actor, 'insurance',
        ins.verified ? `COI verified, expires ${ins.ins_expires_on}` : 'Insurance record updated');
      return api.get(id);
    },

    setBgCheck(id, status, actor = 'john') {
      const ts = nowISO();
      db.prepare(`UPDATE recruits SET bg_check_status=?, updated_at=? WHERE id=?`).run(status, ts, id);
      logEvent.run(id, ts, actor, 'bgcheck', status);
      return api.get(id);
    },

    addNote(id, text, actor = 'john') {
      logEvent.run(id, nowISO(), actor, 'note', text);
      return api.events(id);
    },

    /** Anyone ACTIVE whose policy lapses inside `days`. Run this weekly. */
    expiringSoon(days = 30) {
      return api.list({ status: 'ACTIVE' })
        .filter(r => r.days_to_expiry !== null && r.days_to_expiry <= days)
        .sort((a, b) => a.days_to_expiry - b.days_to_expiry);
    },

    /** G1 gate: 12 registered across 4 clusters, 8+ insurance-ready. */
    gateStatus() {
      const all = api.list();
      const live = all.filter(r => ['REGISTERED','ACTIVE'].includes(r.status));
      const byCluster = {};
      for (const name of Object.keys(ZIP_CLUSTERS)) {
        byCluster[name] = live.filter(r => r.zip_cluster === name).length;
      }
      const counts = {};
      for (const s of STATUSES) counts[s] = all.filter(r => r.status === s).length;
      return {
        total: all.length,
        counts,
        registered_or_active: live.length,
        insurance_ready: live.filter(r => r.insurance_ready).length,
        active: all.filter(r => r.status === 'ACTIVE').length,
        clusters_covered: Object.values(byCluster).filter(n => n > 0).length,
        by_cluster: byCluster,
        by_source: all.reduce((m, r) => (m[r.source] = (m[r.source] || 0) + 1, m), {}),
        g1_met: live.length >= 12
             && Object.values(byCluster).every(n => n > 0)
             && live.filter(r => r.insurance_ready).length >= 8,
      };
    },
  };

  return api;
}

module.exports = { open, ZIP_CLUSTERS, STATUSES, clusterFor, activationCheck };
