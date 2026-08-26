/* Wrenchmark demo data — WM-2
 * Every number the UI shows comes from here. Nothing is inlined in a screen.
 */
(function (global) {
  'use strict';

  // ── UNRESOLVED. Set these with John before this demo is shown to anyone. ──
  // Anything null renders as "— to be confirmed —" rather than an invented figure.
  var RATES = {
    platform_take_pct:          15,   // standard rate on base jobs
    founding_mechanic_take_pct: 0,    // first 60 days for the first 12 mechanics
    founding_locked_take_pct:   10,   // rate founding mechanics keep afterwards
    founding_window_days:       60,
    additional_work_take_pct:   null, // NOT DECIDED
    parts_purchased_by:         null, // NOT DECIDED: 'mechanic' | 'customer' | 'platform'
    payout_cadence:             'Payouts run every Tuesday for work completed through Sunday.',
  };

  var CLUSTERS = {
    'C1': 'Uptown / Whittier',
    'C2': 'Longfellow / Powderhorn',
    'C3': 'Northeast',
    'C4': 'Como / University',
  };

  // ── Personas ────────────────────────────────────────────────────────────
  var PERSONAS = {
    ACTIVE: {
      id: 'WM-0004',
      status: 'ACTIVE',
      first_name: 'Dale',
      full_name: 'Dale Ruttiger',
      title: 'Mobile Automotive Technician',
      cluster: 'C1',
      zip: '55408',
      years: 11,
      is_founding: true,
      founding_until: '2026-10-24',
      radius_mi: 15,
      vehicle: '2016 Ford Transit Connect',
      joined: '2026-08-04',
      rating: 4.9,
      completed_jobs: 27,
      bio: 'Eleven years turning wrenches, last four out of my own van. Brakes, '
         + 'diagnostics and charging systems are what I do most. I explain what '
         + 'I find before I touch anything.',
      skills: ['Brakes', 'Check-engine diagnostics', 'Starter & alternator',
               'Battery & charging', 'Oil & fluids', 'Cooling system'],
      equipment: ['Bidirectional scan tool', 'Torque wrench', 'Floor jack & stands',
                  'Multimeter', 'Battery tester', 'Impact wrench'],
      availability: ['Weekday mornings', 'Weekday afternoons', 'Weekends'],
      certifications: ['ASE A5 — Brakes', 'ASE A6 — Electrical'],
      documents: [
        { key: 'identity',   label: 'Identity',                       state: 'VERIFIED', on: '2026-07-28' },
        { key: 'license',    label: "Driver's license",               state: 'VERIFIED', expires: '2029-03-14' },
        { key: 'background', label: 'Background check',               state: 'CLEAR',    on: '2026-08-02' },
        { key: 'cgl',        label: 'General liability',              state: 'VERIFIED', expires: '2027-04-01' },
        { key: 'gk',         label: 'Garagekeepers',                  state: 'VERIFIED', expires: '2027-04-01' },
        { key: 'auto',       label: 'Commercial auto',                state: 'VERIFIED', expires: '2026-09-18' },
        { key: 'ai',         label: 'Additional insured endorsement', state: 'ON FILE',  on: '2026-08-04' },
      ],
    },
    REGISTERED: {
      id: 'WM-0009',
      status: 'REGISTERED',
      first_name: 'Marcus',
      full_name: 'Marcus Vue',
      title: 'Mobile Automotive Technician',
      cluster: 'C3',
      zip: '55413',
      years: 9,
      is_founding: true,
      founding_until: '2026-10-24',
      radius_mi: 12,
      vehicle: '2013 Chevrolet Express',
      joined: '2026-08-14',
      rating: null,
      completed_jobs: 0,
      bio: 'Nine years in shops around Northeast, mostly domestic. Looking to take '
         + 'weekend and evening work in my own neighborhood.',
      skills: ['Brakes', 'Suspension', 'Oil & fluids', 'Battery & charging'],
      equipment: ['Torque wrench', 'Floor jack & stands', 'Multimeter'],
      availability: ['Weekday evenings', 'Weekends'],
      certifications: [],
      documents: [
        { key: 'identity',   label: 'Identity',                       state: 'VERIFIED', on: '2026-08-11' },
        { key: 'license',    label: "Driver's license",               state: 'VERIFIED', expires: '2028-06-02' },
        { key: 'background', label: 'Background check',               state: 'CLEAR',    on: '2026-08-14' },
        { key: 'cgl',        label: 'General liability',              state: 'VERIFIED', expires: '2027-02-20' },
        { key: 'gk',         label: 'Garagekeepers',                  state: 'MISSING' },
        { key: 'auto',       label: 'Commercial auto',                state: 'PENDING',  note: 'Certificate received — we are confirming it with your carrier.' },
        { key: 'ai',         label: 'Additional insured endorsement', state: 'MISSING' },
      ],
    },
  };

  // ── Jobs. customer_price is the source of truth; payout is derived. ─────
  var JOBS = [
    {
      id: 'WM-10482', bucket: 'nearby', customer_price: 265,
      service: 'Front brake pads and rotors',
      vehicle: { year: 2016, make: 'Honda', model: 'Accord', trim: 'EX', miles: 118420, engine: '2.4L I4', vin: '1HGCR2F8XGA0••••••', plate: '••• 4L2' },
      customer: { first: 'Sarah', last_initial: 'M', phone: '(612) 555-2184' },
      cluster: 'C2', neighborhood: 'Longfellow', address: '3412 39th Ave S, Minneapolis, MN 55406',
      distance_mi: 3.2, day: 'Today', window: '2:00 – 4:00 PM',
      complaint: 'Front brakes are grinding when I stop. Started about a week ago and it is getting worse.',
      line_items: ['Front brake pads — replace', 'Front rotors — replace', 'Inspect rear brakes'],
      labor_hours: 1.5,
    },
    {
      id: 'WM-10488', bucket: 'nearby', customer_price: 145,
      service: 'Check-engine diagnostic',
      vehicle: { year: 2014, make: 'Subaru', model: 'Outback', trim: '2.5i Premium', miles: 164900, engine: '2.5L H4', vin: '4S4BSAFC9E32••••••', plate: '••• 8J7' },
      customer: { first: 'Andre', last_initial: 'K', phone: '(612) 555-6620' },
      cluster: 'C1', neighborhood: 'Whittier', address: '2619 Pillsbury Ave S, Minneapolis, MN 55408',
      distance_mi: 1.4, day: 'Tomorrow', window: '9:00 – 11:00 AM',
      complaint: 'Check engine light came on two days ago. Car runs fine but it flashes sometimes on the highway.',
      line_items: ['Full scan and code pull', 'Live data diagnostic', 'Written findings'],
      labor_hours: 1.0,
    },
    {
      id: 'WM-10475', bucket: 'today', status: 'SCHEDULED', customer_price: 210,
      service: 'Battery and alternator test',
      vehicle: { year: 2012, make: 'Chevrolet', model: 'Silverado 1500', trim: 'LT', miles: 201340, engine: '5.3L V8', vin: '1GCRKSE72CZ2••••••', plate: '••• 2W9' },
      customer: { first: 'Rob', last_initial: 'T', phone: '(612) 555-3391' },
      cluster: 'C1', neighborhood: 'Uptown', address: '1815 Dupont Ave S, Minneapolis, MN 55403',
      distance_mi: 2.1, day: 'Today', window: '10:00 AM – 12:00 PM',
      complaint: 'Truck needed a jump twice this week. Battery is about three years old.',
      line_items: ['Charging system test', 'Battery replacement if required', 'Terminal clean'],
      labor_hours: 1.0,
    },
  ];

  // ── Earnings. Payouts at the founding rate, so gross = payout. ──────────
  var EARNINGS = {
    month_label: 'August 2026',
    transactions: [
      { date: 'Aug 25', job: 'WM-10475', service: 'Battery & alternator', amount: 210, status: 'PENDING' },
      { date: 'Aug 22', job: 'WM-10461', service: 'Front brakes',         amount: 265, status: 'PENDING' },
      { date: 'Aug 20', job: 'WM-10454', service: 'Check-engine diag',    amount: 145, status: 'PAID', paid_on: 'Aug 26' },
      { date: 'Aug 18', job: 'WM-10449', service: 'Starter replacement',  amount: 310, status: 'PAID', paid_on: 'Aug 19' },
      { date: 'Aug 15', job: 'WM-10441', service: 'Oil & filter',         amount:  95, status: 'PAID', paid_on: 'Aug 19' },
      { date: 'Aug 14', job: 'WM-10438', service: 'Rear brakes',          amount: 240, status: 'PAID', paid_on: 'Aug 19' },
      { date: 'Aug 11', job: 'WM-10430', service: 'Coolant leak diag',    amount: 165, status: 'PAID', paid_on: 'Aug 12' },
      { date: 'Aug  8', job: 'WM-10419', service: 'Alternator',           amount: 385, status: 'PAID', paid_on: 'Aug 12' },
      { date: 'Aug  6', job: 'WM-10412', service: 'Battery replacement',  amount: 175, status: 'PAID', paid_on: 'Aug 12' },
      { date: 'Aug  4', job: 'WM-10405', service: 'Front brakes',         amount: 255, status: 'PAID', paid_on: 'Aug  5' },
    ],
    week: { earned: 475, jobs: 2 },
  };

  global.WM_DATA = {
    RATES: RATES,
    CLUSTERS: CLUSTERS,
    PERSONAS: PERSONAS,
    JOBS: JOBS,
    EARNINGS: EARNINGS,
  };
})(window);
