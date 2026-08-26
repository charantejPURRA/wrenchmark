/* Wrenchmark demo service layer — WM-2
 * Screens talk to these functions only. To connect a real backend later,
 * replace the bodies with fetch() calls. Nothing in the UI changes.
 */
(function (global) {
  'use strict';

  var D = global.WM_DATA;

  // Session state. In memory by design — reload resets the demo.
  var state = {
    persona: 'ACTIVE',
    accepted: {},   // jobId -> true
  };

  function later(value, ms) {
    return new Promise(function (res) { setTimeout(function () { res(value); }, ms || 90); });
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ── money ───────────────────────────────────────────────────────────────
  var fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });
  var fmt2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  var money = { round: function (n) { return fmt.format(n); }, exact: function (n) { return fmt2.format(n); } };

  /** The one place a payout is calculated. Returns nulls if a rate is undecided. */
  function split(customerPrice, mech) {
    var pct = mech && mech.is_founding ? D.RATES.founding_mechanic_take_pct : D.RATES.platform_take_pct;
    if (pct === null || pct === undefined) {
      return { customer: customerPrice, payout: null, platform: null, take_pct: null };
    }
    var platform = Math.round(customerPrice * (pct / 100));
    return { customer: customerPrice, payout: customerPrice - platform, platform: platform, take_pct: pct };
  }

  // ── mechanic ────────────────────────────────────────────────────────────
  var mechanicService = {
    getPersonaKey: function () { return state.persona; },
    setPersona: function (key) { state.persona = key; state.accepted = {}; return later(true, 0); },
    get: function () {
      var m = clone(D.PERSONAS[state.persona]);
      m.cluster_label = D.CLUSTERS[m.cluster];
      m.dispatchable = m.status === 'ACTIVE';
      m.blockers = m.documents
        .filter(function (d) { return d.state === 'MISSING' || d.state === 'PENDING'; })
        .map(function (d) { return d.label; });
      return later(m);
    },
  };

  // ── jobs ────────────────────────────────────────────────────────────────
  function decorate(job, mech) {
    var j = clone(job);
    j.split = split(j.customer_price, mech);
    j.accepted = !!state.accepted[j.id];
    j.status = j.accepted ? 'ACCEPTED' : (j.status || 'AVAILABLE');
    j.cluster_label = D.CLUSTERS[j.cluster];
    // Street address and real phone unlock only after acceptance.
    if (!j.accepted && j.status !== 'SCHEDULED') {
      j.address = null;
      j.customer.phone_masked = '(•••) •••-' + j.customer.phone.slice(-4);
      delete j.customer.phone;
    }
    return j;
  }

  var jobService = {
    listToday: function () {
      return mechanicService.get().then(function (m) {
        if (!m.dispatchable) return [];
        return D.JOBS
          .filter(function (j) { return j.bucket === 'today' || state.accepted[j.id]; })
          .map(function (j) { return decorate(j, m); });
      });
    },
    listNearby: function () {
      return mechanicService.get().then(function (m) {
        if (!m.dispatchable) return [];
        return D.JOBS
          .filter(function (j) { return j.bucket === 'nearby' && !state.accepted[j.id]; })
          .map(function (j) { return decorate(j, m); });
      });
    },
    get: function (id) {
      return mechanicService.get().then(function (m) {
        var j = D.JOBS.filter(function (x) { return x.id === id; })[0];
        return j ? decorate(j, m) : null;
      });
    },
    accept: function (id) {
      state.accepted[id] = true;
      return later(true, 260);
    },
  };

  // ── earnings ────────────────────────────────────────────────────────────
  var earningsService = {
    summary: function () {
      var t = D.EARNINGS.transactions;
      var total   = t.reduce(function (s, x) { return s + x.amount; }, 0);
      var pending = t.filter(function (x) { return x.status === 'PENDING'; }).reduce(function (s, x) { return s + x.amount; }, 0);
      return later({
        month: D.EARNINGS.month_label,
        total: total,
        jobs: t.length,
        average: total / t.length,
        pending: pending,
        paid: total - pending,
        week: D.EARNINGS.week,
        cadence: D.RATES.payout_cadence,
      });
    },
    transactions: function (filter) {
      var t = clone(D.EARNINGS.transactions);
      if (filter && filter !== 'ALL') t = t.filter(function (x) { return x.status === filter; });
      return later(t);
    },
  };

  // ── documents ───────────────────────────────────────────────────────────
  var documentService = {
    list: function () {
      return mechanicService.get().then(function (m) {
        var today = new Date();
        return m.documents.map(function (d) {
          if (d.expires) {
            var days = Math.round((Date.parse(d.expires) - today) / 86400000);
            d.days_to_expiry = days;
            d.expiring_soon = days <= 30;
          }
          return d;
        });
      });
    },
  };

  global.WM = {
    state: state,
    money: money,
    split: split,
    RATES: D.RATES,
    mechanicService: mechanicService,
    jobService: jobService,
    earningsService: earningsService,
    documentService: documentService,
  };
})(window);
