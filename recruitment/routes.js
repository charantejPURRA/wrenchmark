'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const handoff = require('./handoff');

/**
 * Mount TWICE, with different scopes, so a mechanic can never reach the
 * admin surface by guessing a URL:
 *
 *   const recruitment = require('./recruitment/routes');
 *
 *   // what a mechanic sees — portal + public application
 *   app.use('/mechanic', recruitment({ scope: 'mechanic' }));
 *
 *   // what John sees — behind your existing admin auth
 *   app.use('/ops/recruiting', AUTH.requireAdmin,
 *           recruitment({ scope: 'admin', adminKey: process.env.WM_ADMIN_KEY }));
 *
 * scope: 'mechanic' → portal screens + /apply. No admin pages, no admin API.
 * scope: 'admin'    → pipeline board + admin API. No portal.
 * scope: 'all'      → both (single-process dev only; not for production).
 *
 * Both scopes share one store, so an application submitted at
 * /mechanic/apply appears on John's board immediately.
 */
module.exports = function recruitmentRouter(opts = {}) {
  const scope = opts.scope || 'all';
  if (!['mechanic', 'admin', 'all'].includes(scope)) {
    throw new Error(`recruitment: unknown scope "${scope}"`);
  }
  const wantsMechanic = scope === 'mechanic' || scope === 'all';
  const wantsAdmin    = scope === 'admin'    || scope === 'all';

  const store = opts.store || require('./db').open(opts.dbFile);
  const adminKey = opts.adminKey || 'change-me';
  const mainDb = opts.mainDb || null;      // the app's own db, for the contractor handoff
  const geocode = opts.geocode || null;
  const r = express.Router();

  r.use(express.json());
  r.use(express.urlencoded({ extended: true }));

  const admin = (req, res, next) => {
    const key = req.query.key || req.get('x-admin-key');
    if (key !== adminKey) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };

  const wrap = fn => (req, res) => {
    try { fn(req, res); }
    catch (e) { res.status(400).json({ error: e.message, blockers: e.blockers || null }); }
  };

  // ---- mechanic portal demo (WM-2). Mock data, no backend. Delete to ship.
  // Mount-agnostic: the shell learns its base path from req.baseUrl, so this
  // works at /mechanic, /recruit, or anywhere else you mount the router.
  if (wantsMechanic) {
  const PORTAL = path.join(__dirname, 'public', 'portal');
  ['portal.css', 'data.js', 'services.js', 'app.js'].forEach((f) =>
    r.get('/' + f, (_q, res) => res.sendFile(path.join(PORTAL, f))));

  // Every portal screen renders the same shell; it routes client-side.
  // __WM_BASE__ is replaced with the mount path, so this works wherever
  // you mount the router.
  const SCREENS = /^\/(welcome|phone|verify|register|pending|dashboard|jobs|earnings|documents|profile|reviews|settings|job\/[\w-]+)$/;
  let shellCache = null;
  r.get(SCREENS, (req, res) => {
    if (!shellCache || process.env.NODE_ENV !== 'production') {
      shellCache = fs.readFileSync(path.join(PORTAL, 'index.html'), 'utf8');
    }
    res.type('html').send(shellCache.replace(/__WM_BASE__/g, req.baseUrl));
  });
  r.get('/', (req, res) => res.redirect(req.baseUrl + '/dashboard'));

  // ---- public mechanic application
  r.get('/apply', (_q, res) => res.sendFile(path.join(__dirname, 'public', 'apply.html')));

  r.post('/api/apply', wrap((req, res) => {
    const b = req.body;
    for (const f of ['full_name', 'phone', 'email', 'home_zip']) {
      if (!b[f] || !String(b[f]).trim()) throw new Error(`Missing required field: ${f}`);
    }
    const rec = store.create(b);
    res.json({ ok: true, ref: rec.ref, in_service_area: !!rec.zip_cluster, cluster: rec.zip_cluster });
  }));

  r.get('/api/clusters', (_q, res) => res.json(store.ZIP_CLUSTERS));

  // ---- applicant status lookup. Ref + last 4 of the phone they applied with.
  // Returns only what the applicant needs to see — never the full record,
  // never John's notes, never another applicant's data.
  const STAGE_OF = {
    APPLIED: 1, SCREENED: 2, INTERVIEWED: 3, BACKGROUND: 4,
    REGISTERED: 5, ACTIVE: 5, PAUSED: 5, REJECTED: 0,
  };

  r.post('/api/status', wrap((req, res) => {
    const ref = String(req.body.ref || '').trim().toUpperCase();
    const last4 = String(req.body.last4 || '').replace(/\D/g, '');
    if (!ref || last4.length !== 4) throw new Error('Enter your application number and the last four digits of your phone.');

    const rec = store.list().find((x) => x.ref === ref);
    // Same message whether the ref is wrong or the digits are — don't let
    // anyone probe for which application numbers exist.
    const nope = 'We could not match that. Check the number and the last four digits, or text John.';
    if (!rec) throw new Error(nope);
    if (String(rec.phone).replace(/\D/g, '').slice(-4) !== last4) throw new Error(nope);

    const closed = rec.status === 'REJECTED';
    const dispatchable = rec.status === 'ACTIVE';
    const enrolled = ['REGISTERED', 'ACTIVE', 'PAUSED'].includes(rec.status);

    let headline, note;
    if (closed) {
      headline = 'Not moving forward';
      note = 'We are not able to take this one further right now. John can tell you more.';
    } else if (dispatchable) {
      headline = 'Active';
      note = 'You are dispatchable. Jobs in your area reach your phone.';
    } else if (rec.status === 'PAUSED') {
      headline = 'Paused';
      note = 'Your account is on hold. Text John and we will sort it out.';
    } else if (rec.status === 'REGISTERED') {
      // Plain-language version of the activation blockers. The internal
      // wording in db.js is for John's board, not for the applicant.
      const need = [];
      if (!rec.ins_cgl) need.push('general liability');
      if (!rec.ins_garagekeepers) need.push('garagekeepers');
      if (!rec.ins_commercial_auto) need.push('commercial auto');
      const paperwork = !rec.ins_additional_insured || !rec.ins_verified_at;
      headline = need.length ? 'Enrolled — insurance needed' : 'Enrolled — final check';
      note = need.length
        ? 'Send us proof of ' + need.join(', ') + ' and you are dispatchable. '
          + 'No coverage yet? John can put you in touch with a broker who knows this work.'
        : paperwork
          ? 'We are confirming your certificate with your carrier. Nothing needed from you.'
          : 'Last check on your paperwork. Nothing needed from you.';
    } else if (rec.status === 'BACKGROUND') {
      headline = 'Background check running';
      note = 'Usually two to three days. Nothing needed from you.';
    } else if (rec.status === 'INTERVIEWED') {
      headline = 'Interview done';
      note = 'Next is the background check. John will let you know before it runs.';
    } else if (rec.status === 'SCREENED') {
      headline = 'Phone screen done';
      note = 'John will set up a longer conversation.';
    } else {
      headline = 'Application received';
      note = 'John calls every applicant within two business days.';
    }

    res.json({
      ok: true,
      ref: rec.ref,
      first_name: String(rec.full_name).split(' ')[0],
      cluster: rec.zip_cluster,
      stage_index: STAGE_OF[rec.status] ?? 0,
      headline,
      note,
      closed,
      portal_open: enrolled,
    });
  }));

  r.get('/status', (_q, res) => res.sendFile(path.join(__dirname, 'public', 'status.html')));
  } // end mechanic scope

  // ---- admin surface. Only mounted when scope allows it.
  if (wantsAdmin) {
  r.get('/pipeline', (_q, res) => res.sendFile(path.join(__dirname, 'public', 'pipeline.html')));

  r.get('/api/recruits', admin, wrap((req, res) =>
    res.json(store.list({ status: req.query.status, cluster: req.query.cluster }))));

  r.get('/api/recruits/:id', admin, wrap((req, res) => {
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Not found' });
    res.json({ ...rec, events: store.events(req.params.id) });
  }));

  r.post('/api/recruits/:id/status', admin, wrap((req, res) =>
    res.json(store.setStatus(req.params.id, req.body.status, req.body.actor, req.body.detail))));

  r.post('/api/recruits/:id/insurance', admin, wrap((req, res) =>
    res.json(store.updateInsurance(req.params.id, req.body, req.body.actor))));

  r.post('/api/recruits/:id/bgcheck', admin, wrap((req, res) =>
    res.json(store.setBgCheck(req.params.id, req.body.status, req.body.actor))));

  r.post('/api/recruits/:id/note', admin, wrap((req, res) =>
    res.json(store.addNote(req.params.id, req.body.text, req.body.actor))));

  r.get('/api/gate', admin, wrap((_q, res) => res.json(store.gateStatus())));

  r.get('/api/expiring', admin, wrap((req, res) =>
    res.json(store.expiringSoon(Number(req.query.days) || 30))));

  // ---- recruit -> contractor handoff.
  // Flipping someone to ACTIVE on the board does not, by itself, make them
  // dispatchable — the matching engine reads `contractors`, not `recruits`.
  // This creates that row and returns the magic link John texts them.
  r.post('/api/recruits/:id/promote', admin, wrap((req, res) => {
    if (!mainDb) throw new Error('Handoff is not wired up: pass mainDb when mounting the admin scope.');
    const rec = store.get(req.params.id);
    if (!rec) return res.status(404).json({ error: 'Recruit not found' });
    const out = handoff.promoteToContractor(mainDb, rec, { geocode });
    store.addNote(rec.id, out.created
      ? `Promoted to contractor #${out.contractor_id}. Access link issued.`
      : `Linked to existing contractor #${out.contractor_id}.`, 'system');
    res.json(out);
  }));

  r.post('/api/contractors/:cid/rotate-token', admin, wrap((req, res) => {
    if (!mainDb) throw new Error('Handoff is not wired up: pass mainDb when mounting the admin scope.');
    res.json(handoff.rotateToken(mainDb, Number(req.params.cid)));
  }));
  } // end admin scope

  r.scope = scope;
  r.store = store;
  return r;
};
