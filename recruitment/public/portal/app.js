/* Wrenchmark Portal — screens + router.
 * Every screen is a function that renders into #view. Screens never touch
 * data directly; they call WM.api.* and WM.auth.*.
 */
(function (g) {
  'use strict';
  var api = g.WM.api, auth = g.WM.auth, M = g.WM.money;
  var BASE = g.WM_BASE || '/mechanic';
  var V, NAV;

  /* ── helpers ─────────────────────────────────────────────────────── */
  function esc(s){ return String(s==null?'':s).replace(/[<>&"]/g,function(c){
    return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; }); }
  function $(id){ return document.getElementById(id); }
  function loading(){ V.innerHTML = '<div class="loading">Loading…</div>'; }
  function pay(n){ return n === null ? '<span class="tbc">— to be confirmed —</span>' : M.round(n); }
  function on(id, ev, fn){ var el = $(id); if (el) el.addEventListener(ev, fn); }
  function each(sel, fn){ Array.prototype.forEach.call(V.querySelectorAll(sel), fn); }

  function toast(t, bad){
    var el = $('toast'); el.textContent = t; el.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(el._t); el._t = setTimeout(function(){ el.className = 'toast'; }, 3600);
  }
  function fail(e){ toast(e && e.message ? e.message : 'Something went wrong.', true); }

  function go(path){ history.pushState({}, '', path); render(); }
  g.WM_GO = go;

  /* ── shared fragments ────────────────────────────────────────────── */
  function statusBanner(m){
    if (m.dispatchable) {
      return '<div class="banner"><div class="st"><i>●</i> Active — ready for jobs</div>'+
        '<p>You are eligible for work in '+esc(m.cluster_label)+' and within '+m.radius_mi+' miles.</p></div>';
    }
    var b = m.blockers && m.blockers.length
      ? 'Still needed before your first job: <b>'+m.blockers.map(esc).join(', ')+'</b>.'
      : 'Your account is being reviewed.';
    return '<div class="banner warn"><div class="st"><i>●</i> Registered — not yet dispatchable</div>'+
      '<p>'+b+' Nothing else is required from you today.</p></div>';
  }

  function foundingNote(m){
    if (!m.is_founding) return '';
    return '<div class="note">Founding mechanic — you keep <b>100%</b> of every job through '+
      esc(m.founding_until)+'. After that, '+api.RATES.founding_locked_take_pct+
      '% to Wrenchmark, locked for as long as you drive with us. Standard rate is '+
      api.RATES.platform_take_pct+'%.</div>';
  }

  function jobCard(j, showDistance){
    var when = (showDistance ? j.distance_mi + ' mi · ' : '') + j.day + ' · ' + j.window;
    var cls = j.state === 'OFFERED' ? '' : (j.state === 'PAID' || j.state === 'COMPLETED' ? ' go' : ' solid');
    return '<button class="job" data-job="'+esc(j.id)+'">'+
      '<div class="when">'+esc(when)+(j.expires_in_min ? ' · expires in '+j.expires_in_min+' min' : '')+'</div>'+
      '<div class="svc">'+esc(j.service)+'</div>'+
      '<div class="veh">'+j.vehicle.year+' '+esc(j.vehicle.make)+' '+esc(j.vehicle.model)+
        ' · '+esc(j.cluster_label)+'</div>'+
      '<div class="foot"><div class="pay">'+pay(j.split.payout)+' <small>to you</small></div>'+
      '<span class="chip'+cls+'">'+esc(j.state_label)+'</span></div></button>';
  }
  function wireJobs(){
    each('[data-job]', function(el){
      el.addEventListener('click', function(){ go(BASE + '/job/' + el.dataset.job); });
    });
  }

  function tags(list, empty){
    if (!list || !list.length) return '<div class="locked">'+esc(empty || 'Nothing listed yet.')+'</div>';
    return '<div class="chips">'+ list.map(function(t){
      return '<span class="chip" style="font-size:11px;padding:4px 8px">'+esc(t)+'</span>'; }).join('') +'</div>';
  }

  /* ══════════════════════════════════════════════════════════════════
     1. WELCOME — sign in
     ══════════════════════════════════════════════════════════════════ */
  function welcome(){
    V.innerHTML =
      '<div class="auth">'+
        '<div class="mark">Wrench<span>mark</span></div>'+
        '<div class="tag">Mechanic portal · Minneapolis</div>'+
        '<p class="pitch">We send paying work to mobile mechanics. You keep your own hours, '+
        'your own van, and your own customers.</p>'+
        '<div class="sso">'+
          '<button id="g"><span class="g">G</span> Continue with Google</button>'+
          '<button id="a"><span class="g">&#63743;</span> Continue with Apple</button>'+
          '<div class="or">or</div>'+
          '<button id="p"><span class="g">#</span> Continue with mobile number</button>'+
        '</div>'+
        '<p class="legal">By continuing you agree to the Wrenchmark mechanic terms. '+
        'Applying is free and nothing here costs you money.</p>'+
        '<div class="devhint"><b>PROTOTYPE</b> — no real authentication yet. '+
        'Any option signs you in. Firebase Auth drops into services.js later; '+
        'the screens do not change.</div>'+
      '</div>';

    function run(fn, btn){
      var b = $(btn), old = b.textContent;
      b.disabled = true; b.textContent = 'Signing in…';
      fn().then(function(){ go(BASE + '/dashboard'); })
          .catch(function(e){ fail(e); b.disabled = false; b.textContent = old; });
    }
    on('g','click',function(){ run(auth.signInWithGoogle,'g'); });
    on('a','click',function(){ run(auth.signInWithApple,'a'); });
    on('p','click',function(){ go(BASE + '/phone'); });
  }

  /* ══════════════════════════════════════════════════════════════════
     2. PHONE + OTP
     ══════════════════════════════════════════════════════════════════ */
  function phone(){
    V.innerHTML =
      '<div class="auth">'+
        '<div class="mark">Wrench<span>mark</span></div>'+
        '<div class="tag">Sign in with your mobile</div>'+
        '<div class="row" style="margin-top:26px">'+
          '<label class="f" for="num">Mobile number</label>'+
          '<input id="num" type="tel" inputmode="tel" autocomplete="tel" placeholder="(612) 555-0142">'+
        '</div>'+
        '<button class="btn" id="send">Send code</button>'+
        '<button class="btn quiet" id="cancel" style="margin-top:9px">Back</button>'+
        '<div class="devhint"><b>PROTOTYPE</b> — no SMS is sent. The code is always '+
        '<b>000000</b>. Firebase phone auth replaces this in services.js.</div>'+
      '</div>';
    on('cancel','click',function(){ go(BASE + '/welcome'); });
    on('send','click',function(){
      var b = $('send'); b.disabled = true; b.textContent = 'Sending…';
      auth.startPhone($('num').value)
        .then(function(){ go(BASE + '/verify'); })
        .catch(function(e){ fail(e); b.disabled = false; b.textContent = 'Send code'; });
    });
  }

  function verify(){
    V.innerHTML =
      '<div class="auth">'+
        '<div class="mark">Wrench<span>mark</span></div>'+
        '<div class="tag">Enter the 6-digit code</div>'+
        '<div class="otp">'+
          [0,1,2,3,4,5].map(function(i){
            return '<input id="o'+i+'" type="text" inputmode="numeric" maxlength="1" autocomplete="one-time-code">';
          }).join('')+
        '</div>'+
        '<button class="btn" id="ok">Verify</button>'+
        '<button class="btn quiet" id="again" style="margin-top:9px">Use a different number</button>'+
        '<div class="devhint"><b>PROTOTYPE</b> — the code is <b>000000</b>.</div>'+
      '</div>';

    // auto-advance between boxes, like a real OTP field
    [0,1,2,3,4,5].forEach(function(i){
      var el = $('o'+i);
      el.addEventListener('input', function(){
        el.value = el.value.replace(/\D/g,'').slice(0,1);
        if (el.value && i < 5) $('o'+(i+1)).focus();
      });
      el.addEventListener('keydown', function(e){
        if (e.key === 'Backspace' && !el.value && i > 0) $('o'+(i-1)).focus();
      });
      el.addEventListener('paste', function(e){
        var t = (e.clipboardData.getData('text')||'').replace(/\D/g,'').slice(0,6);
        if (!t) return;
        e.preventDefault();
        t.split('').forEach(function(c,k){ if ($('o'+k)) $('o'+k).value = c; });
        $('o'+Math.min(t.length,5)).focus();
      });
    });
    $('o0').focus();

    on('again','click',function(){ go(BASE + '/phone'); });
    on('ok','click',function(){
      var code = [0,1,2,3,4,5].map(function(i){ return $('o'+i).value; }).join('');
      var b = $('ok'); b.disabled = true; b.textContent = 'Verifying…';
      auth.confirmPhone(code)
        .then(function(){ go(BASE + '/dashboard'); })
        .catch(function(e){ fail(e); b.disabled = false; b.textContent = 'Verify'; });
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     3. REGISTRATION WIZARD (account state NEW)
     ══════════════════════════════════════════════════════════════════ */
  var reg = { step: 1, data: {} };
  var REG_LABELS = ['Who you are','Your work','What you can do','When you work','Insurance'];

  function register(){
    var d = reg.data;
    function opts(list, name, chosen){
      return list.map(function(o){
        var on = (chosen||[]).indexOf(o) >= 0;
        return '<label class="chk"><input type="checkbox" name="'+name+'" value="'+esc(o)+'"'+
               (on?' checked':'')+'><span>'+esc(o)+'</span></label>';
      }).join('');
    }
    var bars = '';
    for (var i=1;i<=5;i++) bars += '<i class="'+(i<reg.step?'done':i===reg.step?'now':'')+'"></i>';

    var steps = {
      1: '<div class="row"><div><label class="f" for="full_name">Full name</label>'+
         '<input id="full_name" type="text" autocomplete="name" value="'+esc(d.full_name||'')+'"></div></div>'+
         '<div class="row two"><div><label class="f" for="phone">Mobile number</label>'+
         '<input id="phone" type="tel" autocomplete="tel" value="'+esc(d.phone||'')+'"></div>'+
         '<div><label class="f" for="email">Email</label>'+
         '<input id="email" type="email" autocomplete="email" value="'+esc(d.email||'')+'"></div></div>'+
         '<div class="row two"><div><label class="f" for="home_zip">Home ZIP</label>'+
         '<input id="home_zip" type="text" inputmode="numeric" maxlength="5" value="'+esc(d.home_zip||'')+'"></div>'+
         '<div><label class="f" for="radius">How far will you drive? (miles)</label>'+
         '<input id="radius" type="number" min="1" max="60" value="'+esc(d.radius||15)+'"></div></div>',

      2: '<div class="row two"><div><label class="f" for="operator_type">Which fits you today?</label>'+
         '<select id="operator_type">'+
           ['solo_mobile|I already run mobile repair','shop_tech|I work at a shop, want side work',
            'grad|Recent tech school graduate','other|Something else'].map(function(o){
             var p=o.split('|');
             return '<option value="'+p[0]+'"'+(d.operator_type===p[0]?' selected':'')+'>'+p[1]+'</option>';
           }).join('')+
         '</select></div>'+
         '<div><label class="f" for="years">Years turning wrenches</label>'+
         '<input id="years" type="number" min="0" max="50" value="'+esc(d.years||0)+'"></div></div>'+
         '<div class="row two"><div><label class="f" for="vehicle">Your work vehicle</label>'+
         '<input id="vehicle" type="text" placeholder="2014 Transit Connect" value="'+esc(d.vehicle||'')+'"></div>'+
         '<div><label class="f" for="hours">Hours a week you can take</label>'+
         '<input id="hours" type="number" min="0" max="80" value="'+esc(d.hours||10)+'"></div></div>',

      3: '<div class="checks two" id="services">'+opts(api.SERVICE_OPTIONS,'svc',d.services)+'</div>'+
         '<hr class="d"><label class="f">Tools you carry</label>'+
         '<div class="checks two" id="equipment">'+opts(api.EQUIPMENT_OPTIONS,'eq',d.equipment)+'</div>'+
         '<hr class="d"><label class="chk"><input type="checkbox" id="ase"'+(d.ase?' checked':'')+
         '><span>I hold ASE certification</span></label>',

      4: '<div class="checks two" id="availability">'+opts(api.AVAILABILITY_OPTIONS,'av',d.availability)+'</div>',

      5: '<p class="pitch" style="text-align:left;margin:0 0 14px;font-size:13.5px;color:var(--mute)">'+
         '<b style="color:var(--ink)">Answer honestly — this is not a filter.</b> Nobody works a '+
         'Wrenchmark job without coverage, but you only need it the day you take your first dispatch.</p>'+
         '<div class="checks">'+
           '<label class="chk"><input type="checkbox" id="ins_cgl"'+(d.ins_cgl?' checked':'')+
           '><span>General liability<small>Injury and property damage on the job</small></span></label>'+
           '<label class="chk"><input type="checkbox" id="ins_gk"'+(d.ins_gk?' checked':'')+
           '><span>Garagekeepers<small>The customer\'s vehicle while you work on it</small></span></label>'+
           '<label class="chk"><input type="checkbox" id="ins_auto"'+(d.ins_auto?' checked':'')+
           '><span>Commercial auto<small>A personal policy will not cover business use</small></span></label>'+
         '</div>'+
         '<hr class="d"><h2 style="font-family:var(--disp);font-size:18px;letter-spacing:.07em;'+
         'text-transform:uppercase;margin:0 0 10px">Check it over</h2>'+
         '<dl class="kv" id="review"></dl>',
    };

    V.innerHTML =
      '<section class="card">'+
        '<header><h2>'+esc(REG_LABELS[reg.step-1])+'</h2><span class="formno">WM-1 · REV. C</span></header>'+
        '<div class="prog"><div class="r"><span>Step <b>'+reg.step+'</b> of 5</span>'+
          '<span>'+esc(REG_LABELS[reg.step-1])+'</span></div><div class="bars">'+bars+'</div></div>'+
        '<div class="body">'+steps[reg.step]+'</div>'+
        '<div class="body"><div class="actions">'+
          '<button class="btn" id="next">'+(reg.step===5?'Send application':'Continue')+'</button>'+
          (reg.step>1?'<button class="btn quiet" id="prev">Back</button>':'')+
        '</div></div>'+
      '</section>';

    if (reg.step === 5) drawReview();
    on('prev','click',function(){ collect(); reg.step--; register(); });
    on('next','click',function(){
      collect();
      if (reg.step === 1) {
        var miss = [];
        if (!reg.data.full_name) miss.push('name');
        if (!reg.data.phone) miss.push('phone number');
        if (!reg.data.email) miss.push('email');
        if (!reg.data.home_zip) miss.push('ZIP');
        if (miss.length) return toast('We need your ' + miss.join(', ') + '.', true);
        if (!/^\d{5}$/.test(reg.data.home_zip)) return toast('That ZIP needs five digits, like 55408.', true);
      }
      if (reg.step < 5) { reg.step++; register(); window.scrollTo(0,0); return; }
      var b = $('next'); b.disabled = true; b.textContent = 'Sending…';
      api.submitApplication(reg.data)
        .then(function(r){ reg.result = r; reg.step = 1; go(BASE + '/pending'); })
        .catch(function(e){ fail(e); b.disabled = false; b.textContent = 'Send application'; });
    });

    function collect(){
      var d = reg.data;
      function v(id){ return $(id) ? ($(id).value||'').trim() : d[id]; }
      function ck(id){ return $(id) ? $(id).checked : d[id]; }
      function boxes(id){
        var box = $(id); if (!box) return null;
        return Array.prototype.slice.call(box.querySelectorAll('input:checked')).map(function(i){ return i.value; });
      }
      if ($('full_name')) { d.full_name=v('full_name'); d.phone=v('phone'); d.email=v('email');
                            d.home_zip=v('home_zip'); d.radius=v('radius'); }
      if ($('operator_type')) { d.operator_type=$('operator_type').value; d.years=v('years');
                                d.vehicle=v('vehicle'); d.hours=v('hours'); }
      if ($('services')) { d.services=boxes('services'); d.equipment=boxes('equipment'); d.ase=ck('ase'); }
      if ($('availability')) { d.availability=boxes('availability'); }
      if ($('ins_cgl')) { d.ins_cgl=ck('ins_cgl'); d.ins_gk=ck('ins_gk'); d.ins_auto=ck('ins_auto'); }
    }

    function drawReview(){
      var d = reg.data;
      function row(k,val,empty){
        return '<dt>'+k+'</dt><dd'+(val?'':' class="empty"')+'>'+esc(val||empty||'Not given')+'</dd>';
      }
      var ins=[]; if(d.ins_cgl)ins.push('General liability');
      if(d.ins_gk)ins.push('Garagekeepers'); if(d.ins_auto)ins.push('Commercial auto');
      $('review').innerHTML =
        row('Name',d.full_name)+row('Phone',d.phone)+
        row('ZIP',(d.home_zip||'')+(d.radius?' · '+d.radius+' mi':''))+
        row('Experience',(d.years||'0')+' years')+row('Vehicle',d.vehicle)+
        row('Can do',(d.services||[]).join(', '),'None selected')+
        row('Available',(d.availability||[]).join(', '),'None selected')+
        row('Insurance',ins.join(', '),'None yet — that is fine');
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     4. PENDING — application roadmap
     ══════════════════════════════════════════════════════════════════ */
  var STAGES = [
    ['Application received','On John\u2019s board.'],
    ['Phone screen','John calls within two business days. Ten minutes, no test.'],
    ['Interview','A longer conversation about the work you do and the jobs you want.'],
    ['Background check','Standard check. We tell you before it runs and we cover the cost.'],
    ['Enrollment','Portal access, set your area and hours, send your insurance certificate.'],
    ['Active','Jobs reach your phone. You accept the ones you want.'],
  ];
  var STAGE_OF = { APPLIED:1, SCREENED:2, INTERVIEWED:3, BACKGROUND:4, REGISTERED:5, ACTIVE:5 };

  function pending(){
    loading();
    api.me().then(function(m){
      var idx = STAGE_OF[m.pipeline] || 1;
      var ref = (reg.result && reg.result.ref) || m.id;
      V.innerHTML =
        '<section class="card">'+
          '<header><h2>Application received</h2></header>'+
          '<div class="body" style="text-align:center;padding:26px 15px">'+
            '<div class="label">Your application number</div>'+
            '<div class="mono" style="font-size:26px;letter-spacing:.1em;margin-top:6px">'+esc(ref)+'</div>'+
            '<p style="color:var(--mute);font-size:14px;margin:14px auto 0;max-width:360px">'+
            'Write that down. John calls every applicant — keep your phone handy.</p>'+
          '</div>'+
          '<div class="body"><h2 style="font-family:var(--disp);font-size:17px;letter-spacing:.09em;'+
          'text-transform:uppercase;margin:0 0 12px">What happens next</h2>'+
            STAGES.map(function(s,i){
              var cls = i < idx ? 'stage past' : i === idx ? 'stage now' : 'stage';
              var mark = i < idx ? '\u2713' : String(i+1);
              return '<div class="'+cls+'"><div class="dot">'+mark+'</div><div>'+
                     '<div class="t">'+esc(s[0])+'</div><div class="d">'+esc(s[1])+'</div></div></div>';
            }).join('')+
          '</div>'+
          '<div class="body"><div class="note">Nothing is needed from you right now. '+
          'This page updates as John moves you along.</div></div>'+
        '</section>';
    }).catch(fail);
  }

  /* ══════════════════════════════════════════════════════════════════
     5. DASHBOARD
     ══════════════════════════════════════════════════════════════════ */
  function dashboard(){
    loading();
    Promise.all([api.me(), api.jobs('scheduled'), api.jobs('offered'), api.earnings()])
    .then(function(r){
      var m=r[0], today=r[1], offered=r[2], e=r[3];
      V.innerHTML =
        statusBanner(m) + foundingNote(m) +
        '<section class="card"><header><h2>Today</h2><span class="formno">'+esc(m.id)+'</span></header>'+
          '<div class="body">'+ (today.length
            ? today.map(function(j){ return jobCard(j,false); }).join('')
            : '<div class="empty"><div class="h">Nothing booked</div><p>'+
              (m.dispatchable ? 'Accept a job below and it lands here.'
                              : 'Jobs appear here once your account is dispatchable.')+'</p></div>')+
          '</div></section>'+

        (m.dispatchable ?
        '<section class="card"><header><h2>This week</h2></header><div class="body"><div class="figs">'+
          '<div class="fig"><div class="n">'+M.round(e.week.earned)+'</div><div class="l">Earned</div></div>'+
          '<div class="fig"><div class="n">'+e.week.jobs+'</div><div class="l">Jobs</div></div>'+
          '<div class="fig"><div class="n">'+M.round(e.week.jobs?e.week.earned/e.week.jobs:0)+'</div>'+
          '<div class="l">Average</div></div></div></div></section>' : '')+

        '<section class="card"><header><h2>Offers</h2>'+
          (offered.length?'<span class="formno">'+offered.length+' waiting</span>':'')+'</header>'+
          '<div class="body">'+ (offered.length
            ? offered.map(function(j){ return jobCard(j,true); }).join('')
            : '<div class="empty"><div class="h">No offers right now</div><p>'+
              (m.dispatchable
                ? 'We text you the moment one matches your area and skills. You are not expected to watch this screen.'
                : 'Once your paperwork clears you will start receiving offers.')+'</p></div>')+
        '</div></section>';
      wireJobs();
    }).catch(fail);
  }

  /* ══════════════════════════════════════════════════════════════════
     6. JOBS — tabbed
     ══════════════════════════════════════════════════════════════════ */
  var jobTab = 'offered';
  function jobs(){
    loading();
    Promise.all([api.me(), api.jobs('offered'), api.jobs('scheduled'), api.jobs('done')])
    .then(function(r){
      var m=r[0], o=r[1], s=r[2], d=r[3];
      var sets = { offered:o, scheduled:s, done:d };
      var list = sets[jobTab];
      V.innerHTML =
        '<div class="tabs">'+
          [['offered','Offers',o.length],['scheduled','Upcoming',s.length],['done','Done',d.length]]
            .map(function(t){
              return '<button data-tab="'+t[0]+'" aria-selected="'+(jobTab===t[0])+'">'+
                     t[1]+'<em>'+t[2]+'</em></button>'; }).join('')+
        '</div>'+
        '<section class="card"><div class="body">'+
          (list.length ? list.map(function(j){ return jobCard(j, jobTab==='offered'); }).join('')
            : '<div class="empty"><div class="h">Nothing here</div><p>'+
              (!m.dispatchable ? 'Your account is not dispatchable yet.'
               : jobTab==='offered' ? 'We text you when a job matches your area.'
               : jobTab==='scheduled' ? 'Accepted jobs show up here with the address and phone number.'
               : 'Completed jobs and their payouts land here.')+'</p></div>')+
        '</div></section>';
      each('[data-tab]', function(b){
        b.addEventListener('click', function(){ jobTab = b.dataset.tab; jobs(); });
      });
      wireJobs();
    }).catch(fail);
  }

  /* ══════════════════════════════════════════════════════════════════
     7. JOB DETAIL + WORK FLOW
     ══════════════════════════════════════════════════════════════════ */
  function timeline(j){
    if (j.state === 'OFFERED' || j.state === 'DECLINED') return '';
    return '<div class="card"><div class="body"><div class="tl">'+
      g.WM.FLOW.map(function(s,i){
        var cls = i < j.flow_index ? 's past' : i === j.flow_index ? 's now' : 's';
        return '<div class="'+cls+'"><i></i><span>'+esc(g.WM.FLOW_LABEL[s])+'</span></div>';
      }).join('')+'</div></div></div>';
  }

  function photoGrid(j, when){
    var list = when==='before' ? j.photos_before : j.photos_after;
    return '<div class="photos">'+
      list.map(function(src,i){
        return '<div class="photo"><img src="'+src+'" alt="">'+
               '<button data-rm="'+when+'" data-i="'+i+'" aria-label="Remove">&times;</button></div>';
      }).join('')+
      '<button class="addphoto" data-add="'+when+'"><b>+</b>Add photo</button>'+
    '</div>';
  }

  function job(id){
    loading();
    api.job(id).then(function(j){
      if (!j) { V.innerHTML = '<div class="empty"><div class="h">Job not found</div></div>'; return; }
      var s = j.split, v = j.vehicle;
      var open = j.state === 'OFFERED';
      var working = j.state === 'WORKING';
      var done = j.state === 'COMPLETED' || j.state === 'PAID';

      var splitLine = s.payout === null
        ? '<div class="split">Payout terms not set for this job type yet.</div>'
        : '<div class="split">Customer pays '+M.round(s.customer)+'<br>Wrenchmark keeps <b>'+
          M.round(s.platform)+'</b>'+(s.take_pct===0?' — founding mechanic rate':' ('+s.take_pct+'%)')+'</div>';

      V.innerHTML =
        '<a class="back" href="'+BASE+'/jobs">&larr; Jobs</a>'+
        timeline(j)+
        '<section class="card">'+
          '<header><h2>'+v.year+' '+esc(v.make)+' '+esc(v.model)+'</h2>'+
            '<span class="formno">'+esc(j.id)+'</span></header>'+
          '<div class="payout"><div class="big">'+pay(s.payout)+'</div>'+
            '<div class="to">To you</div>'+splitLine+'</div>'+

          '<div class="body"><div class="label" style="margin-bottom:7px">What the customer said</div>'+
            '<div class="quote">"'+esc(j.complaint)+'"</div></div>'+

          '<div class="body"><div class="label" style="margin-bottom:7px">Requested work</div>'+
            '<ul class="lines"><li>'+j.line_items.map(esc).join('</li><li>')+'</li></ul>'+
            '<div class="locked">Estimated labor '+j.labor_hours+' hr</div></div>'+

          '<div class="body"><div class="label" style="margin-bottom:9px">Vehicle</div><dl class="kv">'+
            '<dt>Trim</dt><dd>'+esc(v.trim)+'</dd>'+
            '<dt>Mileage</dt><dd class="mono">'+v.miles.toLocaleString()+'</dd>'+
            '<dt>Engine</dt><dd>'+esc(v.engine)+'</dd>'+
            '<dt>VIN</dt><dd class="mono">'+esc(v.vin)+'</dd>'+
            '<dt>Plate</dt><dd class="mono">'+esc(v.plate)+'</dd></dl></div>'+

          '<div class="body"><div class="label" style="margin-bottom:9px">Where and when</div><dl class="kv">'+
            '<dt>Area</dt><dd>'+esc(j.neighborhood)+' — '+esc(j.cluster_label)+'</dd>'+
            (j.address_visible?'<dt>Address</dt><dd>'+esc(j.address_visible)+'</dd>':'')+
            '<dt>Distance</dt><dd class="mono">'+j.distance_mi+' mi</dd>'+
            '<dt>Window</dt><dd>'+esc(j.day)+' · '+esc(j.window)+'</dd></dl></div>'+

          '<div class="body"><div class="label" style="margin-bottom:9px">Customer</div><dl class="kv">'+
            '<dt>Name</dt><dd>'+esc(j.customer.first)+' '+esc(j.customer.last_initial)+'.</dd>'+
            '<dt>Phone</dt><dd class="mono">'+esc(j.phone_visible||j.phone_masked)+'</dd></dl>'+
            (open?'<div class="locked">Full address and phone unlock when you accept.</div>'
                 :'<div class="actions"><a class="btn quiet" href="tel:'+esc(j.phone_visible)+'">Call customer</a></div>')+
          '</div>'+
        '</section>'+

        (working ? workPanel(j) : '')+

        (done && j.rating ?
          '<section class="card"><header><h2>Customer review</h2></header><div class="body">'+
            '<div class="mono" style="font-size:18px">'+ '★'.repeat(j.rating) +'</div>'+
            '<p style="margin:8px 0 0;font-size:14px">'+esc(j.review)+'</p></div></section>' : '')+

        actionBar(j);

      wireJob(j);
    }).catch(fail);
  }

  function workPanel(j){
    return '<section class="card"><header><h2>Document the work</h2></header>'+
      '<div class="body"><div class="label" style="margin-bottom:6px">Before photos</div>'+
        '<div class="locked" style="margin:0 0 4px">Vehicle, the problem area, and the odometer.</div>'+
        photoGrid(j,'before')+'</div>'+
      '<div class="body"><div class="label" style="margin-bottom:6px">What you found</div>'+
        '<textarea id="findings" placeholder="Diagnostic findings, condition of what you removed">'+
        esc(j.findings)+'</textarea></div>'+
      '<div class="body"><div class="label" style="margin-bottom:6px">Work performed and parts</div>'+
        '<textarea id="notes" placeholder="What you did, parts installed, part numbers">'+esc(j.notes)+
        '</textarea></div>'+
      '<div class="body"><div class="label" style="margin-bottom:6px">After photos</div>'+
        '<div class="locked" style="margin:0 0 4px">The completed repair and the parts you replaced.</div>'+
        photoGrid(j,'after')+'</div>'+
      '<div class="body"><div class="note">All three are required to complete: a before photo, '+
      'an after photo, and a note on what you did. That record is what protects you if a customer '+
      'disputes the work later.</div></div>'+
    '</section>';
  }

  function actionBar(j){
    if (j.state === 'OFFERED') {
      return '<div class="sticky"><div class="actions">'+
        '<button class="btn" id="accept">Accept job</button>'+
        '<button class="btn quiet" id="decline">Decline</button></div></div>';
    }
    if (j.state === 'DECLINED') {
      return '<div class="note">Declined. It went to the next mechanic in the area.</div>';
    }
    if (j.next_cta) {
      return '<div class="sticky"><div class="actions">'+
        '<button class="btn go" id="advance">'+esc(j.next_cta)+'</button></div></div>';
    }
    if (j.state === 'COMPLETED') {
      return '<div class="note">Complete. Payout of <b>'+pay(j.split.payout)+
             '</b> is queued — '+esc(api.RATES.payout_cadence)+'</div>';
    }
    return '<div class="note">Paid '+pay(j.split.payout)+'.</div>';
  }

  function wireJob(j){
    on('accept','click',function(){
      var b=$('accept'); b.disabled=true; b.textContent='Accepting…';
      api.accept(j.id).then(function(){ toast('Accepted. Address and phone unlocked.'); job(j.id); })
        .catch(function(e){ fail(e); b.disabled=false; b.textContent='Accept job'; });
    });
    on('decline','click',function(){
      api.decline(j.id).then(function(){ toast('Declined. It goes to the next mechanic.'); go(BASE+'/jobs'); })
        .catch(fail);
    });
    on('advance','click',function(){
      var b=$('advance'); b.disabled=true; b.textContent='Working…';
      saveWorkFields(j.id).then(function(){ return api.advance(j.id); })
        .then(function(r){
          var msg = { EN_ROUTE:'On your way. The customer has been told.',
                      ARRIVED:'Arrival logged.',
                      WORKING:'Work started. Take your before photos.',
                      COMPLETED:'Job complete. Payout queued.' }[r.state];
          toast(msg || 'Updated.');
          job(j.id);
        })
        .catch(function(e){ fail(e); b.disabled=false; b.textContent=j.next_cta; });
    });

    each('[data-add]', function(btn){
      btn.addEventListener('click', function(){ pickPhoto(j.id, btn.dataset.add); });
    });
    each('[data-rm]', function(btn){
      btn.addEventListener('click', function(){
        api.removePhoto(j.id, btn.dataset.rm, Number(btn.dataset.i))
          .then(function(){ job(j.id); }).catch(fail);
      });
    });
    ['findings','notes'].forEach(function(id){
      var el = $(id);
      if (el) el.addEventListener('blur', function(){ saveWorkFields(j.id); });
    });
  }

  function saveWorkFields(id){
    if (!$('notes') && !$('findings')) return Promise.resolve();
    return api.saveWork(id, {
      notes: $('notes') ? $('notes').value : '',
      findings: $('findings') ? $('findings').value : '',
    });
  }

  /** Real file picker with camera capture on mobile. */
  function pickPhoto(id, when){
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment';
    inp.addEventListener('change', function(){
      var f = inp.files && inp.files[0];
      if (!f) return;
      if (f.size > 12 * 1024 * 1024) return toast('That photo is over 12 MB. Try again.', true);
      var fr = new FileReader();
      fr.onload = function(){
        api.addPhoto(id, when, fr.result).then(function(){ toast('Photo added.'); job(id); }).catch(fail);
      };
      fr.onerror = function(){ toast('Could not read that file.', true); };
      fr.readAsDataURL(f);
    });
    inp.click();
  }

  /* ══════════════════════════════════════════════════════════════════
     8. EARNINGS
     ══════════════════════════════════════════════════════════════════ */
  var txFilter = 'ALL';
  function earnings(){
    loading();
    Promise.all([api.me(), api.earnings(txFilter)]).then(function(r){
      var m=r[0], e=r[1];
      if (!m.dispatchable) {
        V.innerHTML = '<section class="card"><header><h2>Earnings</h2></header>'+
          '<div class="body"><div class="empty"><div class="h">No earnings yet</div>'+
          '<p>Your first payout shows up here after your first completed job.</p></div></div>'+
          '<div class="body"><div class="note">'+esc(e.cadence)+'</div></div></section>';
        return;
      }
      V.innerHTML =
        '<section class="card"><header><h2>'+esc(e.month)+'</h2>'+
          '<span class="formno">'+esc(m.id)+'</span></header>'+
          '<div class="body">'+
            '<div class="fig"><div class="n" style="font-size:38px">'+M.exact(e.total)+'</div>'+
            '<div class="l">Earned this month</div></div>'+
            '<div class="figs" style="margin-top:15px">'+
              '<div class="fig"><div class="n">'+e.jobs+'</div><div class="l">Jobs</div></div>'+
              '<div class="fig"><div class="n">'+M.round(e.average)+'</div><div class="l">Average</div></div>'+
              '<div class="fig"><div class="n">'+M.round(e.pending)+'</div><div class="l">Pending</div></div>'+
            '</div></div>'+
          '<div class="body"><div class="note">'+esc(e.cadence)+'<br>'+
            M.exact(e.paid)+' paid · '+M.exact(e.pending)+' pending</div></div></section>'+

        '<section class="card"><header><h2>Payouts</h2></header><div class="body">'+
          '<div class="filters">'+['ALL','PENDING','PAID'].map(function(f){
            return '<button data-f="'+f+'" aria-pressed="'+(txFilter===f)+'">'+f.toLowerCase()+'</button>';
          }).join('')+'</div>'+
          (e.transactions.length ?
          '<table class="tx"><thead><tr><th>Date</th><th>Service</th><th class="amt">Payout</th>'+
          '<th class="st">Status</th></tr></thead><tbody>'+
            e.transactions.map(function(t){
              return '<tr><td class="d">'+esc(t.date)+'</td><td>'+esc(t.service)+
                '<span class="ref">'+esc(t.job)+'</span></td>'+
                '<td class="amt">'+M.exact(t.amount)+'</td>'+
                '<td class="st"><span class="chip'+(t.status==='PAID'?' go':' warn')+'">'+
                esc(t.status)+'</span></td></tr>';
            }).join('')+'</tbody></table>'
          : '<div class="empty"><div class="h">Nothing here</div><p>No payouts match that filter.</p></div>')+
        '</div></section>';
      each('[data-f]', function(b){
        b.addEventListener('click', function(){ txFilter=b.dataset.f; earnings(); });
      });
    }).catch(fail);
  }

  /* ══════════════════════════════════════════════════════════════════
     9. DOCUMENTS
     ══════════════════════════════════════════════════════════════════ */
  function documents(){
    loading();
    Promise.all([api.me(), api.documents()]).then(function(r){
      var m=r[0], docs=r[1];
      V.innerHTML =
        statusBanner(m)+
        '<section class="card"><header><h2>Verification</h2>'+
          '<span class="formno">'+esc(m.id)+'</span></header>'+
          '<div class="body"><div class="why"><b>Why we ask for this.</b> Garagekeepers is the one '+
          'most mechanics do not carry. General liability does not cover the customer\'s vehicle '+
          'while you are working on it — garagekeepers does. If you do not have it yet, we will put '+
          'you in touch with a broker who knows this business. Nothing is required until you take '+
          'your first job.</div></div>'+
          '<div class="body">'+docs.map(docRow).join('')+'</div>'+
        '</section>';
      each('[data-up]', function(b){
        b.addEventListener('click', function(){ pickDoc(b.dataset.up, b.dataset.label); });
      });
    }).catch(fail);
  }

  function docRow(d){
    var cls = { VERIFIED:'go', CLEAR:'go', 'ON FILE':'go', PENDING:'warn', MISSING:'bad' }[d.state] || '';
    var sub = [];
    if (d.expires) sub.push('Expires ' + d.expires);
    if (d.on) sub.push('Confirmed ' + d.on);
    if (d.note) sub.push(d.note);
    if (d.expiring_soon) sub.push('Expires in '+d.days_to_expiry+' days. Send the renewal to stay dispatchable.');
    if (d.state === 'MISSING') sub.push('Needed before your first dispatch.');
    var showUpload = d.state === 'MISSING' || d.state === 'PENDING' || d.expiring_soon;
    return '<div class="doc"><div><div class="nm">'+esc(d.label)+'</div>'+
      (sub.length?'<div class="sub">'+sub.map(esc).join('<br>')+'</div>':'')+'</div>'+
      '<div class="rt"><span class="chip '+cls+(d.expiring_soon&&cls==='go'?' warn':'')+'">'+
      esc(d.state)+'</span>'+
      (showUpload?'<button class="tiny" data-up="'+esc(d.key)+'" data-label="'+esc(d.label)+
       '">Upload</button>':'')+'</div></div>';
  }

  function pickDoc(key, label){
    var inp = document.createElement('input');
    inp.type='file'; inp.accept='image/*,application/pdf';
    inp.addEventListener('change', function(){
      var f = inp.files && inp.files[0];
      if (!f) return;
      toast('Uploading ' + f.name + '…');
      api.uploadDocument(key, f)
        .then(function(r){ toast(label + ' received. ' + r.note); })
        .catch(fail);
    });
    inp.click();
  }

  /* ══════════════════════════════════════════════════════════════════
     10. PROFILE
     ══════════════════════════════════════════════════════════════════ */
  function profile(){
    loading();
    api.me().then(function(m){
      var stats = m.rating === null
        ? '<div class="fig"><div class="n">—</div><div class="l">No jobs yet</div></div>'
        : '<div class="fig"><div class="n">'+m.rating.toFixed(1)+' &#9733;</div><div class="l">Rating</div></div>'+
          '<div class="fig"><div class="n">'+m.completed_jobs+'</div><div class="l">Completed</div></div>'+
          '<div class="fig"><div class="n">'+m.years+'</div><div class="l">Years</div></div>';
      V.innerHTML =
        '<section class="card"><header><h2>'+esc(m.full_name)+'</h2>'+
          '<span class="formno">'+esc(m.id)+'</span></header>'+
          '<div class="body"><div class="label">'+esc(m.title)+'</div>'+
            '<p style="margin:9px 0 0;font-size:14px">'+esc(m.bio)+'</p></div>'+
          '<div class="body"><div class="figs">'+stats+'</div></div>'+
          '<div class="body"><dl class="kv">'+
            '<dt>Area</dt><dd>'+esc(m.cluster_label)+' · '+m.radius_mi+' mi radius</dd>'+
            '<dt>Vehicle</dt><dd>'+esc(m.vehicle)+'</dd>'+
            '<dt>Phone</dt><dd class="mono">'+esc(m.phone)+'</dd>'+
            '<dt>With us</dt><dd>Since '+esc(m.joined)+'</dd></dl>'+
            '<div class="actions"><button class="btn quiet" id="edit">Edit profile</button></div></div>'+
        '</section>'+
        '<section class="card"><header><h2>What you work on</h2></header><div class="body">'+
          tags(m.skills)+'<div class="locked">These decide which jobs reach you.</div></div></section>'+
        '<section class="card"><header><h2>Tools you carry</h2></header><div class="body">'+
          tags(m.equipment)+'</div></section>'+
        '<section class="card"><header><h2>When you work</h2></header><div class="body">'+
          tags(m.availability)+'</div></section>'+
        (m.certifications && m.certifications.length
          ? '<section class="card"><header><h2>Certifications</h2></header><div class="body">'+
            tags(m.certifications)+'</div></section>' : '');
      on('edit','click',function(){ editProfile(m); });
    }).catch(fail);
  }

  function editProfile(m){
    openSheet('Edit profile',
      '<div class="row"><div><label class="f" for="e_bio">About you</label>'+
      '<textarea id="e_bio">'+esc(m.bio)+'</textarea></div></div>'+
      '<div class="row two"><div><label class="f" for="e_vehicle">Work vehicle</label>'+
      '<input id="e_vehicle" type="text" value="'+esc(m.vehicle)+'"></div>'+
      '<div><label class="f" for="e_radius">Travel radius (miles)</label>'+
      '<input id="e_radius" type="number" min="1" max="60" value="'+esc(m.radius_mi)+'"></div></div>'+
      '<div class="actions"><button class="btn" id="e_save">Save changes</button>'+
      '<button class="btn quiet" id="e_cancel">Cancel</button></div>',
      function(){
        on('e_cancel','click',closeSheet);
        on('e_save','click',function(){
          var b=$('e_save'); b.disabled=true; b.textContent='Saving…';
          api.saveProfile({
            bio: $('e_bio').value.trim(),
            vehicle: $('e_vehicle').value.trim(),
            radius_mi: Number($('e_radius').value) || m.radius_mi,
          }).then(function(){ closeSheet(); toast('Profile saved.'); profile(); }).catch(fail);
        });
      });
  }

  /* ══════════════════════════════════════════════════════════════════
     11. REVIEWS
     ══════════════════════════════════════════════════════════════════ */
  function reviews(){
    loading();
    Promise.all([api.me(), api.reviews()]).then(function(r){
      var m=r[0], list=r[1];
      V.innerHTML =
        '<section class="card"><header><h2>Reviews</h2></header>'+
          (m.rating === null
            ? '<div class="body"><div class="empty"><div class="h">No reviews yet</div>'+
              '<p>Customers rate every completed job. Your first review lands here.</p></div></div>'
            : '<div class="body"><div class="figs">'+
              '<div class="fig"><div class="n">'+m.rating.toFixed(1)+' &#9733;</div><div class="l">Average</div></div>'+
              '<div class="fig"><div class="n">'+list.length+'</div><div class="l">Reviews</div></div>'+
              '<div class="fig"><div class="n">'+m.completed_jobs+'</div><div class="l">Jobs</div></div>'+
              '</div></div>'+
              list.map(function(v){
                return '<div class="body"><div class="mono" style="font-size:15px">'+'★'.repeat(v.stars)+
                  '<span style="color:var(--mute)">'+'☆'.repeat(5-v.stars)+'</span></div>'+
                  '<p style="margin:7px 0 6px;font-size:14px">'+esc(v.text)+'</p>'+
                  '<div class="label">'+esc(v.by)+' · '+esc(v.job)+' · '+esc(v.on)+'</div></div>';
              }).join(''))+
        '</section>';
    }).catch(fail);
  }

  /* ══════════════════════════════════════════════════════════════════
     12. SETTINGS
     ══════════════════════════════════════════════════════════════════ */
  function settings(){
    loading();
    api.me().then(function(m){
      var n = m.notify || {};
      function tog(k, t, d){
        return '<div class="tog"><div><div class="t">'+esc(t)+'</div><div class="d">'+esc(d)+'</div></div>'+
          '<button class="sw" data-n="'+k+'" aria-pressed="'+(!!n[k])+'" aria-label="'+esc(t)+'"></button></div>';
      }
      V.innerHTML =
        '<section class="card"><header><h2>Account</h2></header><div class="body"><dl class="kv">'+
          '<dt>Name</dt><dd>'+esc(m.full_name||'—')+'</dd>'+
          '<dt>Phone</dt><dd class="mono">'+esc(m.phone||'—')+'</dd>'+
          '<dt>Email</dt><dd>'+esc(m.email||'—')+'</dd>'+
          '<dt>Status</dt><dd><span class="chip '+(m.dispatchable?'go':'warn')+'">'+
          esc(m.account_state)+'</span></dd></dl></div></section>'+

        (m.dispatchable ?
        '<section class="card"><header><h2>Notifications</h2></header><div class="body">'+
          tog('new_jobs','New job offers','A text and a push when a job matches your area.')+
          tog('reminders','Appointment reminders','45 minutes before your window opens.')+
          tog('messages','Customer messages','When a customer replies about a job.')+
          tog('payouts','Payout notices','When money leaves for your account.')+
        '</div></section>' : '')+

        '<section class="card"><header><h2>Help</h2></header><div class="body">'+
          '<dl class="kv"><dt>Getting jobs</dt><dd>Offers reach you by text. Open the offer, check the '+
          'payout and the drive, accept or decline. No penalty for declining.</dd>'+
          '<dt>Payments</dt><dd>'+esc(api.RATES.payout_cadence)+'</dd>'+
          '<dt>Insurance</dt><dd>General liability, garagekeepers and commercial auto. We can put you '+
          'in touch with a broker.</dd>'+
          '<dt>Problems</dt><dd>Text John. A person answers.</dd></dl></div></section>'+

        '<section class="card"><div class="body"><div class="actions">'+
          '<button class="btn danger" id="out">Sign out</button></div></div></section>';

      each('[data-n]', function(b){
        b.addEventListener('click', function(){
          var next = b.getAttribute('aria-pressed') !== 'true';
          b.setAttribute('aria-pressed', String(next));
          var patch = {}; patch[b.dataset.n] = next;
          api.saveNotifications(patch).catch(fail);
        });
      });
      on('out','click',function(){
        auth.signOut().then(function(){ toast('Signed out.'); go(BASE + '/welcome'); });
      });
    }).catch(fail);
  }

  /* ══════════════════════════════════════════════════════════════════
     bottom sheet
     ══════════════════════════════════════════════════════════════════ */
  function openSheet(title, html, after){
    $('sheet').innerHTML = '<div class="inner"><h3>'+esc(title)+'</h3>'+html+'</div>';
    $('sheet').className = 'sheet on';
    $('scrim').className = 'scrim on';
    if (after) after();
  }
  function closeSheet(){
    $('sheet').className = 'sheet';
    $('scrim').className = 'scrim';
  }
  g.WM_CLOSE_SHEET = closeSheet;

  /* ══════════════════════════════════════════════════════════════════
     ROUTER
     ══════════════════════════════════════════════════════════════════ */
  var PUBLIC = ['welcome','phone','verify'];

  function render(){
    var p = location.pathname.replace(/\/+$/,'');
    var seg = p.slice(BASE.length).replace(/^\//,'') || 'dashboard';
    var first = seg.split('/')[0];
    closeSheet();

    // gate: not signed in -> welcome
    if (!auth.isSignedIn() && PUBLIC.indexOf(first) < 0) {
      history.replaceState({}, '', BASE + '/welcome');
      first = 'welcome'; seg = 'welcome';
    }
    // gate: signed in but on an auth screen -> dashboard
    if (auth.isSignedIn() && PUBLIC.indexOf(first) >= 0 && first !== 'welcome') {
      history.replaceState({}, '', BASE + '/dashboard');
      first = 'dashboard'; seg = 'dashboard';
    }

    paintChrome(first);

    if (first === 'welcome') return welcome();
    if (first === 'phone')   return phone();
    if (first === 'verify')  return verify();

    // gate: account state decides what a signed-in user can reach
    api.me().then(function(m){
      var st = m.account_state;
      if (st === 'NEW' && first !== 'register') {
        history.replaceState({}, '', BASE + '/register');
        paintChrome('register'); return register();
      }
      if (st === 'PENDING' && first !== 'pending') {
        history.replaceState({}, '', BASE + '/pending');
        paintChrome('pending'); return pending();
      }
      if (st !== 'NEW' && first === 'register') { go(BASE + '/dashboard'); return; }
      if (st !== 'PENDING' && first === 'pending') { go(BASE + '/dashboard'); return; }

      var m2 = seg.match(/^job\/([\w-]+)$/);
      if (m2) return job(m2[1]);
      switch (first) {
        case 'jobs':      return jobs();
        case 'earnings':  return earnings();
        case 'documents': return documents();
        case 'profile':   return profile();
        case 'reviews':   return reviews();
        case 'settings':  return settings();
        case 'register':  return register();
        case 'pending':   return pending();
        default:          return dashboard();
      }
    }).catch(fail);

    window.scrollTo(0,0);
  }
  g.WM_RENDER = render;

  function paintChrome(first){
    var authed = auth.isSignedIn();
    var chrome = PUBLIC.indexOf(first) < 0 && authed;
    $('topbar').style.display = chrome ? '' : 'none';
    NAV.style.display = chrome ? '' : 'none';
    document.body.className = chrome ? 'pad' : '';
    if (!chrome) return;

    api.me().then(function(m){
      $('whoami').innerHTML = esc(m.full_name || 'New mechanic') + '<br>' +
        esc(m.id || '—') + ' · ' + esc(m.account_state);
      var full = m.account_state === 'ACTIVE' || m.account_state === 'REGISTERED';
      NAV.style.display = full ? '' : 'none';
      if (!full) document.body.className = '';
    });

    Array.prototype.forEach.call(NAV.querySelectorAll('a'), function(a){
      var href = a.getAttribute('href');
      var target = href.slice(BASE.length).replace(/^\//,'');
      var isOn = target === first || (first === 'job' && target === 'jobs');
      if (isOn) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
  }

  /* ══════════════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════════════ */
  function boot(){
    V = $('view'); NAV = $('nav');

    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href^="'+BASE+'"]');
      if (a) { e.preventDefault(); go(a.getAttribute('href')); }
    });
    window.addEventListener('popstate', render);
    $('scrim').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeSheet(); });

    // prototype account switcher
    Array.prototype.forEach.call(document.querySelectorAll('[data-acct]'), function(b){
      b.addEventListener('click', function(){
        auth.useAccount(b.dataset.acct).then(function(){
          Array.prototype.forEach.call(document.querySelectorAll('[data-acct]'), function(x){
            x.setAttribute('aria-pressed', String(x === b));
          });
          go(BASE + '/dashboard');
        });
      });
    });
    on('signout','click',function(){
      auth.signOut().then(function(){ go(BASE + '/welcome'); });
    });

    var s = auth.current();
    if (s && s.account) {
      var b = document.querySelector('[data-acct="'+s.account+'"]');
      if (b) b.setAttribute('aria-pressed','true');
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
