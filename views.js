const { SYMPTOMS } = require('./seed');
const { MAKES, YEARS, CLASS_LABEL } = require('./vehicles');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (c) => '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jobRef = (id) => 'WM-' + String(id).padStart(5, '0');
const symLabel = (code) => (SYMPTOMS.find((s) => s.code === code) || {}).label || code;

/* ---------- icons ---------- */
const I = {
  key: '<path d="M14 7a4 4 0 1 1-3.9 5H8v2H6v2H3v-3l6.1-6.1A4 4 0 0 1 14 7Z"/><circle cx="15.5" cy="10.5" r="1" fill="currentColor" stroke="none"/>',
  battery: '<rect x="2" y="7" width="16" height="10" rx="2"/><path d="M21 10v4M6 5v2M14 5v2M7 12h6M10 9v6"/>',
  bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  drop: '<path d="M12 3s6 6.6 6 10.5A6 6 0 0 1 6 13.5C6 9.6 12 3 12 3Z"/>',
  engine: '<path d="M6 9h3V7h6v2h2l3 3v5h-3v3H6v-3H3v-5l3-3Z"/><path d="M9 9v6"/>',
  temp: '<path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z"/><path d="M12 9v6"/>',
  wave: '<path d="M2 12c2-5 4-5 6 0s4 5 6 0 4-5 6 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.2 9.4a2.9 2.9 0 0 1 5.6 1c0 1.9-2.8 2.4-2.8 4"/><circle cx="12" cy="17.5" r="1" fill="currentColor" stroke="none"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  shield: '<path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3Z"/><path d="M9.5 12l1.8 1.8 3.4-3.6"/>',
  camera: '<path d="M3 8h3.5L8 6h8l1.5 2H21v11H3V8Z"/><circle cx="12" cy="13.5" r="3.2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  arrow: '<path d="m9 18 6-6-6-6"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 1.9"/>',
  wrench: '<path d="M15.5 3.5a5.5 5.5 0 0 0-6.9 6.9L3 16v5h5l5.6-5.6a5.5 5.5 0 0 0 6.9-6.9l-3.3 3.3-2.8-.7-.7-2.8 3.3-3.3Z"/>',
};
const ico = (n, sz = 20) =>
  `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n] || I.info}</svg>`;

function page(title, nav, body, extraJs = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#ffffff">
<title>${esc(title)} · Wrenchmark</title><link rel="stylesheet" href="/style.css"></head><body>
<div class="nav"><div class="nav-in">
  <a class="brand" href="/">Wrenchmark<span>.</span></a>
  <div class="nav-links">
    <a href="/" class="${nav === 'book' ? 'on' : ''}">Book</a>
    <a href="/tech" class="${nav === 'tech' ? 'on' : ''}">Mechanic</a>
    <a href="/admin/dispatch" class="${nav === 'admin' ? 'on' : ''}">Dispatch</a>
    <a href="/admin" class="${nav === 'admin' ? 'on' : ''}">Operations</a>
  </div>
</div></div>
${body}
<div class="foot">Prototype · Minneapolis–St. Paul pilot</div>
${extraJs}</body></html>`;
}

const notice = (kind, iconName, title, text) =>
  `<div class="notice ${kind}">${ico(iconName, 19)}<div><b>${esc(title)}</b>${esc(text)}</div></div>`;

/* =======================================================================
   CUSTOMER — 4-step configurator
   ======================================================================= */

function intake() {
  const symCards = SYMPTOMS.map((s) => `
    <label class="sym" data-sym="${s.code}">
      <input type="radio" name="symptom_code" value="${s.code}">
      <span class="ic">${ico(s.icon)}</span>
      <span class="tx"><b>${esc(s.label)}</b><span>${esc(s.blurb)}</span></span>
    </label>`).join('');

  const slots = [
    ['Today', '12:00 – 4:00 PM'], ['Today', '4:00 – 8:00 PM'],
    ['Tomorrow', '8:00 AM – 12:00 PM'], ['Tomorrow', '12:00 – 4:00 PM'],
  ].map(([d, t], i) => `
    <label class="slot" data-slot>
      <input type="radio" name="requested_window" value="${esc(d + ', ' + t)}" ${i === 0 ? 'checked' : ''}>
      <b>${esc(d)}</b><span>${esc(t)}</span>
    </label>`).join('');

  const yearOpts = YEARS.map((y) => `<option value="${y}">${y}</option>`).join('');

  const body = `
<div class="shell"><div class="narrow">

  <div class="hero" id="hero">
    <h1>A licensed mechanic, in your driveway.</h1>
    <p>See a fixed price before anyone is dispatched. If we can't finish it on site, you pay nothing.</p>
    <div class="pledges">
      <span class="pledge">${ico('check', 15)} The price you see is the price you pay</span>
      <span class="pledge">${ico('shield', 15)} No fix, no fee</span>
      <span class="pledge">${ico('camera', 15)} Photo-documented diagnosis</span>
    </div>
  </div>

  <div class="rail" id="rail"><i class="now"></i><i></i><i></i><i></i></div>

  <form method="post" action="/book" id="bookform" novalidate>

    <!-- STEP 1 -->
    <section class="step" data-step="1">
      <div class="step-eyebrow">Step 1 of 4</div>
      <h1>What's going on?</h1>
      <p class="sub">Pick the closest match. Your mechanic confirms it on site before any work starts.</p>
      <div class="sym-grid">${symCards}</div>
      <div class="f" style="margin-top:18px">
        <label>Anything else we should know <span class="aside">Optional</span></label>
        <textarea name="symptom_notes" rows="3" placeholder="Turns over but won't catch. Started this morning after it sat overnight in the cold."></textarea>
      </div>
      <button type="button" class="btn btn-wide" data-next disabled>Continue ${ico('arrow', 18)}</button>
    </section>

    <!-- STEP 2 -->
    <section class="step hide" data-step="2">
      <div class="step-eyebrow">Step 2 of 4</div>
      <h1>Which vehicle?</h1>
      <p class="sub">We use this to send a mechanic carrying the right parts and tools.</p>
      <div class="panel"><div class="panel-b">
        <div class="grid3">
          <div class="f"><label>Year</label>
            <select name="year" id="f-year"><option value="">Select</option>${yearOpts}</select></div>
          <div class="f"><label>Make</label>
            <select name="make" id="f-make" disabled><option value="">Select year first</option></select></div>
          <div class="f"><label>Model</label>
            <select name="model" id="f-model" disabled><option value="">Select make first</option></select></div>
        </div>
        <div class="vchip" id="vchip"><span class="dot"></span><div>
          <b id="vchip-name"></b><span id="vchip-class"></span></div></div>
        <div class="grid2" style="margin-top:17px">
          <div class="f" style="margin-bottom:0"><label>Odometer <span class="aside">Optional</span></label>
            <input type="number" name="odometer" placeholder="98,400" inputmode="numeric"></div>
          <div class="f" style="margin-bottom:0"><label>VIN <span class="aside">Optional</span></label>
            <input type="text" name="vin" placeholder="1HGFC2F53GA012345" maxlength="17" autocapitalize="characters"></div>
        </div>
        <div class="help">A VIN lets us confirm the exact engine and trim before dispatch.</div>
      </div></div>
      <input type="hidden" name="vehicle_class" id="f-class">
      <div class="btn-row" style="margin-top:20px">
        <button type="button" class="btn-back" data-back>${ico('back', 16)} Back</button>
        <button type="button" class="btn" style="margin-left:auto" data-next disabled>Continue ${ico('arrow', 18)}</button>
      </div>
    </section>

    <!-- STEP 3 -->
    <section class="step hide" data-step="3">
      <div class="step-eyebrow">Step 3 of 4</div>
      <h1>Where and when?</h1>
      <p class="sub">We come to the vehicle. A driveway, a work lot, a street space — all fine.</p>
      <div class="panel"><div class="panel-b">
        <div class="f"><label>Where is the vehicle?</label>
          <input type="text" name="service_address" id="f-addr" placeholder="1420 Nicollet Ave, Minneapolis, MN 55403"></div>
        <div class="f"><label>Service area</label>
          <select name="zone">${require('./geo').LOCALITIES.map(l => `<option value="${l.code}">${esc(l.label)}</option>`).join('')}</select>
          <div class="help">We use this to find the mechanics closest to you.</div></div>
        <div class="f" style="margin-bottom:0"><label>Arrival window</label>
          <div class="slots">${slots}</div></div>
      </div></div>
      <div class="btn-row" style="margin-top:20px">
        <button type="button" class="btn-back" data-back>${ico('back', 16)} Back</button>
        <button type="button" class="btn" style="margin-left:auto" data-next disabled>Continue ${ico('arrow', 18)}</button>
      </div>
    </section>

    <!-- STEP 4 -->
    <section class="step hide" data-step="4">
      <div class="step-eyebrow">Step 4 of 4</div>
      <h1>Where do we send the price?</h1>
      <p class="sub">No card required to see your quote.</p>
      <div class="panel"><div class="panel-b">
        <div class="f"><label>Full name</label>
          <input type="text" name="name" id="f-name" placeholder="Alex Whitfield"></div>
        <div class="grid2">
          <div class="f" style="margin-bottom:0"><label>Mobile</label>
            <input type="tel" name="phone" id="f-phone" placeholder="(612) 555-0117"></div>
          <div class="f" style="margin-bottom:0"><label>Email <span class="aside">Optional</span></label>
            <input type="email" name="email" placeholder="alex@example.com"></div>
        </div>
      </div></div>
      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Your request</h2></div>
        <div class="panel-b"><dl class="dl" id="summary"></dl></div></div>
      <div class="btn-row" style="margin-top:20px">
        <button type="button" class="btn-back" data-back>${ico('back', 16)} Back</button>
        <button type="submit" class="btn btn-blue" style="margin-left:auto" id="submitbtn" disabled>See my price ${ico('arrow', 18)}</button>
      </div>
    </section>
  </form>
</div></div>`;

  const js = `<script>
const CATALOG = ${JSON.stringify(MAKES)};
const CLASS_LABEL = ${JSON.stringify(CLASS_LABEL)};
const SYM = ${JSON.stringify(SYMPTOMS.map((s) => ({ code: s.code, label: s.label })))};

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
let step = 1;
const TOTAL = 4;

function railPaint(){
  $$('#rail i').forEach((el,i)=>{
    el.className = (i+1 < step) ? 'done' : (i+1 === step ? 'now' : '');
  });
}
function show(n){
  step = n;
  $$('[data-step]').forEach(s => s.classList.toggle('hide', +s.dataset.step !== n));
  $('#hero').classList.toggle('hide', n !== 1);
  railPaint(); validate();
  if (n === 4) buildSummary();
  window.scrollTo({top:0, behavior:'smooth'});
}
$$('[data-next]').forEach(b => b.addEventListener('click', () => show(step+1)));
$$('[data-back]').forEach(b => b.addEventListener('click', () => show(step-1)));

/* --- step 1: symptom cards --- */
$$('.sym').forEach(card => card.addEventListener('click', () => {
  $$('.sym').forEach(c => c.classList.remove('sel'));
  card.classList.add('sel');
  $('input', card).checked = true;
  validate();
}));

/* --- step 3: time slots --- */
$$('[data-slot]').forEach(s => s.addEventListener('click', () => {
  $$('[data-slot]').forEach(x => x.classList.remove('sel'));
  s.classList.add('sel'); $('input', s).checked = true;
}));
$('[data-slot]').classList.add('sel');

/* --- step 2: cascading vehicle selection --- */
const yearEl = $('#f-year'), makeEl = $('#f-make'), modelEl = $('#f-model'), classEl = $('#f-class');

function resetSelect(el, placeholder){
  el.innerHTML = '<option value="">' + placeholder + '</option>';
  el.disabled = true; el.value = '';
}
yearEl.addEventListener('change', () => {
  resetSelect(makeEl, 'Select make'); resetSelect(modelEl, 'Select make first');
  hideChip();
  const y = +yearEl.value;
  if (!y) { resetSelect(makeEl, 'Select year first'); validate(); return; }
  const makes = Object.keys(CATALOG).filter(mk =>
    CATALOG[mk].some(r => y >= r[2] && y <= r[3])).sort();
  makeEl.innerHTML = '<option value="">Select make</option>' +
    makes.map(m => '<option>' + m + '</option>').join('');
  makeEl.disabled = false;
  validate();
});
makeEl.addEventListener('change', () => {
  resetSelect(modelEl, 'Select model'); hideChip();
  const y = +yearEl.value, mk = makeEl.value;
  if (!mk) { resetSelect(modelEl, 'Select make first'); validate(); return; }
  const models = CATALOG[mk].filter(r => y >= r[2] && y <= r[3])
    .map(r => r[0]).sort((a,b) => a.localeCompare(b));
  modelEl.innerHTML = '<option value="">Select model</option>' +
    models.map(m => '<option>' + m + '</option>').join('');
  modelEl.disabled = false;
  validate();
});
modelEl.addEventListener('change', () => {
  const mk = makeEl.value, md = modelEl.value;
  if (!md) { hideChip(); validate(); return; }
  const row = CATALOG[mk].find(r => r[0] === md);
  classEl.value = row ? row[1] : 'standard';
  $('#vchip-name').textContent = yearEl.value + ' ' + mk + ' ' + md;
  $('#vchip-class').textContent = 'Recognized · priced as ' + (CLASS_LABEL[classEl.value] || classEl.value).toLowerCase();
  $('#vchip').classList.add('show');
  validate();
});
function hideChip(){ $('#vchip').classList.remove('show'); classEl.value = ''; }

/* --- validation --- */
function stepValid(n){
  if (n === 1) return !!$('input[name=symptom_code]:checked');
  if (n === 2) return !!(yearEl.value && makeEl.value && modelEl.value && classEl.value);
  if (n === 3) return $('#f-addr').value.trim().length > 4;
  if (n === 4) return $('#f-name').value.trim().length > 1 && $('#f-phone').value.replace(/\\D/g,'').length >= 10;
  return true;
}
function validate(){
  const sec = $('[data-step="' + step + '"]');
  if (!sec) return;
  const btn = sec.querySelector('[data-next]') || $('#submitbtn');
  if (btn) btn.disabled = !stepValid(step);
}
$$('#bookform input, #bookform select, #bookform textarea')
  .forEach(el => { el.addEventListener('input', validate); el.addEventListener('change', validate); });

/* --- phone formatting --- */
$('#f-phone').addEventListener('input', e => {
  const d = e.target.value.replace(/\\D/g,'').slice(0,10);
  e.target.value = d.length > 6 ? '(' + d.slice(0,3) + ') ' + d.slice(3,6) + '-' + d.slice(6)
    : d.length > 3 ? '(' + d.slice(0,3) + ') ' + d.slice(3) : d;
  validate();
});

/* --- summary on step 4 --- */
function buildSummary(){
  const symCode = ($('input[name=symptom_code]:checked')||{}).value;
  const sym = (SYM.find(s => s.code === symCode) || {}).label || '—';
  const slot = ($('input[name=requested_window]:checked')||{}).value || '—';
  const rows = [
    ['Service', sym],
    ['Vehicle', yearEl.value + ' ' + makeEl.value + ' ' + modelEl.value],
    ['Location', $('#f-addr').value],
    ['Arrival', slot],
  ];
  $('#summary').innerHTML = rows.map(r =>
    '<dt>' + r[0] + '</dt><dd>' + r[1].replace(/</g,'&lt;') + '</dd>').join('');
}
railPaint(); validate();
<\/script>`;

  return page('Book a mechanic', 'book', body, js);
}

/* ---------- quote ---------- */

function quoteView(job, veh, q, eligible) {
  const body = `<div class="shell"><div class="narrow">
  <div class="rail" style="padding-top:26px"><i class="done"></i><i class="done"></i><i class="done"></i><i class="done"></i></div>
  <div class="step-eyebrow">Your quote · ${esc(jobRef(job.id))}</div>
  <h1 style="font-size:34px;font-weight:670;letter-spacing:-.035em;margin:0 0 9px">This is the price you'll pay.</h1>
  <p class="sub" style="color:var(--g500);font-size:16.5px;margin:0 0 26px">Not an estimate, not a starting point. It doesn't move once the work begins.</p>

  <div class="panel">
    <div class="quote-top">
      <div class="lbl">Total, all in</div>
      <div class="amt">${money(q.total_cents)}</div>
      <div class="cap">${esc(veh.year)} ${esc(veh.make)} ${esc(veh.model)} · ${esc(symLabel(job.symptom_code))}</div>
    </div>
    <div class="lines">
      <div class="line"><div class="k"><b>Labor</b>Certified mechanic, on site</div><div class="v">${money(q.labor_cents)}</div></div>
      <div class="line"><div class="k"><b>Parts</b>${q.parts_cents ? 'OEM or equivalent' : 'None required'}</div><div class="v">${money(q.parts_cents)}</div></div>
      <div class="line"><div class="k"><b>Trip</b>Travel to your location</div><div class="v">${money(q.trip_cents)}</div></div>
      <div class="line sum"><div class="k">Total</div><div class="v">${money(q.total_cents)}</div></div>
    </div>
    <div class="panel-b" style="padding-top:6px">
      ${eligible
      ? notice('ok', 'shield', 'Nothing is charged today', "We place a hold on your card and release it to the mechanic only once the job is finished. If they can't complete it on site, the hold drops and you pay nothing.")
      : notice('warn', 'alert', 'This one needs a lift', 'That repair needs shop equipment we can\'t bring to a driveway. We\'ll route it to a verified shop nearby — same fixed price, same guarantee.')}
      <form method="post" action="/jobs/${job.id}/accept" style="margin-top:18px">
        <button type="submit" class="btn btn-wide btn-blue">${ico('card', 18)} Accept price and book</button>
      </form>
      <div class="help" style="text-align:center;margin-top:12px">Cancel any time before the mechanic arrives.</div>
    </div>
  </div>

  <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>What you get</h2></div><div class="panel-b">
    <dl class="dl">
      <dt>Reference</dt><dd class="mono">${esc(jobRef(job.id))}</dd>
      <dt>Location</dt><dd>${esc(job.service_address)}</dd>
      <dt>Arrival window</dt><dd>${esc(job.requested_window)}</dd>
      <dt>Documentation</dt><dd>Photos of the fault, the part, and the finished work</dd>
      <dt>Mechanic</dt><dd>Licensed, insured, and background-checked</dd>
    </dl>
  </div></div>
</div></div>`;
  return page('Your quote', 'book', body);
}

function bookedView(job, offers) {
  if (offers === 0) {
    const shopBody = `<div class="shell"><div class="narrow" style="padding-top:56px">
    <div style="text-align:center;margin-bottom:30px">
      <div style="width:62px;height:62px;border-radius:50%;background:var(--amber-wash);color:var(--amber);
        display:grid;place-items:center;margin:0 auto 18px">${ico('alert', 30)}</div>
      <h1 style="font-size:32px;font-weight:670;letter-spacing:-.035em;margin:0 0 8px">We're routing this to a shop.</h1>
      <p style="color:var(--g500);font-size:16.5px;margin:0">Your card hold has been released. You've been charged nothing.</p>
    </div>
    <div class="panel"><div class="panel-h"><h2>${esc(jobRef(job.id))}</h2>
      <span class="meta"><span class="badge mute">Shop routing</span></span></div>
      <div class="panel-b"><dl class="dl">
        <dt>Why</dt><dd>This repair needs equipment that doesn't travel</dd>
        <dt>Next</dt><dd>A coordinator calls you with a verified shop nearby</dd>
        <dt>Your card</dt><dd>Hold released — nothing charged</dd>
      </dl>
      ${notice('ok', 'shield', 'The guarantee still applies', 'Same fixed price and the same warranty, whether the work happens in your driveway or in a shop we vetted.')}
      <a class="btn btn-wide" href="/" style="margin-top:18px">Book something else ${ico('arrow', 18)}</a>
    </div></div>
  </div></div>`;
    return page('Shop routing', 'book', shopBody);
  }

  const body = `<div class="shell"><div class="narrow" style="padding-top:56px">
  <div style="text-align:center;margin-bottom:30px">
    <div style="width:62px;height:62px;border-radius:50%;background:var(--green-wash);color:var(--green);
      display:grid;place-items:center;margin:0 auto 18px">${ico('check', 30)}</div>
    <h1 style="font-size:32px;font-weight:670;letter-spacing:-.035em;margin:0 0 8px">You're booked.</h1>
    <p style="color:var(--g500);font-size:16.5px;margin:0">Card authorized. Nothing charged yet.</p>
  </div>
  <div class="panel"><div class="panel-h"><h2>${esc(jobRef(job.id))}</h2>
    <span class="meta"><span class="badge live"><i></i>Finding a mechanic</span></span></div>
    <div class="panel-b"><dl class="dl">
      <dt>Offer sent to</dt><dd>${offers} verified ${offers === 1 ? 'mechanic' : 'mechanics'} in your area</dd>
      <dt>Next</dt><dd>You'll get a text the moment one accepts</dd>
      <dt>If nobody accepts</dt><dd>The hold is released automatically</dd>
    </dl>
    ${notice('info', 'info', 'Prototype shortcut', 'Open the Mechanic tab to watch the offer land and accept it.')}
    <a class="btn btn-wide" href="/tech" style="margin-top:18px">Open the mechanic view ${ico('arrow', 18)}</a>
  </div></div>
</div></div>`;
  return page('Booked', 'book', body);
}

/* =======================================================================
   MECHANIC
   ======================================================================= */

function techPicker(rows) {
  const cards = rows.map((c) => `
    <a class="panel" style="display:block;margin-bottom:14px" href="/tech/${c.id}">
      <div class="panel-b" style="display:flex;align-items:center;gap:16px">
        <div style="width:46px;height:46px;border-radius:50%;background:var(--g100);color:var(--g700);
          display:grid;place-items:center;flex:none">${ico('wrench', 22)}</div>
        <div style="min-width:0">
          <div style="font-size:16.5px;font-weight:620;letter-spacing:-.02em">${esc(c.legal_name)}</div>
          <div style="font-size:13.5px;color:var(--g500);margin-top:2px">${esc(c.entity_name)} · License ${esc(c.license_number)}</div>
        </div>
        <div style="margin-left:auto;display:flex;align-items:center;gap:10px;flex:none">
          ${c.coi_on_file ? '<span class="badge go">Insured</span>' : '<span class="badge stop">No COI</span>'}
          ${c.open ? `<span class="badge live"><i></i>${c.open} offer${c.open > 1 ? 's' : ''}</span>` : '<span class="badge mute">No offers</span>'}
          <span style="color:var(--g400)">${ico('arrow', 18)}</span>
        </div>
      </div>
    </a>`).join('');

  const body = `<div class="shell"><div class="narrow">
    <div class="page-head"><h1>Mechanic view</h1>
      <p>Each contracted mechanic gets a text with a one-tap link. Pick one below to open that link.</p></div>
    <div style="margin-top:22px">${cards}</div>
  </div></div>`;
  return page('Mechanic', 'tech', body);
}

function techBoard(c, offers, active) {
  const offerCards = offers.map((o) => `
    <div class="panel" style="margin-bottom:14px">
      <div class="panel-h"><h2>New offer</h2><span class="meta">${esc(jobRef(o.job_id))}</span></div>
      <div class="panel-b">
        <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:18px">
          <div style="min-width:0">
            <div style="font-size:19px;font-weight:640;letter-spacing:-.028em">${esc(symLabel(o.symptom_code))}</div>
            <div style="font-size:14.5px;color:var(--g500);margin-top:3px">${esc(o.year)} ${esc(o.make)} ${esc(o.model)}</div>
          </div>
          <div style="margin-left:auto;text-align:right;flex:none">
            <div style="font-size:12.5px;color:var(--g500)">Your payout</div>
            <div style="font-size:27px;font-weight:660;letter-spacing:-.035em;font-variant-numeric:tabular-nums">${money(o.payout_cents)}</div>
          </div>
        </div>
        <dl class="dl">
          <dt>Location</dt><dd>${esc(o.service_address)}</dd>
          <dt>Drive</dt><dd>${o.drive_minutes} min from your base</dd>
          <dt>Est. on site</dt><dd>${o.est_minutes} min</dd>
          <dt>Window</dt><dd>${esc(o.requested_window)}</dd>
          <dt>Customer notes</dt><dd>${esc(o.symptom_notes || 'None')}</dd>
        </dl>
        <div style="display:flex;gap:10px;margin-top:20px">
          <form method="post" action="/offers/${o.id}/accept" style="flex:1">
            <button class="btn btn-wide btn-green">Accept this job</button></form>
          <form method="post" action="/offers/${o.id}/decline">
            <button class="btn btn-ghost">Decline</button></form>
        </div>
        <div class="help" style="text-align:center;margin-top:12px">Taking this job is your call. Declining doesn't affect future offers.</div>
      </div>
    </div>`).join('');

  const offerBlock = offers.length ? offerCards
    : `<div class="panel"><div class="panel-h"><h2>Open offers</h2></div>
       <div class="empty">Nothing waiting right now</div></div>`;

  const activeRows = active.length ? active.map((j) => `
    <tr><td class="mono">${esc(jobRef(j.id))}</td>
      <td style="font-weight:540">${esc(symLabel(j.symptom_code))}</td>
      <td>${esc(j.year)} ${esc(j.make)} ${esc(j.model)}</td>
      <td style="color:var(--g500)">${esc(j.service_address)}</td>
      <td style="text-align:right"><a class="btn btn-sm" href="/tech/job/${j.id}">Open</a></td></tr>`).join('')
    : `<tr><td colspan="5"><div class="empty">Nothing accepted yet</div></td></tr>`;

  const body = `<div class="shell"><div class="narrow">
    <div class="page-head">
      <h1>${esc(c.legal_name)}</h1>
      <p>${esc(c.entity_name)} · License ${esc(c.license_number)} · Insured through ${esc(c.insurance_expiry)}</p>
    </div>
    <div class="section-title">Offers</div>
    ${offerBlock}
    <div class="section-title">Accepted work</div>
    <div class="panel"><div class="scroll-x"><table class="tbl">
      <thead><tr><th>Job</th><th>Service</th><th>Vehicle</th><th>Location</th><th></th></tr></thead>
      <tbody>${activeRows}</tbody></table></div></div>
  </div></div>`;
  return page('Mechanic', 'tech', body);
}

function diagnosisForm(job, veh, cust, q) {
  const abortOpts = [
    ['no_tools', "Right tools weren't on the truck"],
    ['not_safe', 'Not safe to work at this location'],
    ['beyond_mobile_scope', 'Needs a lift or shop equipment'],
    ['parts_unavailable', 'Parts not available'],
    ['customer_declined', 'Customer declined the work'],
    ['vehicle_inaccessible', "Couldn't access the vehicle"],
  ].map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');

  const dropField = (name, label, hint) => `
    <div class="drop" data-drop>
      <input type="file" name="${name}" accept="image/*" capture="environment">
      <b data-drop-label>${esc(label)}</b><span>${esc(hint)}</span>
    </div>`;

  const body = `<div class="shell"><div class="narrow">
    <div class="page-head">
      <h1>Work order ${esc(jobRef(job.id))}</h1>
      <p>${esc(symLabel(job.symptom_code))} · ${esc(veh.year)} ${esc(veh.make)} ${esc(veh.model)}</p>
    </div>

    <div class="panel" style="margin-top:20px"><div class="panel-h"><h2>Job detail</h2>
      <span class="meta">${money(q.total_cents)} quoted</span></div>
      <div class="panel-b"><dl class="dl">
        <dt>Customer</dt><dd>${esc(cust.name)} · ${esc(cust.phone)}</dd>
        <dt>Location</dt><dd>${esc(job.service_address)}</dd>
        <dt>Reported</dt><dd>${esc(job.symptom_notes || 'No notes')}</dd>
      </dl></div></div>

    <form method="post" action="/tech/job/${job.id}/diagnosis" enctype="multipart/form-data" id="dxform">

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Vehicle</h2></div>
        <div class="panel-b"><div class="grid2">
          <div class="f" style="margin-bottom:0"><label>VIN</label>
            <input type="text" name="vin_confirmed" value="${esc(veh.vin || '')}" placeholder="1HGFC2F53GA012345" maxlength="17" autocapitalize="characters"></div>
          <div class="f" style="margin-bottom:0"><label>Odometer</label>
            <input type="number" name="odometer" value="${esc(veh.odometer_last || '')}" placeholder="98400" inputmode="numeric"></div>
        </div></div></div>

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Diagnosis</h2></div>
        <div class="panel-b">
          <div class="grid2">
            <div class="f"><label>System</label><input type="text" name="system" placeholder="Starting &amp; charging"></div>
            <div class="f"><label>Component</label><input type="text" name="component" placeholder="Starter motor"></div>
          </div>
          <div class="grid3">
            <div class="f"><label>Fault codes</label><input type="text" name="fault_codes" placeholder="P0562, P0300"></div>
            <div class="f"><label>Labor hours</label><input type="text" name="labor_hours_est" placeholder="1.5" inputmode="decimal"></div>
            <div class="f"><label>Severity</label><select name="severity">
              <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="safety">Safety</option></select></div>
          </div>
          <div class="f"><label>Findings</label>
            <textarea name="findings_notes" rows="3" placeholder="No crank. 12.4V at battery, no click at solenoid. Bench tested starter — open circuit."></textarea></div>
          <div class="f" style="margin-bottom:0"><label>Recommendation</label>
            <input type="text" name="recommendation" placeholder="Replace starter motor"></div>
        </div></div>

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Photos</h2>
        <span class="meta">Required to close as complete</span></div>
        <div class="panel-b"><div class="grid3">
          ${dropField('photo_fault', 'The fault', 'What failed')}
          ${dropField('photo_part', 'The part', 'Old and new')}
          ${dropField('photo_completed', 'Completed work', 'Installed and buttoned up')}
        </div></div></div>

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Outcome</h2></div>
        <div class="panel-b">
          <label class="sym" data-out="completed" style="margin-bottom:9px">
            <input type="radio" name="outcome" value="completed" checked>
            <span class="ic">${ico('check')}</span>
            <span class="tx"><b>Completed</b><span>Work finished on site — customer charged ${money(q.total_cents)}</span></span>
          </label>
          <label class="sym" data-out="aborted">
            <input type="radio" name="outcome" value="aborted">
            <span class="ic">${ico('alert')}</span>
            <span class="tx"><b>Couldn't complete</b><span>Card hold released — customer charged nothing</span></span>
          </label>
          <div class="f hide" id="abortwrap" style="margin-top:17px;margin-bottom:0">
            <label>Why not?</label>
            <select name="abort_reason_code"><option value="">Select a reason</option>${abortOpts}</select>
            <div class="help">This is the field that tells us which jobs to route to a shop instead.</div>
          </div>
        </div></div>

      <button type="submit" class="btn btn-wide btn-blue" style="margin-top:20px">Submit work order</button>
    </form>
  </div></div>`;

  const js = `<script>
const $$ = s => Array.from(document.querySelectorAll(s));
$$('[data-out]').forEach(card => card.addEventListener('click', () => {
  $$('[data-out]').forEach(c => c.classList.remove('sel'));
  card.classList.add('sel');
  card.querySelector('input').checked = true;
  document.getElementById('abortwrap').classList.toggle('hide', card.dataset.out !== 'aborted');
}));
document.querySelector('[data-out="completed"]').classList.add('sel');
$$('[data-drop]').forEach(d => {
  const input = d.querySelector('input');
  input.addEventListener('change', () => {
    if (input.files && input.files[0]) {
      d.classList.add('has');
      d.querySelector('[data-drop-label]').textContent = input.files[0].name.slice(0, 22);
    }
  });
});
<\/script>`;

  return page('Work order', 'tech', body, js);
}

/* =======================================================================
   OPERATIONS
   ======================================================================= */

function adminHome(jobs, m, sms) {
  const statusBadge = (s) => {
    if (s === 'completed') return '<span class="badge go">Completed</span>';
    if (s === 'aborted') return '<span class="badge stop">Not completed</span>';
    if (s === 'accepted') return '<span class="badge live"><i></i>In progress</span>';
    if (s === 'offered') return '<span class="badge live"><i></i>Finding mechanic</span>';
    if (s === 'shop_routing') return '<span class="badge">Shop routing</span>';
    return '<span class="badge mute">Quoted</span>';
  };

  const rows = jobs.length ? jobs.map((j) => `
    <tr>
      <td class="mono"><a href="/admin/job/${j.id}" style="font-weight:600">${esc(jobRef(j.id))}</a></td>
      <td style="font-weight:540">${esc(symLabel(j.symptom_code))}</td>
      <td>${esc(j.year)} ${esc(j.make)} ${esc(j.model)}</td>
      <td style="color:var(--g500)">${esc(j.contractor || '—')}</td>
      <td>${statusBadge(j.status)}</td>
      <td class="num" style="text-align:right">${money(j.total_cents)}</td>
      <td class="num" style="text-align:right;font-weight:580">${money(j.captured_cents)}</td>
    </tr>`).join('')
    : `<tr><td colspan="7"><div class="empty">No jobs yet — book one from the Book tab</div></td></tr>`;

  const outbox = sms.length ? sms.map((s) => `
    <tr><td class="mono" style="white-space:nowrap;color:var(--g500)">${esc(s.to_phone)}</td>
      <td style="color:var(--g700)">${esc(s.body)}</td></tr>`).join('')
    : `<tr><td colspan="2"><div class="empty">No messages sent yet</div></td></tr>`;

  const metric = (k, v, n) => `<div class="metric"><div class="k">${esc(k)}</div><div class="v">${v}</div><div class="n">${esc(n)}</div></div>`;

  const body = `<div class="shell">
    <div class="page-head"><h1>Operations</h1>
      <p>Every number here is computed from the job records — nothing is entered by hand. These are the figures that carry the expansion pitch.</p></div>

    <div class="mgrid" style="margin-top:22px">
      ${metric('Jobs booked', m.booked, 'Past the quote stage')}
      ${metric('Completed', m.completed, 'Finished on site')}
      ${metric('Abort rate', m.abortRate + '%', 'Cost of the no-fix-no-fee promise')}
      ${metric('Quote variance', m.variance + '%', 'Charged vs. quoted')}
      ${metric('Revenue captured', money(m.captured), 'Net of released holds')}
      ${metric('Redo rate', m.redoRate + '%', 'Same vehicle, same system, 90 days')}
    </div>

    <div class="section-title">Jobs</div>
    <div class="panel"><div class="scroll-x"><table class="tbl">
      <thead><tr><th>Job</th><th>Service</th><th>Vehicle</th><th>Mechanic</th><th>Status</th>
        <th style="text-align:right">Quoted</th><th style="text-align:right">Captured</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
      <div class="panel-b" style="border-top:1px solid var(--g100)">
        <a class="btn btn-sm btn-ghost" href="/admin/export.csv">Export job data (CSV)</a></div>
    </div>

    <div class="section-title">Messages sent</div>
    <div class="panel"><div class="scroll-x"><table class="tbl">
      <thead><tr><th style="width:150px">To</th><th>Message</th></tr></thead>
      <tbody>${outbox}</tbody></table></div></div>
  </div>`;
  return page('Operations', 'admin', body);
}

function jobReport(j, veh, cust, q, dx, media, pay, events, contractor) {
  const shots = media.length ? `<div class="shots">${media.map((mm) => `
    <figure class="shot"><img src="${esc(mm.url)}" alt="${esc(mm.media_role)}">
    <figcaption>${esc(mm.media_role.replace(/_/g, ' '))}</figcaption></figure>`).join('')}</div>`
    : `<div class="empty" style="padding:34px 0">No photos captured</div>`;

  const evRows = events.map((e) => {
    let p = '';
    try { p = e.payload ? Object.entries(JSON.parse(e.payload)).map(([k, v]) => `${k}=${v}`).join('  ') : ''; }
    catch { p = e.payload || ''; }
    return `<tr><td class="mono" style="white-space:nowrap;color:var(--g400)">${esc(e.created_at)}</td>
      <td class="mono" style="font-weight:600">${esc(e.event_type)}</td>
      <td class="mono" style="color:var(--g500)">${esc(p)}</td></tr>`;
  }).join('');

  const outcomeBadge = j.status === 'completed' ? '<span class="badge go">Completed</span>'
    : j.status === 'aborted' ? '<span class="badge stop">Not completed</span>'
      : '<span class="badge live"><i></i>' + esc(j.status) + '</span>';

  const body = `<div class="shell"><div class="narrow">
    <div class="page-head">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <h1 style="margin:0">${esc(jobRef(j.id))}</h1>${outcomeBadge}</div>
      <p>${esc(symLabel(j.symptom_code))} · ${esc(veh.year)} ${esc(veh.make)} ${esc(veh.model)}</p>
    </div>

    <div class="panel" style="margin-top:20px"><div class="panel-h"><h2>Job record</h2></div>
      <div class="panel-b"><dl class="dl">
        <dt>Customer</dt><dd>${esc(cust.name)} · ${esc(cust.phone)}</dd>
        <dt>Location</dt><dd>${esc(j.service_address)}</dd>
        <dt>Mechanic</dt><dd>${contractor ? esc(contractor.legal_name) + ' · ' + esc(contractor.entity_name) : '—'}</dd>
        <dt>VIN</dt><dd class="mono">${esc(dx?.vin_confirmed || veh.vin || '—')}</dd>
        <dt>Odometer</dt><dd class="mono">${esc(dx?.odometer || veh.odometer_last || '—')}</dd>
        <dt>Outcome</dt><dd>${esc(j.outcome || 'Pending')}${j.abort_reason_code ? ' · ' + esc(j.abort_reason_code.replace(/_/g, ' ')) : ''}</dd>
      </dl></div></div>

    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Diagnosis</h2>
      ${dx ? `<span class="meta">${esc(dx.created_at)}</span>` : ''}</div>
      <div class="panel-b">${dx ? `<dl class="dl">
        <dt>System</dt><dd>${esc(dx.system || '—')}</dd>
        <dt>Component</dt><dd>${esc(dx.component || '—')}</dd>
        <dt>Fault codes</dt><dd class="mono">${esc(dx.fault_codes || '—')}</dd>
        <dt>Labor hours</dt><dd class="mono">${esc(dx.labor_hours_est ?? '—')}</dd>
        <dt>Severity</dt><dd>${esc(dx.severity || '—')}</dd>
        <dt>Findings</dt><dd>${esc(dx.findings_notes || '—')}</dd>
        <dt>Recommendation</dt><dd>${esc(dx.recommendation || '—')}</dd>
      </dl>${shots}` : '<div class="empty" style="padding:34px 0">Not yet diagnosed</div>'}</div></div>

    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Money</h2></div>
      <div class="lines">
        <div class="line"><div class="k">Quoted</div><div class="v">${money(q.total_cents)}</div></div>
        <div class="line"><div class="k">Authorized at booking</div><div class="v">${money(pay?.authorized_cents)}</div></div>
        <div class="line sum"><div class="k">${pay?.status === 'released' ? 'Released — not charged' : 'Captured'}</div>
          <div class="v">${money(pay?.captured_cents)}</div></div>
      </div></div>

    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Event log</h2>
      <span class="meta">${events.length} events</span></div>
      <div class="scroll-x"><table class="tbl">
        <thead><tr><th>Time</th><th>Event</th><th>Detail</th></tr></thead><tbody>${evRows}</tbody></table></div>
      <div class="panel-b" style="border-top:1px solid var(--g100);padding-top:16px">
        ${notice('info', 'info', 'Why this log exists', 'Offer, accept, and decline events with timestamps are the record that each mechanic chose whether to take the work. Never delete rows from this table.')}
      </div></div>

    <div style="margin-top:20px"><a class="btn btn-ghost btn-sm" href="/admin">${ico('back', 16)} All jobs</a></div>
  </div></div>`;
  return page('Job ' + jobRef(j.id), 'admin', body);
}

module.exports = { page, intake, quoteView, bookedView, techPicker, techBoard, diagnosisForm, adminHome, jobReport, esc, money, jobRef, symLabel };

/* =======================================================================
   LIVE DISPATCH — the matching engine made visible
   ======================================================================= */

const GEO = require('./geo');
const M = require('./match');

function dispatchView(live, contractors, focus, focusVeh, ranked, offers) {
  const W = 640, H = 440;
  const offerByC = Object.fromEntries(offers.map((o) => [o.contractor_id, o]));

  /* metro reference points, drawn faintly so the pins have context */
  const refs = GEO.LOCALITIES.map((l) => {
    const p = GEO.project(l, W, H);
    return `<circle cx="${p.x}" cy="${p.y}" r="1.6" fill="var(--g300)"/>`;
  }).join('');

  const jobPt = focus ? GEO.project({ lat: focus.lat, lng: focus.lng }, W, H) : null;

  /* lines from every contractor who got an offer, to the job */
  const links = focus ? contractors.map((c) => {
    const o = offerByC[c.id];
    if (!o) return '';
    const p = GEO.project({ lat: c.base_lat, lng: c.base_lng }, W, H);
    const stroke = o.status === 'accepted' ? 'var(--green)'
      : o.status === 'sent' ? 'var(--accent)' : 'var(--g300)';
    const dash = o.status === 'accepted' ? '' : 'stroke-dasharray="4 4"';
    return `<line x1="${p.x}" y1="${p.y}" x2="${jobPt.x}" y2="${jobPt.y}"
      stroke="${stroke}" stroke-width="${o.status === 'accepted' ? 2.2 : 1.3}" ${dash} opacity=".8"/>`;
  }).join('') : '';

  const pins = contractors.map((c) => {
    const p = GEO.project({ lat: c.base_lat, lng: c.base_lng }, W, H);
    const r = ranked.find((x) => x.contractor.id === c.id);
    const o = offerByC[c.id];
    const fill = o && o.status === 'accepted' ? 'var(--green)'
      : o && o.status === 'sent' ? 'var(--accent)'
        : r && r.eligible ? 'var(--g500)' : 'var(--g300)';
    const label = c.legal_name.split(' ')[0];
    return `<g>
      <circle cx="${p.x}" cy="${p.y}" r="7.5" fill="${fill}" stroke="#fff" stroke-width="2"/>
      <text x="${p.x}" y="${p.y + 21}" text-anchor="middle" font-size="10.5"
        fill="var(--g500)" font-family="var(--sans)" font-weight="560">${esc(label)}</text>
    </g>`;
  }).join('');

  const jobPin = focus ? `<g>
    <circle cx="${jobPt.x}" cy="${jobPt.y}" r="16" fill="var(--ink)" opacity=".08"/>
    <circle cx="${jobPt.x}" cy="${jobPt.y}" r="9" fill="var(--ink)" stroke="#fff" stroke-width="2.5"/>
    <text x="${jobPt.x}" y="${jobPt.y - 17}" text-anchor="middle" font-size="11"
      fill="var(--ink)" font-family="var(--sans)" font-weight="640">${esc(jobRef(focus.id))}</text>
  </g>` : '';

  const map = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;background:var(--g50)">
    ${refs}${links}${pins}${jobPin}</svg>`;

  /* ranked candidate table — the audit trail of why each mechanic was or wasn't offered */
  const rows = ranked.map((r) => {
    const o = offerByC[r.contractor.id];
    const b = r.breakdown || {};
    const state = o
      ? (o.status === 'accepted' ? '<span class="badge go">Accepted</span>'
        : o.status === 'sent' ? '<span class="badge live"><i></i>Offered · wave ' + (o.wave + 1) + '</span>'
          : o.status === 'declined' ? '<span class="badge stop">Declined</span>'
            : '<span class="badge mute">Expired</span>')
      : r.eligible ? '<span class="badge mute">In queue</span>'
        : '<span class="badge stop">Not eligible</span>';

    const why = r.eligible
      ? `<span style="color:var(--g500)">near ${b.proximity ?? 0}` +
        (b.partsReady ? ` · parts ${b.partsReady}` : ' · no parts') +
        ` · room ${b.headroom ?? 0}` +
        (b.experience ? ` · done ${b.experience}` : '') + `</span>`
      : `<span style="color:var(--red)">${esc(r.reasons.join(' · '))}</span>`;

    return `<tr>
      <td style="font-weight:560">${esc(r.contractor.legal_name)}<div style="font-size:12.5px;color:var(--g500);font-weight:440">${esc(r.contractor.base_label)}</div></td>
      <td class="num">${r.eligible ? r.drive_minutes + ' min' : '—'}</td>
      <td class="num">${r.eligible ? '<b>' + r.score + '</b>' : '—'}</td>
      <td style="font-size:12.5px">${why}</td>
      <td>${state}</td>
      <td class="num" style="text-align:right">${o ? money(o.payout_cents) : '—'}</td>
    </tr>`;
  }).join('');

  const liveList = live.length ? live.map((j) => `
    <a href="/admin/dispatch?job=${j.id}" class="slot ${focus && focus.id === j.id ? 'sel' : ''}"
       style="display:block;margin-bottom:8px">
      <b>${esc(jobRef(j.id))} · ${esc(symLabel(j.symptom_code))}</b>
      <span>${esc(j.year)} ${esc(j.make)} ${esc(j.model)} · ${esc((GEO.byCode[j.zone] || {}).label || j.zone)}</span>
    </a>`).join('')
    : `<div class="empty" style="padding:26px 0">Nothing live right now</div>`;

  const eligibleCount = ranked.filter((r) => r.eligible).length;

  const body = `<div class="shell">
    <div class="page-head"><h1>Live dispatch</h1>
      <p>Who was offered each job, and the reason. Ranking is capability and distance only — declining an offer never affects it.</p></div>

    <div style="display:grid;grid-template-columns:1fr 300px;gap:16px;margin-top:22px" class="dispatch-grid">
      <div>
        <div class="panel"><div class="panel-h"><h2>Twin Cities metro</h2>
          <span class="meta">${contractors.length} mechanics${focus ? ' · ' + eligibleCount + ' eligible' : ''}</span></div>
          ${map}
          <div class="panel-b" style="border-top:1px solid var(--g100);display:flex;gap:18px;flex-wrap:wrap;font-size:12.5px;color:var(--g500)">
            <span style="display:inline-flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:50%;background:var(--ink);display:inline-block"></i>Job</span>
            <span style="display:inline-flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:50%;background:var(--accent);display:inline-block"></i>Offered</span>
            <span style="display:inline-flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:50%;background:var(--green);display:inline-block"></i>Accepted</span>
            <span style="display:inline-flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:50%;background:var(--g500);display:inline-block"></i>Eligible, not yet offered</span>
            <span style="display:inline-flex;align-items:center;gap:6px"><i style="width:9px;height:9px;border-radius:50%;background:var(--g300);display:inline-block"></i>Not eligible</span>
          </div>
        </div>

        <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Candidate ranking</h2>
          ${focus ? `<span class="meta">${esc(jobRef(focus.id))} · ${esc(symLabel(focus.symptom_code))}</span>` : ''}</div>
          <div class="scroll-x"><table class="tbl">
            <thead><tr><th>Mechanic</th><th>Drive</th><th>Score</th><th>Why</th><th>Status</th><th style="text-align:right">Payout</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="6"><div class="empty">No live job selected</div></td></tr>'}</tbody>
          </table></div>
          <div class="panel-b" style="border-top:1px solid var(--g100);padding-top:16px">
            ${notice('info', 'info', 'How the wave works', `Offers go to the top ${M.WAVE_SIZE} eligible mechanics at once. If nobody accepts inside ${M.WAVE_SECONDS} seconds, the offer widens to the next ${M.WAVE_SIZE}. After ${M.MAX_WAVES} waves with no taker, the card hold is released automatically and nobody is charged.`)}
          </div>
        </div>
      </div>

      <div>
        <div class="panel"><div class="panel-h"><h2>Live jobs</h2></div>
          <div class="panel-b">${liveList}</div></div>

        ${focus ? `<div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Selected</h2></div>
          <div class="panel-b"><dl class="dl" style="grid-template-columns:110px 1fr">
            <dt>Job</dt><dd class="mono">${esc(jobRef(focus.id))}</dd>
            <dt>Service</dt><dd>${esc(symLabel(focus.symptom_code))}</dd>
            <dt>Vehicle</dt><dd>${esc(focusVeh.year)} ${esc(focusVeh.make)} ${esc(focusVeh.model)}</dd>
            <dt>Area</dt><dd>${esc((GEO.byCode[focus.zone] || {}).label || focus.zone)}</dd>
            <dt>Est. on site</dt><dd>${focus.est_minutes} min</dd>
            <dt>Window</dt><dd>${esc(focus.requested_window)}</dd>
          </dl></div></div>` : ''}
      </div>
    </div>
    <style>@media(max-width:900px){.dispatch-grid{grid-template-columns:1fr!important}}</style>
  </div>`;
  return page('Live dispatch', 'admin', body);
}

module.exports.dispatchView = dispatchView;
