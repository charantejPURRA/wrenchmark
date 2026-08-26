/* Wrenchmark Portal — mock data.
 * Every number the UI shows comes from here. Nothing is inlined in a screen.
 * When Firebase lands this file is replaced by Firestore reads; the shapes stay.
 */
(function (g) {
  'use strict';

  // ── UNRESOLVED. Settle these with John before showing anyone. ──────────
  // Anything null renders as "— to be confirmed —" rather than a made-up figure.
  var RATES = {
    platform_take_pct:          15,   // standard rate on base jobs
    founding_mechanic_take_pct: 0,    // first 60 days, first 12 mechanics
    founding_locked_take_pct:   10,   // rate founding mechanics keep after
    additional_work_take_pct:   null, // NOT DECIDED
    parts_purchased_by:         null, // NOT DECIDED: mechanic | customer | platform
    payout_cadence: 'Payouts run every Tuesday for work completed through Sunday.',
  };

  var CLUSTERS = {
    C1: 'Uptown / Whittier',
    C2: 'Longfellow / Powderhorn',
    C3: 'Northeast',
    C4: 'Como / University',
  };

  var ZIP_CLUSTER = {
    '55403':'C1','55405':'C1','55408':'C1','55409':'C1',
    '55406':'C2','55407':'C2',
    '55413':'C3','55418':'C3','55421':'C3',
    '55414':'C4','55455':'C4','55412':'C4',
  };

  // ── Account states. The demo switcher moves between these. ─────────────
  // NEW        signed in, no application yet          -> registration wizard
  // PENDING    applied, John working through pipeline -> status roadmap
  // REGISTERED approved, insurance incomplete         -> portal, dispatch off
  // ACTIVE     fully cleared                          -> portal, jobs flowing
  var ACCOUNTS = {
    NEW: {
      id: null, status: 'NEW',
      full_name: '', phone: '', email: '',
    },

    PENDING: {
      id: 'WM-0011', status: 'PENDING', pipeline: 'BACKGROUND',
      full_name: 'Ray Osterberg', first_name: 'Ray',
      phone: '(612) 555-8841', email: 'ray.osterberg@example.com',
      zip: '55407', cluster: 'C2', years: 7,
      applied_on: '2026-08-21',
    },

    REGISTERED: {
      id: 'WM-0009', status: 'REGISTERED',
      full_name: 'Marcus Vue', first_name: 'Marcus',
      phone: '(612) 555-6620', email: 'marcus.vue@example.com',
      title: 'Mobile Automotive Technician',
      zip: '55413', cluster: 'C3', years: 9, radius_mi: 12,
      vehicle: '2013 Chevrolet Express',
      joined: '2026-08-14', rating: null, completed_jobs: 0,
      is_founding: true, founding_until: '2026-10-24',
      bio: 'Nine years in shops around Northeast, mostly domestic. Looking to take '
         + 'weekend and evening work in my own neighborhood.',
      skills: ['Brakes','Suspension','Oil & fluids','Battery & charging'],
      equipment: ['Torque wrench','Floor jack & stands','Multimeter'],
      availability: ['Weekday evenings','Weekends'],
      certifications: [],
      documents: [
        { key:'identity',   label:'Identity',                       state:'VERIFIED', on:'2026-08-11' },
        { key:'license',    label:"Driver's license",               state:'VERIFIED', expires:'2028-06-02' },
        { key:'background', label:'Background check',               state:'CLEAR',    on:'2026-08-14' },
        { key:'cgl',        label:'General liability',              state:'VERIFIED', expires:'2027-02-20' },
        { key:'gk',         label:'Garagekeepers',                  state:'MISSING' },
        { key:'auto',       label:'Commercial auto',                state:'PENDING',
          note:'Certificate received — we are confirming it with your carrier.' },
        { key:'ai',         label:'Additional insured endorsement', state:'MISSING' },
      ],
    },

    ACTIVE: {
      id: 'WM-0004', status: 'ACTIVE',
      full_name: 'Dale Ruttiger', first_name: 'Dale',
      phone: '(612) 555-0142', email: 'dale.ruttiger@example.com',
      title: 'Mobile Automotive Technician',
      zip: '55408', cluster: 'C1', years: 11, radius_mi: 15,
      vehicle: '2016 Ford Transit Connect',
      joined: '2026-08-04', rating: 4.9, completed_jobs: 27,
      is_founding: true, founding_until: '2026-10-24',
      bio: 'Eleven years turning wrenches, last four out of my own van. Brakes, '
         + 'diagnostics and charging systems are what I do most. I explain what '
         + 'I find before I touch anything.',
      skills: ['Brakes','Check-engine diagnostics','Starter & alternator',
               'Battery & charging','Oil & fluids','Cooling system'],
      equipment: ['Bidirectional scan tool','Torque wrench','Floor jack & stands',
                  'Multimeter','Battery tester','Impact wrench'],
      availability: ['Weekday mornings','Weekday afternoons','Weekends'],
      certifications: ['ASE A5 — Brakes','ASE A6 — Electrical'],
      documents: [
        { key:'identity',   label:'Identity',                       state:'VERIFIED', on:'2026-07-28' },
        { key:'license',    label:"Driver's license",               state:'VERIFIED', expires:'2029-03-14' },
        { key:'background', label:'Background check',               state:'CLEAR',    on:'2026-08-02' },
        { key:'cgl',        label:'General liability',              state:'VERIFIED', expires:'2027-04-01' },
        { key:'gk',         label:'Garagekeepers',                  state:'VERIFIED', expires:'2027-04-01' },
        { key:'auto',       label:'Commercial auto',                state:'VERIFIED', expires:'2026-09-18' },
        { key:'ai',         label:'Additional insured endorsement', state:'ON FILE',  on:'2026-08-04' },
      ],
      notify: { new_jobs:true, reminders:true, messages:true, payouts:true },
    },
  };

  // ── Jobs. customer_price is the source of truth; payout is derived. ────
  // bucket: offered | scheduled | done
  var JOBS = [
    {
      id:'WM-10475', bucket:'scheduled', state:'ACCEPTED', customer_price:210,
      service:'Battery and alternator test',
      vehicle:{ year:2012, make:'Chevrolet', model:'Silverado 1500', trim:'LT',
                miles:201340, engine:'5.3L V8', vin:'1GCRKSE72CZ2••••••', plate:'••• 2W9' },
      customer:{ first:'Rob', last_initial:'T', phone:'(612) 555-3391' },
      cluster:'C1', neighborhood:'Uptown', address:'1815 Dupont Ave S, Minneapolis, MN 55403',
      distance_mi:2.1, day:'Today', window:'10:00 AM – 12:00 PM',
      complaint:'Truck needed a jump twice this week. Battery is about three years old.',
      line_items:['Charging system test','Battery replacement if required','Terminal clean'],
      labor_hours:1.0,
    },
    {
      id:'WM-10482', bucket:'offered', state:'OFFERED', customer_price:265,
      service:'Front brake pads and rotors',
      vehicle:{ year:2016, make:'Honda', model:'Accord', trim:'EX',
                miles:118420, engine:'2.4L I4', vin:'1HGCR2F8XGA0••••••', plate:'••• 4L2' },
      customer:{ first:'Sarah', last_initial:'M', phone:'(612) 555-2184' },
      cluster:'C2', neighborhood:'Longfellow', address:'3412 39th Ave S, Minneapolis, MN 55406',
      distance_mi:3.2, day:'Today', window:'2:00 – 4:00 PM',
      complaint:'Front brakes are grinding when I stop. Started about a week ago and it is getting worse.',
      line_items:['Front brake pads — replace','Front rotors — replace','Inspect rear brakes'],
      labor_hours:1.5, expires_in_min:22,
    },
    {
      id:'WM-10488', bucket:'offered', state:'OFFERED', customer_price:145,
      service:'Check-engine diagnostic',
      vehicle:{ year:2014, make:'Subaru', model:'Outback', trim:'2.5i Premium',
                miles:164900, engine:'2.5L H4', vin:'4S4BSAFC9E32••••••', plate:'••• 8J7' },
      customer:{ first:'Andre', last_initial:'K', phone:'(612) 555-6620' },
      cluster:'C1', neighborhood:'Whittier', address:'2619 Pillsbury Ave S, Minneapolis, MN 55408',
      distance_mi:1.4, day:'Tomorrow', window:'9:00 – 11:00 AM',
      complaint:'Check engine light came on two days ago. Car runs fine but it flashes sometimes on the highway.',
      line_items:['Full scan and code pull','Live data diagnostic','Written findings'],
      labor_hours:1.0, expires_in_min:58,
    },
    {
      id:'WM-10461', bucket:'done', state:'PAID', customer_price:265,
      service:'Front brake service',
      vehicle:{ year:2015, make:'Ford', model:'Escape', trim:'SE',
                miles:142800, engine:'2.0L I4', vin:'1FMCU0GX5FU0••••••', plate:'••• 6R1' },
      customer:{ first:'Priya', last_initial:'N', phone:'(612) 555-7712' },
      cluster:'C2', neighborhood:'Powderhorn', address:'3100 Bloomington Ave, Minneapolis, MN 55407',
      distance_mi:2.8, day:'Aug 22', window:'1:00 – 3:00 PM',
      complaint:'Squealing when braking at low speed.',
      line_items:['Front pads and rotors'], labor_hours:1.5,
      rating:5, review:'Dale showed up on time, showed me the worn pads before replacing them, '
                    + 'and cleaned up after. Would use again.',
    },
  ];

  // ── Earnings ──────────────────────────────────────────────────────────
  var EARNINGS = {
    month_label: 'August 2026',
    week: { earned: 475, jobs: 2 },
    transactions: [
      { date:'Aug 25', job:'WM-10475', service:'Battery & alternator', amount:210, status:'PENDING' },
      { date:'Aug 22', job:'WM-10461', service:'Front brakes',         amount:265, status:'PENDING' },
      { date:'Aug 20', job:'WM-10454', service:'Check-engine diag',    amount:145, status:'PAID', paid_on:'Aug 26' },
      { date:'Aug 18', job:'WM-10449', service:'Starter replacement',  amount:310, status:'PAID', paid_on:'Aug 19' },
      { date:'Aug 15', job:'WM-10441', service:'Oil & filter',         amount: 95, status:'PAID', paid_on:'Aug 19' },
      { date:'Aug 14', job:'WM-10438', service:'Rear brakes',          amount:240, status:'PAID', paid_on:'Aug 19' },
      { date:'Aug 11', job:'WM-10430', service:'Coolant leak diag',    amount:165, status:'PAID', paid_on:'Aug 12' },
      { date:'Aug  8', job:'WM-10419', service:'Alternator',           amount:385, status:'PAID', paid_on:'Aug 12' },
      { date:'Aug  6', job:'WM-10412', service:'Battery replacement',  amount:175, status:'PAID', paid_on:'Aug 12' },
      { date:'Aug  4', job:'WM-10405', service:'Front brakes',         amount:255, status:'PAID', paid_on:'Aug  5' },
    ],
  };

  var REVIEWS = [
    { by:'Priya N.', job:'Front brake service', stars:5, on:'Aug 22',
      text:'Showed up on time, showed me the worn pads before replacing them, and cleaned up after.' },
    { by:'Tom B.',   job:'Alternator',          stars:5, on:'Aug 8',
      text:'Diagnosed it in fifteen minutes and had the part on the van. Saved me a tow.' },
    { by:'Ellen R.', job:'Battery replacement', stars:4, on:'Aug 6',
      text:'Good work, ran about twenty minutes late but texted me first.' },
  ];

  var SERVICE_OPTIONS = [
    'Battery & charging','Brakes','Starter & alternator','Check-engine diagnostics',
    'Oil & fluids','Suspension','Cooling system','Pre-purchase inspection',
  ];
  var EQUIPMENT_OPTIONS = [
    'Bidirectional scan tool','Basic code reader','Torque wrench','Floor jack & stands',
    'Multimeter','Battery tester','Impact wrench','Air compressor',
  ];
  var AVAILABILITY_OPTIONS = [
    'Weekday mornings','Weekday afternoons','Weekday evenings','Weekends','Emergency callout',
  ];

  g.WM_DATA = {
    RATES, CLUSTERS, ZIP_CLUSTER, ACCOUNTS, JOBS, EARNINGS, REVIEWS,
    SERVICE_OPTIONS, EQUIPMENT_OPTIONS, AVAILABILITY_OPTIONS,
  };
})(window);
