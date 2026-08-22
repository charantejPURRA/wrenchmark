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
    ${nav === 'book' ? '' : `<a href="/tech">Mechanic</a>
    <a href="/admin/dispatch">Dispatch</a>
    <a href="/admin">Operations</a>
    <a href="/admin/team">Mechanics</a>`}
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
  const yearOpts = YEARS.map((y) => `<option value="${y}">${y}</option>`).join('');
  const slots = [
    ['Today', '12:00 – 4:00 PM'], ['Today', '4:00 – 8:00 PM'],
    ['Tomorrow', '8:00 AM – 12:00 PM'], ['Tomorrow', '12:00 – 4:00 PM'],
  ].map(([d, t], i) => `<label class="slot" data-slot>
      <input type="radio" name="requested_window" value="${esc(d + ', ' + t)}" ${i === 0 ? 'checked' : ''}>
      <b>${esc(d)}</b><span>${esc(t)}</span></label>`).join('');

  const body = `
<div class="shell"><div class="narrow">

  <div class="hero" id="hero">
    <h1>Something's wrong with your car. Let's work out what.</h1>
    <p>No forms and no car jargon. Tap what you have noticed, answer two or three questions, and we will tell you honestly what it is likely to be and what it should cost — before anyone comes out.</p>
    <div class="pledges">
      <span class="pledge">${ico('check', 15)} You approve the price before any work</span>
      <span class="pledge">${ico('shield', 15)} We come to the car</span>
      <span class="pledge">${ico('camera', 15)} Photos of everything we find</span>
    </div>
  </div>

  <div class="talk" id="talk"></div>

  <form method="post" action="/book" id="bookform" novalidate>
    <input type="hidden" name="symptom_code" id="f-symptom">
    <input type="hidden" name="symptom_notes" id="f-notes">
    <input type="hidden" name="vehicle_class" id="f-class">
    <input type="hidden" name="triage_session" id="f-session">

    <section class="step hide" data-step="vehicle">
      <div class="step-eyebrow">Your vehicle</div>
      <h1>Which car is it?</h1>
      <p class="sub">This tells us the exact parts and how long the job takes on your specific vehicle.</p>
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
      </div></div>
      <button type="button" class="btn btn-wide" data-next="price" disabled style="margin-top:20px">See what this costs ${ico('arrow', 18)}</button>
    </section>

    <section class="step hide" data-step="price">
      <div class="step-eyebrow">Your price</div>
      <h1>Here's what this costs.</h1>
      <p class="sub">Two numbers, both honest. Nobody can price a repair before seeing the car — so we price the looking, and give you the range for the fixing.</p>
      <div id="pricebox"></div>
      <div class="btn-row" style="margin-top:20px">
        <button type="button" class="btn-back" data-back="vehicle">${ico('back', 16)} Back</button>
        <button type="button" class="btn" style="margin-left:auto" data-next="where">Continue ${ico('arrow', 18)}</button>
      </div>
    </section>

    <section class="step hide" data-step="where">
      <div class="step-eyebrow">Where and when</div>
      <h1>Where is the car?</h1>
      <p class="sub">A driveway, a work lot, a street space, a parking ramp — all fine. We bring the shop.</p>
      <div class="panel"><div class="panel-b">
        <div class="f"><label>Address</label>
          <input type="text" name="service_address" id="f-addr" placeholder="1420 Nicollet Ave, Minneapolis, MN 55403"></div>
        <div class="f"><label>Area</label>
          <select name="zone">${require('./geo').LOCALITIES.map(l => `<option value="${l.code}">${esc(l.label)}</option>`).join('')}</select></div>
        <div class="f" style="margin-bottom:0"><label>Arrival window</label>
          <div class="slots">${slots}</div></div>
      </div></div>
      <div class="btn-row" style="margin-top:20px">
        <button type="button" class="btn-back" data-back="price">${ico('back', 16)} Back</button>
        <button type="button" class="btn" style="margin-left:auto" data-next="who" disabled>Continue ${ico('arrow', 18)}</button>
      </div>
    </section>

    <section class="step hide" data-step="who">
      <div class="step-eyebrow">Last thing</div>
      <h1>How do we reach you?</h1>
      <p class="sub">We text you the mechanic's name and photo before they set off. No card needed yet.</p>
      <div class="panel"><div class="panel-b">
        <div class="f"><label>Your name</label>
          <input type="text" name="name" id="f-name" placeholder="Alex Whitfield"></div>
        <div class="grid2">
          <div class="f" style="margin-bottom:0"><label>Mobile</label>
            <input type="tel" name="phone" id="f-phone" placeholder="(612) 555-0117"></div>
          <div class="f" style="margin-bottom:0"><label>Email <span class="aside">Optional</span></label>
            <input type="email" name="email" placeholder="alex@example.com"></div>
        </div>
      </div></div>
      <div class="btn-row" style="margin-top:20px">
        <button type="button" class="btn-back" data-back="where">${ico('back', 16)} Back</button>
        <button type="submit" class="btn btn-blue" style="margin-left:auto" id="submitbtn" disabled>Book it ${ico('arrow', 18)}</button>
      </div>
    </section>
  </form>
</div></div>`;

  const js = `<script>
const CATALOG = ${JSON.stringify(MAKES)};
const CLASS_LABEL = ${JSON.stringify(CLASS_LABEL)};
const $ = (s,r)=>(r||document).querySelector(s);
const $$ = (s,r)=>Array.from((r||document).querySelectorAll(s));
const talk = $('#talk');
let session = null, priced = null;

const money = c => '$' + (Number(c||0)/100).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
const wait = ms => new Promise(r=>setTimeout(r,ms));

function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstElementChild; }
function scrollDown(){ window.scrollTo({top:document.body.scrollHeight, behavior:'smooth'}); }

function push(node){ talk.appendChild(node); scrollDown(); return node; }

/* pacing matters — instant replies read as a script, not a person */
async function say(lines, leadIn){
  const t = push(el('<div class="turn"><div class="av">W</div><div class="say"><div class="typing"><i></i><i></i><i></i></div></div></div>'));
  await wait(560 + Math.min(900, String(lines).length * 9));
  const arr = Array.isArray(lines) ? lines : [lines];
  $('.say', t).innerHTML = (leadIn ? '<div class="lead-in">'+leadIn+'</div>' : '') +
    arr.map(l => '<p>'+l+'</p>').join('');
  scrollDown();
  return t;
}
function me(text){
  return push(el('<div class="turn me"><div class="av">You</div><div class="say"><p>'+
    text.replace(/</g,'&lt;')+'</p></div></div>'));
}
function alertBox(level, text){
  const icon = level==='stop'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/></svg>';
  push(el('<div class="alert '+level+'">'+icon+'<div><b>'+
    (level==='stop'?'Please don\\'t drive it':'Take it easy on this one')+'</b>'+text+'</div></div>'));
}

/* ---------- opening ---------- */
async function open(){
  await say(["Hi — sorry you're dealing with this. Car trouble is a horrible surprise."]);
  await say(["First, and more important than anything about the car: <b>are you somewhere safe right now?</b>"]);
  choices([
    {label:"Yes, it's parked at home or work", v:'safe'},
    {label:"I'm pulled over on the road", v:'roadside'},
    {label:"It's somewhere else, but I'm fine", v:'other'},
  ], onSafety);
}

function choices(opts, cb, multi){
  const wrap = push(el('<div class="picks"></div>'));
  const chosen = new Set();
  let done = null;
  opts.forEach((o)=>{
    const b = el('<button type="button" class="pick">'+o.label+'</button>');
    b.addEventListener('click', ()=>{
      if (!multi){
        $$('.pick', wrap).forEach(x=>x.classList.add('gone'));
        me(o.label); return cb([o.v], o.label);
      }
      if (chosen.has(o.v)) { chosen.delete(o.v); b.classList.remove('on'); }
      else { chosen.add(o.v); b.classList.add('on'); }
      done.disabled = chosen.size === 0;
      done.textContent = chosen.size > 1 ? chosen.size + ' selected — continue' : 'Continue';
    });
    wrap.appendChild(b);
  });
  if (multi){
    done = el('<button type="button" class="btn btn-sm" style="align-self:flex-start;margin-top:5px" disabled>Continue</button>');
    done.addEventListener('click', ()=>{
      const picked = opts.filter(o=>chosen.has(o.v));
      $$('.pick', wrap).forEach(x=>x.classList.add('gone'));
      done.remove();
      me(picked.map(p=>p.label).join(' · '));
      cb(picked.map(p=>p.v), picked.map(p=>p.label).join(' · '));
    });
    wrap.appendChild(done);
  }
  scrollDown();
}

let safeLocation = 'safe';
async function onSafety(v){
  safeLocation = v;
  $('#hero').classList.add('hide');
  if (v === 'roadside'){
    alertBox('stop', "Get well clear of traffic first — behind a barrier if there is one, hazards on. If you are on a highway shoulder, a tow somewhere safer is the better call, and your insurance or AAA can arrange it. We will meet the car wherever it ends up.");
    await wait(650);
  }
  await begin();
}

async function begin(){
  const r = await fetch('/api/triage/start', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ safe_location: safeLocation })
  }).then(function(x){return x.json()});
  session = r.session;
  $('#f-session').value = r.session;
  ask(r.question, r.step, r.total);
}

/* The keyboard comes out last, and only as an offer. */
async function askNote(wants){
  await say(wants
    ? ["Tell me about it in your own words — whatever you noticed. A sentence is plenty."]
    : ["Last thing, and it's optional: anything else you want the mechanic to know before they set off? Sounds, smells, when it started, anything you tried."]);
  const box = push(el(
    '<div class="saybox"><textarea id="notetext" rows="3" placeholder="It started making the noise on Tuesday and it is worse when the car is cold..."></textarea>'+
    '<button type="button" class="btn" id="sendnote"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 14 0M13 6l6 6-6 6"/></svg></button></div>'));
  const skip = push(el('<div class="picks"><button type="button" class="pick" id="skipnote">Nothing to add — carry on</button></div>'));
  const ta = $('#notetext', box), btn = $('#sendnote', box);
  const send = async function(txt){
    box.remove(); skip.remove();
    if (txt) me(txt);
    const r = await fetch('/api/triage/note', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ session: session, text: txt })
    }).then(function(x){return x.json()});
    if (txt) $('#f-notes').value = txt;
    if (r.safety && !document.querySelector('.alert.'+r.safety.level)) alertBox(r.safety.level, r.safety.text);
    if (r.restate) await say([r.restate]);
    $('#f-symptom').value = r.lead_code;
    finish(r);
  };
  btn.addEventListener('click', function(){ const t = ta.value.trim(); if (t.length >= 2) send(t); });
  ta.addEventListener('keydown', function(e){
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { const t = ta.value.trim(); if (t.length >= 2) send(t); }
  });
  $('#skipnote', skip).addEventListener('click', function(){ send(''); });
  if (wants) ta.focus();
}

async function ask(q, step, total){
  await say([q.prompt], (total>1 && q.id!=='board') ? 'Question '+step+' of '+total : null);
  choices(q.options.map((o,i)=>({label:o.label, v:i})), async (idxs)=>{
    const r = await fetch('/api/triage/answer', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ session, question_id: q.id, option_indexes: idxs })
    }).then(r=>r.json());
    if (r.safety && !document.querySelector('.alert.'+r.safety.level)) alertBox(r.safety.level, r.safety.text);
    if (r.ask_note) return askNote(r.wants_note);
    if (!r.done) return ask(r.question, r.step, r.total);
    $('#f-symptom').value = r.lead_code;
    finish(r);
  }, !!q.multi);
}

async function finish(r){
  const findings = r.findings || [];
  if (r.certain === false){
    await say([r.message]);
    if (findings.length){
      await say(["If I had to say what to rule out first, it would be these — a starting point for the mechanic, not a claim."]);
      renderFindings(findings);
    }
  } else {
    await say([
      "Thanks — that's enough to give you a straight answer.",
      "Here's what I think is going on. Your mechanic confirms it on site with the car in front of them, and nothing is replaced until you have seen the evidence."
    ]);
    renderFindings(findings);
  }
  await say(["Now — which car is it? Parts and labour depend on your exact vehicle."]);
  show('vehicle');
}

function renderFindings(findings){
  const box = push(el('<div class="picks" style="margin-bottom:20px"></div>'));
  findings.forEach(f=>{
    box.appendChild(el(
      '<div class="finding'+(f.lead?' lead':'')+'">'+
        '<div class="top"><b>'+f.label+'</b><span class="pc">'+
          (f.confidence!=null ? f.band+' · '+f.confidence+'%' : f.band)+'</span></div>'+
        (f.explain?'<div class="why">'+f.explain+'</div>':'')+
        (f.confidence!=null?'<div class="meter"><i style="width:0%"></i></div>':'')+
      '</div>'));
  });
  setTimeout(function(){
    $$('.finding .meter i', box).forEach(function(m,i){
      if (findings[i].confidence!=null) m.style.width = findings[i].confidence + '%';
    });
  }, 90);
}

/* ---------- steps ---------- */
function show(name){
  $$('[data-step]').forEach(s => s.classList.toggle('hide', s.dataset.step !== name));
  validate();
  setTimeout(scrollDown, 60);
}
$$('[data-next]').forEach(b => b.addEventListener('click', async () => {
  if (b.dataset.next === 'price') { await loadPrice(); }
  show(b.dataset.next);
  window.scrollTo({top: document.body.scrollHeight - window.innerHeight - 200, behavior:'smooth'});
}));
$$('[data-back]').forEach(b => b.addEventListener('click', () => show(b.dataset.back)));

/* cascading vehicle selection */
const yearEl=$('#f-year'), makeEl=$('#f-make'), modelEl=$('#f-model'), classEl=$('#f-class');
function reset(el,ph){ el.innerHTML='<option value="">'+ph+'</option>'; el.disabled=true; el.value=''; }
yearEl.addEventListener('change', ()=>{
  reset(makeEl,'Select make'); reset(modelEl,'Select make first'); hideChip();
  const y=+yearEl.value; if(!y){ reset(makeEl,'Select year first'); return validate(); }
  const makes=Object.keys(CATALOG).filter(mk=>CATALOG[mk].some(r=>y>=r[2]&&y<=r[3])).sort();
  makeEl.innerHTML='<option value="">Select make</option>'+makes.map(m=>'<option>'+m+'</option>').join('');
  makeEl.disabled=false; validate();
});
makeEl.addEventListener('change', ()=>{
  reset(modelEl,'Select model'); hideChip();
  const y=+yearEl.value, mk=makeEl.value;
  if(!mk){ reset(modelEl,'Select make first'); return validate(); }
  const models=CATALOG[mk].filter(r=>y>=r[2]&&y<=r[3]).map(r=>r[0]).sort((a,b)=>a.localeCompare(b));
  modelEl.innerHTML='<option value="">Select model</option>'+models.map(m=>'<option>'+m+'</option>').join('');
  modelEl.disabled=false; validate();
});
modelEl.addEventListener('change', ()=>{
  const mk=makeEl.value, md=modelEl.value;
  if(!md){ hideChip(); return validate(); }
  const row=CATALOG[mk].find(r=>r[0]===md);
  classEl.value=row?row[1]:'standard';
  $('#vchip-name').textContent=yearEl.value+' '+mk+' '+md;
  $('#vchip-class').textContent='Recognized · priced as '+(CLASS_LABEL[classEl.value]||classEl.value).toLowerCase();
  $('#vchip').classList.add('show'); validate();
});
function hideChip(){ $('#vchip').classList.remove('show'); classEl.value=''; }

async function loadPrice(){
  const r = await fetch('/api/triage/price', {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify({ session, make: makeEl.value, model: modelEl.value })
  }).then(r=>r.json());
  priced = r;
  const hasRange = r.rangeable && r.low_cents && r.high_cents;
  $('#pricebox').innerHTML =
    '<div class="pricecard">'+
      '<div class="band dark"><div class="k">Diagnosis, at your location</div>'+
        '<div class="n">'+money(r.diagnostic_cents)+'</div>'+
        '<div class="sub">Fixed. A certified mechanic scans it, tests it, photographs what they find, and tells you exactly what is wrong — whether or not you go ahead with the repair.</div></div>'+
      (hasRange
        ? '<div class="band"><div class="k">Likely repair, if it is what we think</div>'+
          '<div class="n">'+money(r.low_cents)+' - '+money(r.high_cents)+'</div>'+
          '<div class="sub">Parts and labour for your specific vehicle. You see the exact figure with photos attached, and approve it before a single bolt is touched.</div>'+
          '<div class="credit">'+
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'+
            'The '+money(r.diagnostic_cents)+' comes off the repair</div></div>'
        : '<div class="band"><div class="k">Repair cost</div>'+
          '<div class="n" style="font-size:23px;letter-spacing:-.025em">We are not going to guess</div>'+
          '<div class="sub">'+(r.no_range_reason||'')+' You will see the exact figure with photos before anything is touched, and you can walk away paying only for the diagnosis.</div>'+
          '<div class="credit">'+
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'+
            'The '+money(r.diagnostic_cents)+' comes off the repair</div></div>')+
      (r.mobile_eligible===false ? '<div class="band" style="background:var(--amber-wash)">'+
        '<div class="k" style="color:#5E3B00;font-weight:600">This one needs a lift</div>'+
        '<div class="sub" style="color:#5E3B00">We will diagnose it at your location, then route the repair to a shop we have vetted. Same price, same guarantee.</div></div>' : '')+
    '</div>';
}

/* validation */
function ok(name){
  if(name==='vehicle') return !!(yearEl.value && makeEl.value && modelEl.value && classEl.value);
  if(name==='where') return $('#f-addr').value.trim().length>4;
  if(name==='who') return $('#f-name').value.trim().length>1 && $('#f-phone').value.replace(/\D/g,'').length>=10;
  return true;
}
function validate(){
  const cur=$$('[data-step]').find(s=>!s.classList.contains('hide'));
  if(!cur) return;
  const btn=cur.querySelector('[data-next]')||cur.querySelector('#submitbtn');
  if(btn) btn.disabled=!ok(cur.dataset.step);
}
$$('#bookform input, #bookform select').forEach(el=>{
  el.addEventListener('input',validate); el.addEventListener('change',validate);
});
$('#f-phone').addEventListener('input', e=>{
  const d=e.target.value.replace(/\D/g,'').slice(0,10);
  e.target.value = d.length>6 ? '('+d.slice(0,3)+') '+d.slice(3,6)+'-'+d.slice(6)
    : d.length>3 ? '('+d.slice(0,3)+') '+d.slice(3) : d;
  validate();
});
$$('[data-slot]').forEach(s=>s.addEventListener('click',()=>{
  $$('[data-slot]').forEach(x=>x.classList.remove('sel'));
  s.classList.add('sel'); $('input',s).checked=true;
}));
$('[data-slot]').classList.add('sel');

open();
<\/script>`;

  return page('Book a mechanic', 'book', body, js);
}

/* ---------- quote ---------- */

function quoteView(job, veh, q, eligible, findings = [], assessment = null) {
  const lead = findings.find((f) => f.lead) || findings[0];
  const hasRange = !!(q.low_cents && q.high_cents);

  const body = `<div class="shell"><div class="narrow" style="padding-top:34px">
  <div class="step-eyebrow">Your quote · ${esc(jobRef(job.id))}</div>
  <h1 style="font-size:32px;font-weight:670;letter-spacing:-.035em;margin:0 0 9px">Two numbers, both honest.</h1>
  <p class="sub" style="color:var(--g500);font-size:16.5px;margin:0 0 26px;line-height:1.45">Nobody can price a repair before seeing the car. So we price the looking — fixed — and give you the range for the fixing. You approve the exact figure before anything is touched.</p>

  <div class="pricecard">
    <div class="band dark">
      <div class="k">Diagnosis, at your location</div>
      <div class="n">${money(q.total_cents)}</div>
      <div class="sub">A licensed mechanic scans it, tests it, photographs what they find, and explains it — whether or not you go ahead with the repair. This is the only thing we place a hold for today.</div>
    </div>
    ${hasRange ? `<div class="band">
      <div class="k">Likely repair${lead ? ' — ' + esc(lead.label.toLowerCase()) : ''}</div>
      <div class="n">${money(q.low_cents)} – ${money(q.high_cents)}</div>
      <div class="sub">For your ${esc(veh.year)} ${esc(veh.make)} ${esc(veh.model)}. You'll see the exact figure with photos attached, and nothing happens until you tap approve.</div>
      <div class="credit">${ico('check', 14)} The ${money(q.total_cents)} comes off the repair</div>
    </div>` : `<div class="band">
      <div class="k">Repair cost</div>
      <div class="n" style="font-size:23px;letter-spacing:-.025em">We're not going to guess</div>
      <div class="sub">${esc(assessment && assessment.no_range_reason ? assessment.no_range_reason : '')} You'll see the exact figure with photos before anything is touched, and you can walk away paying only for the diagnosis.</div>
      <div class="credit">${ico('check', 14)} The ${money(q.total_cents)} comes off the repair</div>
    </div>`}
    ${!eligible ? `<div class="band" style="background:var(--amber-wash)">
      <div class="k" style="color:#5E3B00;font-weight:600">This one needs a lift</div>
      <div class="sub" style="color:#5E3B00">We'll diagnose it where it stands, then route the repair to a shop we've vetted. Same price, same guarantee.</div></div>` : ''}
  </div>

  <form method="post" action="/jobs/${job.id}/accept" style="margin-top:20px">
    <button type="submit" class="btn btn-wide btn-blue">${ico('card', 18)} Book the diagnosis · ${money(q.total_cents)}</button>
  </form>
  <div class="help" style="text-align:center;margin-top:12px">A hold, not a charge. Cancel any time before the mechanic sets off.</div>

  <div class="panel" style="margin-top:22px"><div class="panel-h"><h2>What happens next</h2></div>
    <div class="panel-b"><dl class="dl">
      <dt>Right away</dt><dd>We offer the job to licensed mechanics near you carrying the right parts</dd>
      <dt>Before they arrive</dt><dd>You get their name, photo, and credentials by text</dd>
      <dt>On site</dt><dd>They diagnose and photograph everything — the fault, the part, the work</dd>
      <dt>Then</dt><dd>You see the evidence and the exact price, and decide</dd>
      <dt>If we can't finish</dt><dd>Every hold released. You pay nothing.</dd>
    </dl></div></div>
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

function diagnosisForm(job, veh, cust, q, findings = [], answers = []) {
  const abortOpts = [
    ['no_tools', "Right tools weren't on the truck"],
    ['not_safe', 'Not safe to work at this location'],
    ['beyond_mobile_scope', 'Needs a lift or shop equipment'],
    ['parts_unavailable', 'Parts not available'],
    ['customer_declined', 'Customer declined the work'],
    ['vehicle_inaccessible', "Couldn't access the vehicle"],
  ].map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');

  const codeOpts = Object.entries(T_LABELS).map(([c, l]) =>
    `<option value="${c}" ${c === job.symptom_code ? 'selected' : ''}>${esc(l)}</option>`).join('');

  const drop = (name, label, hint) => `
    <div class="drop" data-drop>
      <input type="file" name="${name}" accept="image/*" capture="environment">
      <b data-drop-label>${esc(label)}</b><span>${esc(hint)}</span></div>`;

  const brief = findings.length ? `
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>What the customer reported</h2>
      <span class="meta">Before you arrived</span></div>
      <div class="panel-b">
        <p style="margin:0 0 15px;font-size:15.5px;font-style:italic;color:var(--g700)">"${esc(job.symptom_notes || '')}"</p>
        ${answers.length ? `<dl class="dl" style="margin-bottom:16px">${answers.map((a) => `
          <dt>${esc((T_QUESTIONS[a.question_id] || {}).prompt || a.question_id)}</dt>
          <dd style="font-weight:580">${esc(a.label || '')}</dd>`).join('')}</dl>` : ''}
        <div style="font-size:13px;color:var(--g500);font-weight:520;margin-bottom:9px">Our triage predicted</div>
        ${findings.map((f) => `<div class="finding${f.lead ? ' lead' : ''}" style="margin-bottom:8px">
          <div class="top"><b>${esc(f.label)}</b><span class="pc">${f.confidence}%</span></div>
          <div class="meter"><i style="width:${f.confidence}%"></i></div></div>`).join('')}
        ${notice('info', 'info', 'Confirm or correct it', 'Set the actual finding below. Whether triage was right is the number we track — being wrong is useful data, not a mark against you.')}
      </div></div>` : '';

  const deferRow = (i) => `
    <div class="grid3" style="margin-bottom:10px">
      <div class="f" style="margin-bottom:0"><input type="text" name="deferred_system_${i}" placeholder="System (e.g. Tyres)"></div>
      <div class="f" style="margin-bottom:0"><input type="text" name="deferred_note_${i}" placeholder="What you noticed"></div>
      <div class="f" style="margin-bottom:0"><select name="deferred_urgency_${i}">
        <option value="monitor">Keep an eye on it</option>
        <option value="soon">Worth planning for</option>
        <option value="now">Needs attention soon</option></select></div>
    </div>`;

  const body = `<div class="shell"><div class="narrow">
    <div class="page-head">
      <h1>Work order ${esc(jobRef(job.id))}</h1>
      <p>${esc(veh.year)} ${esc(veh.make)} ${esc(veh.model)} · ${esc(job.service_address)}</p>
    </div>

    <div class="panel" style="margin-top:20px"><div class="panel-h"><h2>Job detail</h2>
      <span class="meta">${money(q.total_cents)} diagnostic</span></div>
      <div class="panel-b"><dl class="dl">
        <dt>Customer</dt><dd>${esc(cust.name)} · ${esc(cust.phone)}</dd>
        <dt>Window</dt><dd>${esc(job.requested_window)}</dd>
      </dl></div></div>

    ${brief}

    <form method="post" action="/tech/job/${job.id}/diagnosis" enctype="multipart/form-data" id="dxform">

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Vehicle</h2></div>
        <div class="panel-b"><div class="grid2">
          <div class="f" style="margin-bottom:0"><label>VIN</label>
            <input type="text" name="vin_confirmed" value="${esc(veh.vin || '')}" maxlength="17" autocapitalize="characters" placeholder="1HGFC2F53GA012345"></div>
          <div class="f" style="margin-bottom:0"><label>Odometer</label>
            <input type="number" name="odometer" value="${esc(veh.odometer_last || '')}" inputmode="numeric" placeholder="98400"></div>
        </div></div></div>

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>What you actually found</h2></div>
        <div class="panel-b">
          <div class="f"><label>Actual fault</label><select name="actual_code">${codeOpts}</select>
            <div class="help">If this differs from the prediction above, that's exactly what we need to know.</div></div>
          <div class="grid2">
            <div class="f"><label>System</label><input type="text" name="system" placeholder="Starting &amp; charging"></div>
            <div class="f"><label>Component</label><input type="text" name="component" placeholder="Starter motor"></div>
          </div>
          <div class="grid3">
            <div class="f"><label>Fault codes</label><input type="text" name="fault_codes" placeholder="P0562"></div>
            <div class="f"><label>Labour hours</label><input type="text" name="labor_hours_est" placeholder="1.5" inputmode="decimal"></div>
            <div class="f"><label>Severity</label><select name="severity">
              <option value="routine">Routine</option><option value="urgent">Urgent</option><option value="safety">Safety</option></select></div>
          </div>
          <div class="f"><label>Findings — the customer reads this</label>
            <textarea name="findings_notes" rows="3" placeholder="No crank. 12.4V at rest, 9.8V cranking. No click at solenoid. Bench tested starter — open circuit."></textarea></div>
          <div class="f" style="margin-bottom:0"><label>Recommendation</label>
            <input type="text" name="recommendation" placeholder="Replace starter motor"></div>
        </div></div>

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Evidence</h2>
        <span class="meta">The customer sees these before deciding</span></div>
        <div class="panel-b"><div class="grid3">
          ${drop('photo_fault', 'The fault', 'What failed')}
          ${drop('photo_part', 'The part', 'Old and new')}
          ${drop('photo_completed', 'Work area', 'Optional now')}
        </div></div></div>

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Repair quote</h2>
        <span class="meta">Customer approves before you start</span></div>
        <div class="panel-b">
          <div class="grid2">
            <div class="f"><label>Parts ($)</label><input type="text" name="repair_parts" placeholder="290.00" inputmode="decimal" id="rp"></div>
            <div class="f"><label>Labour ($)</label><input type="text" name="repair_labor" placeholder="260.00" inputmode="decimal" id="rl"></div>
          </div>
          <div style="background:var(--g50);border-radius:10px;padding:15px 17px">
            <div style="display:flex;align-items:baseline"><span style="font-size:14px;color:var(--g500)">Total</span>
              <b style="margin-left:auto;font-size:19px;font-variant-numeric:tabular-nums" id="rtot">$0.00</b></div>
            <div style="display:flex;align-items:baseline;margin-top:5px"><span style="font-size:14px;color:var(--green)">Less diagnostic already held</span>
              <b style="margin-left:auto;font-size:15px;color:var(--green);font-variant-numeric:tabular-nums">− ${money(q.total_cents)}</b></div>
            <div style="display:flex;align-items:baseline;margin-top:9px;padding-top:9px;border-top:1px solid var(--g200)">
              <span style="font-size:14.5px;font-weight:600">Customer pays</span>
              <b style="margin-left:auto;font-size:23px;font-variant-numeric:tabular-nums" id="rbal">$0.00</b></div>
          </div>
          <div class="help">Leave both blank if nothing needs replacing — the customer is charged the diagnostic only and told it's good news.</div>
        </div></div>

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Noticed, but not fixing today</h2>
        <span class="meta">Logged, never upsold</span></div>
        <div class="panel-b">
          ${deferRow(1)}${deferRow(2)}${deferRow(3)}
          <div class="help">These go on the customer's vehicle record with no charge and no pressure. Do not raise them as a sale on site.</div>
        </div></div>

      <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Outcome</h2></div>
        <div class="panel-b">
          <label class="sym" data-out="diagnosed" style="margin-bottom:9px">
            <input type="radio" name="outcome" value="diagnosed" checked>
            <span class="ic">${ico('check')}</span>
            <span class="tx"><b>Diagnosed</b><span>Send the quote to the customer for approval</span></span></label>
          <label class="sym" data-out="aborted">
            <input type="radio" name="outcome" value="aborted">
            <span class="ic">${ico('alert')}</span>
            <span class="tx"><b>Couldn't complete</b><span>Every hold released — customer charged nothing</span></span></label>
          <div class="f hide" id="abortwrap" style="margin-top:17px;margin-bottom:0">
            <label>Why not?</label>
            <select name="abort_reason_code"><option value="">Select a reason</option>${abortOpts}</select></div>
        </div></div>

      <button type="submit" class="btn btn-wide btn-blue" style="margin-top:20px">Submit work order</button>
    </form>
  </div></div>`;

  const js = `<script>
const $$=s=>Array.from(document.querySelectorAll(s));
$$('[data-out]').forEach(c=>c.addEventListener('click',()=>{
  $$('[data-out]').forEach(x=>x.classList.remove('sel'));
  c.classList.add('sel'); c.querySelector('input').checked=true;
  document.getElementById('abortwrap').classList.toggle('hide', c.dataset.out!=='aborted');
}));
document.querySelector('[data-out="diagnosed"]').classList.add('sel');
$$('[data-drop]').forEach(d=>{
  const i=d.querySelector('input');
  i.addEventListener('change',()=>{ if(i.files&&i.files[0]){ d.classList.add('has');
    d.querySelector('[data-drop-label]').textContent=i.files[0].name.slice(0,20);} });
});
const CREDIT=${q.total_cents};
function calc(){
  const p=parseFloat(document.getElementById('rp').value||0)*100;
  const l=parseFloat(document.getElementById('rl').value||0)*100;
  const t=(p||0)+(l||0);
  const f=c=>'$'+(c/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('rtot').textContent=f(t);
  document.getElementById('rbal').textContent=f(Math.max(0,t-CREDIT));
}
['rp','rl'].forEach(id=>document.getElementById(id).addEventListener('input',calc));
<\/script>`;
  return page('Work order', 'tech', body, js);
}

const T_LABELS = require('./triage').LABELS;

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

/* =======================================================================
   CUSTOMER JOB PAGE — where the brand lives after the sale
   ======================================================================= */

const STAGES = [
  { key: 'booked',   lbl: 'Booked' },
  { key: 'matched',  lbl: 'Mechanic accepts' },
  { key: 'diagnosed',lbl: 'Diagnosed' },
  { key: 'approved', lbl: 'You approve' },
  { key: 'done',     lbl: 'Complete' },
];

function stageIndex(j) {
  if (j.status === 'completed' || j.status === 'aborted') return 4;
  if (j.status === 'approved') return 3;
  if (j.status === 'awaiting_approval') return 2;
  if (j.status === 'accepted') return 1;
  return 0;
}

function initials(name) {
  return String(name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function customerJob(b, media, history) {
  const { job: j, cust, veh, diag, repair, contractor, dx, pays, deferred } = b;
  const idx = stageIndex(j);

  const tracker = `<div class="tracker">${STAGES.map((s, i) => `
    <div class="node ${i < idx ? 'done' : i === idx ? 'on' : ''}">
      <div class="dot">${i < idx ? ico('check', 14) : `<span style="font-size:11.5px;font-weight:640">${i + 1}</span>`}</div>
      <div class="lbl">${esc(s.lbl)}</div>
    </div>`).join('')}</div>`;

  /* the ranked triage assessment, shown back to them */
  let findings = [];
  try { findings = JSON.parse(j.triage_findings || '[]'); } catch { findings = []; }
  let answers = [];
  try { answers = JSON.parse(j.triage_answers || '[]'); } catch { answers = []; }

  const proBlock = contractor ? `
    <div class="panel"><div class="panel-h"><h2>Your mechanic</h2>
      <span class="meta"><span class="badge go">Verified</span></span></div>
      <div class="panel-b"><div class="pro">
        <div class="face">${esc(initials(contractor.legal_name))}</div>
        <div class="who"><b>${esc(contractor.legal_name)}</b>
          <span>${esc(contractor.entity_name)} · based in ${esc(contractor.base_label)}</span>
          <div class="creds">
            <span class="badge">Licensed ${esc(contractor.license_number)}</span>
            <span class="badge go">Insured to ${esc(contractor.insurance_expiry)}</span>
            <span class="badge">Background checked</span>
          </div>
        </div>
      </div></div></div>` : `
    <div class="panel"><div class="panel-h"><h2>Finding your mechanic</h2>
      <span class="meta"><span class="badge live"><i></i>In progress</span></span></div>
      <div class="panel-b">
        <p style="margin:0;color:var(--g500)">We're offering this to the licensed mechanics nearest you who are approved for this job and carrying the right parts. You'll get a text with their name and details the moment one accepts.</p>
        ${notice('ok', 'shield', 'Nothing charged if nobody can come', "If no mechanic can cover your window, the hold on your card is released automatically and you're charged nothing.")}
      </div></div>`;

  /* the approval moment */
  const balance = repair ? Math.max(0, repair.total_cents - repair.credit_cents) : 0;
  const approvalBlock = (repair && !repair.accepted_at && !repair.declined_at) ? `
    <div class="approve" style="margin-top:16px">
      <div class="hd">Your decision — nothing happens until you say so</div>
      <div class="bd">
        ${dx ? `<div style="margin-bottom:17px">
          <div style="font-size:13px;color:var(--g500);font-weight:520">What we found</div>
          <div style="font-size:18px;font-weight:610;letter-spacing:-.022em;margin-top:3px">${esc(dx.recommendation || dx.component || 'See findings')}</div>
          <div style="font-size:14.5px;color:var(--g500);margin-top:6px;line-height:1.5">${esc(dx.findings_notes || '')}</div>
        </div>` : ''}
        ${media.length ? `<div class="shots" style="margin-bottom:18px">${media.map((m) => `
          <figure class="shot"><img src="${esc(m.url)}" alt="${esc(m.media_role)}">
          <figcaption>${esc(m.media_role.replace(/_/g, ' '))}</figcaption></figure>`).join('')}</div>` : ''}
        <div class="lines" style="padding:0 0 12px">
          <div class="line"><div class="k">Parts</div><div class="v">${money(repair.parts_cents)}</div></div>
          <div class="line"><div class="k">Labour</div><div class="v">${money(repair.labor_cents)}</div></div>
          <div class="line"><div class="k" style="color:var(--green)">Diagnostic already paid</div>
            <div class="v" style="color:var(--green)">− ${money(repair.credit_cents)}</div></div>
        </div>
        <div style="display:flex;align-items:baseline;border-top:1.5px solid var(--g200);padding-top:15px">
          <div style="font-size:15px;font-weight:600">You pay</div>
          <div style="margin-left:auto"><span class="big">${money(balance)}</span>
            <span class="strike">${money(repair.total_cents)}</span></div>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <form method="post" action="/j/${esc(j.public_token)}/approve" style="flex:1">
            <button class="btn btn-wide btn-green">Approve — go ahead</button></form>
          <form method="post" action="/j/${esc(j.public_token)}/decline">
            <button class="btn btn-ghost">Not today</button></form>
        </div>
        <div class="help" style="text-align:center;margin-top:12px">Decline and you pay the ${money(repair.credit_cents)} diagnostic only. The report and photos are yours to take to any shop.</div>
      </div>
    </div>` : '';

  const authorized = pays.filter((p) => p.status === 'authorized').reduce((s, p) => s + p.authorized_cents, 0);
  const captured = pays.filter((p) => p.status === 'captured').reduce((s, p) => s + p.captured_cents, 0);

  const moneyBlock = `
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Money</h2></div>
      <div class="lines">
        <div class="line"><div class="k"><b>Diagnostic</b>Fixed, agreed up front</div>
          <div class="v">${money(diag ? diag.total_cents : 0)}</div></div>
        ${repair ? `<div class="line"><div class="k"><b>Repair</b>${repair.accepted_at ? 'Approved by you' : repair.declined_at ? 'Declined' : 'Awaiting your decision'}</div>
          <div class="v">${money(repair.total_cents)}</div></div>` : ''}
        <div class="line"><div class="k">On hold, not charged</div><div class="v">${money(authorized)}</div></div>
        <div class="line sum"><div class="k">Charged so far</div><div class="v">${money(captured)}</div></div>
      </div>
      <div class="panel-b" style="padding-top:4px"><div class="help">A hold is not a charge. Money only moves when work you approved is finished.</div></div>
    </div>`;

  const triageBlock = findings.length ? `
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>What you told us</h2>
      ${j.prediction_correct !== null && j.prediction_correct !== undefined
      ? `<span class="meta">${j.prediction_correct ? '<span class="badge go">We called it right</span>' : '<span class="badge">Turned out different</span>'}</span>` : ''}</div>
      <div class="panel-b">
        <p style="margin:0 0 14px;font-size:15px;color:var(--g700);font-style:italic">"${esc(j.symptom_notes || '')}"</p>
        ${answers.length ? `<dl class="dl" style="margin-bottom:16px">${answers.map((a) => `
          <dt>${esc((T_QUESTIONS[a.question_id] || {}).prompt || a.question_id)}</dt>
          <dd>${esc(a.label || '')}</dd>`).join('')}</dl>` : ''}
        <div style="font-size:13px;color:var(--g500);font-weight:520;margin-bottom:9px">Our assessment before we came out</div>
        ${findings.map((f) => `
          <div class="finding${f.lead ? ' lead' : ''}" style="margin-bottom:8px">
            <div class="top"><b>${esc(f.label)}</b><span class="pc">${f.confidence}% likely</span></div>
            ${f.explain ? `<div class="why">${esc(f.explain)}</div>` : ''}
            <div class="meter"><i style="width:${f.confidence}%"></i></div>
          </div>`).join('')}
      </div></div>` : '';

  const URGENCY = { now: ['now', 'Needs attention soon'], soon: ['soon', 'Worth planning for'], monitor: ['', 'Keep an eye on it'] };
  const deferredBlock = deferred.length ? `
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Noticed, but not fixed</h2>
      <span class="meta">No charge, no pressure</span></div>
      <div class="panel-b">
        <p style="margin:0 0 16px;color:var(--g500);font-size:14.5px">Things your mechanic spotted while working. None of it was touched, and none of it is on your bill — it's here so you know, and so it's on record.</p>
        ${deferred.map((d) => {
    const u = URGENCY[d.urgency] || URGENCY.monitor;
    return `<div class="defer ${u[0]}"><b>${esc(d.system || 'Noted')} — ${esc(u[1])}</b><span>${esc(d.note)}</span></div>`;
  }).join('')}
      </div></div>` : '';

  const historyBlock = history.length ? `
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>This vehicle's history</h2>
      <span class="meta">${history.length} previous visit${history.length > 1 ? 's' : ''}</span></div>
      <div class="scroll-x"><table class="tbl">
        <thead><tr><th>Date</th><th>Service</th><th>What was done</th></tr></thead>
        <tbody>${history.map((h) => `<tr>
          <td class="mono" style="white-space:nowrap">${esc((h.completed_at || '').slice(0, 10))}</td>
          <td style="font-weight:540">${esc(symLabel(h.symptom_code))}</td>
          <td style="color:var(--g500)">${esc(h.recommendation || h.component || '—')}</td>
        </tr>`).join('')}</tbody></table></div></div>` : '';

  const doneBlock = j.status === 'completed' ? `
    ${notice('ok', 'check', j.outcome === 'diagnostic_only' ? 'Diagnosed, nothing replaced' : 'All finished',
    j.outcome === 'diagnostic_only'
      ? `You were charged the diagnostic only. The full report and every photo are yours — take them to any shop you like.`
      : `Charged exactly what you approved. Your report, photos, and warranty are on this page permanently.`)}` : '';

  const abortBlock = j.status === 'aborted' ? `
    ${notice('warn', 'alert', 'We could not finish this one',
    `Every hold on your card has been released and you have not been charged. A coordinator will call you with the next option.`)}` : '';

  const safetyBlock = j.safety_level === 'stop' ? `
    ${notice('stop', 'alert', 'Please do not drive this car', 'Based on what you described, driving it risks making the repair much worse, or worse than that. Leave it where it is — we come to the vehicle.')}` : '';

  const body = `<div class="shell"><div class="narrow">
    <div class="page-head" style="padding-bottom:0">
      <div style="display:flex;align-items:center;gap:11px;margin-bottom:7px">
        <h1 style="margin:0;font-size:27px">${esc(veh.year)} ${esc(veh.make)} ${esc(veh.model)}</h1>
      </div>
      <p>${esc(jobRef(j.id))} · ${esc(symLabel(j.symptom_code))} · ${esc(j.service_address)}</p>
    </div>

    <div style="margin-top:26px">${tracker}</div>
    ${safetyBlock}${doneBlock}${abortBlock}

    ${approvalBlock}

    <div style="margin-top:16px">${proBlock}</div>

    ${j.status === 'accepted' || j.status === 'approved' ? `
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>When</h2></div>
      <div class="panel-b"><dl class="dl">
        <dt>Arrival window</dt><dd>${esc(j.requested_window)}</dd>
        <dt>If we're late</dt><dd>Your diagnostic is free. That's the whole policy.</dd>
      </dl></div></div>` : ''}

    ${moneyBlock}
    ${media.length && !(repair && !repair.accepted_at && !repair.declined_at) ? `
    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Photos from your job</h2></div>
      <div class="panel-b"><div class="shots" style="margin-top:0">${media.map((m) => `
        <figure class="shot"><img src="${esc(m.url)}" alt="${esc(m.media_role)}">
        <figcaption>${esc(m.media_role.replace(/_/g, ' '))}</figcaption></figure>`).join('')}</div></div></div>` : ''}
    ${deferredBlock}
    ${triageBlock}
    ${historyBlock}

    <div class="panel" style="margin-top:16px"><div class="panel-h"><h2>Something not right?</h2></div>
      <div class="panel-b">
        <p style="margin:0 0 14px;color:var(--g500);font-size:14.5px">If the problem comes back, tell us. We look at our own work first — we don't send you to a dealership.</p>
        <a class="btn btn-ghost btn-sm" href="tel:+16125550100">Call us</a>
      </div></div>
  </div></div>`;
  return page('Your job ' + jobRef(j.id), 'book', body);
}

const T_QUESTIONS = require('./triage').QUESTIONS;
module.exports.customerJob = customerJob;


function completeForm(job, veh, cust, q) {
  const repair = require('./db').db.prepare(
    `SELECT * FROM quotes WHERE job_id=? AND stage='repair' ORDER BY id DESC`).get(job.id);
  const body = `<div class="shell"><div class="narrow">
    <div class="page-head"><h1>${esc(jobRef(job.id))} — approved</h1>
      <p>${esc(veh.year)} ${esc(veh.make)} ${esc(veh.model)} · ${esc(cust.name)}</p></div>
    ${notice('ok', 'check', 'The customer approved this repair', `They agreed to ${money(repair ? repair.total_cents : 0)}. Go ahead with the work, then photograph the finished job below.`)}
    <form method="post" action="/tech/job/${job.id}/complete" enctype="multipart/form-data" class="panel" style="margin-top:16px">
      <div class="panel-h"><h2>Finish the job</h2></div>
      <div class="panel-b">
        <div class="drop" data-drop><input type="file" name="photo_completed" accept="image/*" capture="environment">
          <b data-drop-label>Photo of the completed work</b><span>Installed and buttoned up</span></div>
        <button type="submit" class="btn btn-wide btn-green" style="margin-top:18px">Mark complete and charge</button>
        <div class="help" style="text-align:center;margin-top:11px">Captures ${money(repair ? repair.total_cents : 0)} — exactly the approved figure, not a cent more.</div>
      </div></form>
  </div></div>`;
  const js = `<script>
const d=document.querySelector('[data-drop]'), i=d.querySelector('input');
i.addEventListener('change',()=>{ if(i.files&&i.files[0]){ d.classList.add('has');
  d.querySelector('[data-drop-label]').textContent=i.files[0].name.slice(0,22);} });
<\/script>`;
  return page('Complete job', 'tech', body, js);
}
module.exports.completeForm = completeForm;

/* Mechanic access links — the page John uses to onboard people. */
function teamView(rows, baseUrl) {
  const body = `<div class="shell"><div class="narrow">
    <div class="page-head"><h1>Mechanics</h1>
      <p>Each mechanic gets one personal link. It is the only way they reach their board, and it shows them their own jobs and nobody else's.</p></div>
    ${rows.map((c) => {
    const gates = [];
    if (!c.coi_on_file) gates.push('insurance');
    if (!c.agreement_signed_at) gates.push('agreement');
    if (!c.training_completed_at) gates.push('training');
    const link = `${baseUrl}/tech/${c.id}?k=${c.access_token}`;
    return `<div class="panel" style="margin-top:14px">
      <div class="panel-h"><h2>${esc(c.legal_name)}</h2>
        <span class="meta">${gates.length
      ? `<span class="badge stop">${gates.length} gate${gates.length > 1 ? 's' : ''} open</span>`
      : '<span class="badge go">Cleared for dispatch</span>'}</span></div>
      <div class="panel-b">
        <dl class="dl">
          <dt>Entity</dt><dd>${esc(c.entity_name || '—')}</dd>
          <dt>Based</dt><dd>${esc(c.base_label || '—')}</dd>
          <dt>Licence</dt><dd class="mono">${esc(c.license_number || '—')} · to ${esc(c.license_expiry || '—')}</dd>
          <dt>Insurance</dt><dd>${esc(c.insurance_carrier || '—')} · to ${esc(c.insurance_expiry || '—')}</dd>
          <dt>Training</dt><dd>${c.training_completed_at ? esc(c.training_completed_at)
        : '<span style="color:var(--red)">Not completed — cannot be dispatched</span>'}</dd>
        </dl>
        <div class="f" style="margin-top:16px;margin-bottom:0"><label>Their personal link</label>
          <input type="text" readonly value="${esc(link)}" onclick="this.select()" style="font-family:var(--mono);font-size:12.5px"></div>
        <div class="help">Text this to them directly. Anyone holding it can see this mechanic's jobs, so never post it anywhere.</div>
      </div></div>`;
  }).join('')}
  </div></div>`;
  return page('Mechanics', 'admin', body);
}
module.exports.teamView = teamView;
