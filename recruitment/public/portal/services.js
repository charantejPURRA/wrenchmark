/* Wrenchmark Portal — auth + data services.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ FIREBASE SEAM                                                        │
 * │                                                                      │
 * │ Screens never touch data directly — they call WM.auth.* and WM.api.* │
 * │ Every function below is async and returns the same shape it will     │
 * │ return once Firebase is real. To go live you replace the BODIES in   │
 * │ this file. No screen changes.                                        │
 * │                                                                      │
 * │   WM.auth.signInWithGoogle()  ->  signInWithPopup(auth, googleProv)  │
 * │   WM.auth.signInWithApple()   ->  signInWithPopup(auth, appleProv)   │
 * │   WM.auth.startPhone(num)     ->  signInWithPhoneNumber(...)         │
 * │   WM.auth.confirmPhone(code)  ->  confirmationResult.confirm(code)   │
 * │   WM.auth.signOut()           ->  signOut(auth)                      │
 * │   WM.api.*                    ->  Firestore reads/writes             │
 * │   WM.api.uploadDocument()     ->  Firebase Storage uploadBytes()     │
 * │                                                                      │
 * │ Search this file for "SEAM:" to find each one.                       │
 * └──────────────────────────────────────────────────────────────────────┘
 */
(function (g) {
  'use strict';

  var D = g.WM_DATA;
  var SESSION_KEY = 'wm_portal_session';

  function wait(v, ms) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms == null ? 260 : ms); }); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ═══════════════════════════════════════════════════════════════════
     SESSION
     Persisted so a reload keeps you signed in, like a real app.
     SEAM: Firebase Auth handles this itself via onAuthStateChanged.
     ═══════════════════════════════════════════════════════════════════ */
  var session = null;

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) session = JSON.parse(raw);
    } catch (e) { session = null; }
    return session;
  }
  function saveSession(s) {
    session = s;
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch (e) { /* private browsing — session lives in memory only */ }
  }

  /* ═══════════════════════════════════════════════════════════════════
     AUTH
     ═══════════════════════════════════════════════════════════════════ */
  var pendingPhone = null;

  var auth = {
    /** Current session or null. Synchronous — screens use this to route. */
    current: function () { return session; },
    isSignedIn: function () { return !!session; },

    /** SEAM: signInWithPopup(auth, new GoogleAuthProvider()) */
    signInWithGoogle: function () {
      return wait(null, 700).then(function () {
        return finishSignIn({ provider: 'google', email: 'dale.ruttiger@gmail.com' });
      });
    },

    /** SEAM: signInWithPopup(auth, new OAuthProvider('apple.com')) */
    signInWithApple: function () {
      return wait(null, 700).then(function () {
        return finishSignIn({ provider: 'apple', email: 'dale.ruttiger@icloud.com' });
      });
    },

    /** SEAM: signInWithPhoneNumber(auth, e164, recaptchaVerifier) */
    startPhone: function (raw) {
      var digits = String(raw || '').replace(/\D/g, '');
      if (digits.length < 10) return Promise.reject(new Error('Enter a 10-digit mobile number.'));
      pendingPhone = digits.slice(-10);
      // SEAM: the real code arrives by SMS. In the prototype it is always 000000.
      return wait({ sent_to: pendingPhone, hint: '000000' }, 800);
    },

    /** SEAM: confirmationResult.confirm(code) */
    confirmPhone: function (code) {
      var c = String(code || '').replace(/\D/g, '');
      if (!pendingPhone) return Promise.reject(new Error('Start over — we lost track of that number.'));
      if (c !== '000000') return wait(null, 500).then(function () {
        throw new Error('That code is not right. In the prototype it is 000000.');
      });
      var num = pendingPhone; pendingPhone = null;
      return finishSignIn({ provider: 'phone', phone: num });
    },

    /** SEAM: signOut(auth) */
    signOut: function () {
      saveSession(null);
      accountOverride = null;
      return wait(true, 120);
    },

    /** Prototype-only. Jumps between account states so you can see every screen. */
    useAccount: function (key) {
      if (!D.ACCOUNTS[key]) throw new Error('Unknown account state: ' + key);
      accountOverride = key;
      var a = D.ACCOUNTS[key];
      saveSession({
        uid: 'proto-' + key.toLowerCase(),
        provider: 'demo',
        email: a.email || null,
        phone: a.phone || null,
        account: key,
      });
      resetJobState();
      return wait(session, 120);
    },
  };

  function finishSignIn(cred) {
    // SEAM: after Firebase returns a user, look up their mechanic record.
    // Here we land everyone on NEW so you see registration first; the demo
    // switcher moves you on.
    saveSession({
      uid: 'proto-' + cred.provider,
      provider: cred.provider,
      email: cred.email || null,
      phone: cred.phone || null,
      account: accountOverride || 'NEW',
    });
    return wait(session, 200);
  }

  /* ═══════════════════════════════════════════════════════════════════
     MONEY — one place a payout is calculated
     ═══════════════════════════════════════════════════════════════════ */
  var f0 = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:0, maximumFractionDigits:0 });
  var f2 = new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', minimumFractionDigits:2 });
  var money = { round: function (n) { return f0.format(n); }, exact: function (n) { return f2.format(n); } };

  function split(customerPrice, mech) {
    var pct = mech && mech.is_founding ? D.RATES.founding_mechanic_take_pct : D.RATES.platform_take_pct;
    if (pct === null || pct === undefined) {
      return { customer: customerPrice, payout: null, platform: null, take_pct: null };
    }
    var platform = Math.round(customerPrice * (pct / 100));
    return { customer: customerPrice, payout: customerPrice - platform, platform: platform, take_pct: pct };
  }

  /* ═══════════════════════════════════════════════════════════════════
     JOB STATE MACHINE
     OFFERED -> ACCEPTED -> EN_ROUTE -> ARRIVED -> WORKING -> COMPLETED -> PAID
     ═══════════════════════════════════════════════════════════════════ */
  var FLOW = ['ACCEPTED','EN_ROUTE','ARRIVED','WORKING','COMPLETED','PAID'];
  var FLOW_LABEL = {
    OFFERED:'Offered', ACCEPTED:'Accepted', EN_ROUTE:'On the way', ARRIVED:'Arrived',
    WORKING:'Working', COMPLETED:'Completed', PAID:'Paid', DECLINED:'Declined',
  };
  var NEXT = {
    ACCEPTED:'EN_ROUTE', EN_ROUTE:'ARRIVED', ARRIVED:'WORKING', WORKING:'COMPLETED',
  };
  var NEXT_CTA = {
    ACCEPTED:'Start trip', EN_ROUTE:"I've arrived", ARRIVED:'Start work', WORKING:'Complete job',
  };

  // Per-session job overrides. Reset on sign-out / account switch.
  var jobState = {};
  function resetJobState() { jobState = {}; }

  function jobOf(id) {
    var base = D.JOBS.filter(function (j) { return j.id === id; })[0];
    if (!base) return null;
    var j = clone(base);
    var ov = jobState[id];
    if (ov) {
      j.state = ov.state;
      j.photos_before = ov.photos_before || [];
      j.photos_after = ov.photos_after || [];
      j.notes = ov.notes || '';
      j.parts = ov.parts || [];
      j.findings = ov.findings || '';
    } else {
      j.photos_before = []; j.photos_after = []; j.notes = ''; j.parts = []; j.findings = '';
    }
    return j;
  }

  function decorate(j, mech) {
    if (!j) return j;
    j.split = split(j.customer_price, mech);
    j.cluster_label = D.CLUSTERS[j.cluster];
    j.state_label = FLOW_LABEL[j.state] || j.state;
    j.flow_index = FLOW.indexOf(j.state);
    j.next_state = NEXT[j.state] || null;
    j.next_cta = NEXT_CTA[j.state] || null;
    var open = j.state === 'OFFERED';
    if (open) {
      j.address_masked = j.neighborhood + ', Minneapolis';
      j.phone_masked = '(•••) •••-' + j.customer.phone.slice(-4);
      j.address_visible = null;
      j.phone_visible = null;
    } else {
      j.address_visible = j.address;
      j.phone_visible = j.customer.phone;
    }
    return j;
  }

  /* ═══════════════════════════════════════════════════════════════════
     API — SEAM: every body here becomes a Firestore call
     ═══════════════════════════════════════════════════════════════════ */
  var accountOverride = null;
  var profileEdits = {};
  var notifyEdits = {};
  var application = null;   // set by submitApplication()

  function accountKey() {
    return (session && session.account) || 'NEW';
  }

  var api = {
    FLOW, FLOW_LABEL, RATES: D.RATES, CLUSTERS: D.CLUSTERS,
    SERVICE_OPTIONS: D.SERVICE_OPTIONS,
    EQUIPMENT_OPTIONS: D.EQUIPMENT_OPTIONS,
    AVAILABILITY_OPTIONS: D.AVAILABILITY_OPTIONS,
    money, split,

    /** SEAM: doc(db,'mechanics',uid) */
    me: function () {
      var key = accountKey();
      var a = clone(D.ACCOUNTS[key]);
      Object.keys(profileEdits).forEach(function (k) { a[k] = profileEdits[k]; });
      if (application && key === 'PENDING') {
        a.full_name = application.full_name || a.full_name;
        a.first_name = (application.full_name || a.full_name || '').split(' ')[0];
        a.phone = application.phone || a.phone;
        a.zip = application.home_zip || a.zip;
        a.cluster = D.ZIP_CLUSTER[application.home_zip] || null;
      }
      a.account_state = key;
      a.cluster_label = D.CLUSTERS[a.cluster] || null;
      a.dispatchable = key === 'ACTIVE';
      a.notify = Object.assign({}, a.notify || {}, notifyEdits);
      if (a.documents) {
        a.blockers = a.documents
          .filter(function (d) { return d.state === 'MISSING' || d.state === 'PENDING'; })
          .map(function (d) { return d.label; });
      } else { a.blockers = []; }
      return wait(a, 140);
    },

    /** SEAM: addDoc(collection(db,'applications'), payload) */
    submitApplication: function (payload) {
      application = payload;
      var ref = 'WM-' + String(1000 + Math.floor(Math.random() * 8999)).slice(-4);
      accountOverride = 'PENDING';
      if (session) { session.account = 'PENDING'; saveSession(session); }
      return wait({ ok:true, ref: ref, cluster: D.ZIP_CLUSTER[payload.home_zip] || null }, 700);
    },

    jobs: function (bucket) {
      return api.me().then(function (m) {
        if (!m.dispatchable) return [];
        return D.JOBS
          .map(function (b) { return decorate(jobOf(b.id), m); })
          .filter(function (j) {
            if (bucket === 'offered')   return j.state === 'OFFERED';
            if (bucket === 'scheduled') return FLOW.indexOf(j.state) >= 0 && j.state !== 'COMPLETED' && j.state !== 'PAID';
            if (bucket === 'done')      return j.state === 'COMPLETED' || j.state === 'PAID';
            return true;
          });
      });
    },

    job: function (id) {
      return api.me().then(function (m) { return decorate(jobOf(id), m); });
    },

    /** SEAM: updateDoc(doc(db,'jobs',id), { state, accepted_at }) */
    accept: function (id) {
      var j = jobOf(id);
      if (!j) return Promise.reject(new Error('Job not found.'));
      if (j.state !== 'OFFERED') return Promise.reject(new Error('That job is no longer open.'));
      jobState[id] = Object.assign({}, jobState[id], { state: 'ACCEPTED' });
      return wait({ ok:true, state:'ACCEPTED' }, 420);
    },

    decline: function (id) {
      jobState[id] = Object.assign({}, jobState[id], { state: 'DECLINED' });
      return wait({ ok:true, state:'DECLINED' }, 300);
    },

    /** Advance one step. Refuses to skip, and refuses to complete without proof. */
    advance: function (id) {
      var j = jobOf(id);
      if (!j) return Promise.reject(new Error('Job not found.'));
      var next = NEXT[j.state];
      if (!next) return Promise.reject(new Error('Nothing to advance from ' + j.state + '.'));
      if (next === 'COMPLETED') {
        if (!j.photos_before.length) return Promise.reject(new Error('Add at least one before photo first.'));
        if (!j.photos_after.length)  return Promise.reject(new Error('Add at least one after photo first.'));
        if (!String(j.notes).trim()) return Promise.reject(new Error('Write what you did before completing.'));
      }
      jobState[id] = Object.assign({}, jobState[id], { state: next });
      return wait({ ok:true, state: next }, 420);
    },

    /** SEAM: uploadBytes(ref(storage, path), file) then save the download URL. */
    addPhoto: function (id, when, dataUrl) {
      var s = jobState[id] = jobState[id] || { state: jobOf(id).state };
      var k = when === 'before' ? 'photos_before' : 'photos_after';
      s[k] = (s[k] || []).concat([dataUrl]);
      return wait({ ok:true, count: s[k].length }, 180);
    },
    removePhoto: function (id, when, idx) {
      var s = jobState[id] = jobState[id] || { state: jobOf(id).state };
      var k = when === 'before' ? 'photos_before' : 'photos_after';
      s[k] = (s[k] || []).filter(function (_, i) { return i !== idx; });
      return wait({ ok:true }, 100);
    },
    saveWork: function (id, patch) {
      var s = jobState[id] = jobState[id] || { state: jobOf(id).state };
      Object.assign(s, patch);
      return wait({ ok:true }, 150);
    },

    earnings: function (filter) {
      return api.me().then(function (m) {
        var t = clone(D.EARNINGS.transactions);
        var total = t.reduce(function (a, x) { return a + x.amount; }, 0);
        var pending = t.filter(function (x) { return x.status === 'PENDING'; })
                       .reduce(function (a, x) { return a + x.amount; }, 0);
        if (filter && filter !== 'ALL') t = t.filter(function (x) { return x.status === filter; });
        return {
          month: D.EARNINGS.month_label,
          total: m.dispatchable ? total : 0,
          jobs: m.dispatchable ? D.EARNINGS.transactions.length : 0,
          average: m.dispatchable ? total / D.EARNINGS.transactions.length : 0,
          pending: m.dispatchable ? pending : 0,
          paid: m.dispatchable ? total - pending : 0,
          week: m.dispatchable ? D.EARNINGS.week : { earned:0, jobs:0 },
          cadence: D.RATES.payout_cadence,
          transactions: m.dispatchable ? t : [],
        };
      });
    },

    reviews: function () {
      return api.me().then(function (m) {
        return m.dispatchable ? clone(D.REVIEWS) : [];
      });
    },

    documents: function () {
      return api.me().then(function (m) {
        var today = new Date();
        return (m.documents || []).map(function (d) {
          if (d.expires) {
            d.days_to_expiry = Math.round((Date.parse(d.expires) - today) / 86400000);
            d.expiring_soon = d.days_to_expiry <= 30;
          }
          return d;
        });
      });
    },

    /** SEAM: Firebase Storage. In the prototype the file is read but not persisted. */
    uploadDocument: function (key, file) {
      if (!file) return Promise.reject(new Error('Pick a file first.'));
      if (file.size > 10 * 1024 * 1024) return Promise.reject(new Error('That file is over 10 MB. Try a photo instead of a scan.'));
      return wait({ ok:true, name: file.name, size: file.size,
        note: 'Received. In the prototype nothing is stored — Firebase Storage handles this later.' }, 900);
    },

    saveProfile: function (patch) {
      Object.assign(profileEdits, patch);
      return wait({ ok:true }, 350);
    },
    saveNotifications: function (patch) {
      Object.assign(notifyEdits, patch);
      return wait({ ok:true }, 200);
    },
  };

  loadSession();
  g.WM = { auth: auth, api: api, money: money, FLOW: FLOW, FLOW_LABEL: FLOW_LABEL };
})(window);
