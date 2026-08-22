/* Triage engine.

   The job is not to diagnose. It is to do what a good service advisor does in
   the first ninety seconds: check the person is safe, ask the two or three
   questions that actually narrow things, and then say plainly what we think —
   including "not enough to call it", which is a real and common answer.

   Two rules the engine will not break:

     1. Never claim more certainty than the evidence supports. A confident
        number invented from noise is exactly the behaviour this brand exists
        to oppose.
     2. Never publish a price range for a fault that genuinely cannot be
        ranged. A guess wearing a dollar sign is still a guess.

   Every question is multi-select. Real faults arrive in clusters, and forcing
   one choice makes people discard the evidence that would have identified it.
   Every question also carries an explicit "not sure" — nobody should be pushed
   into confidence they don't have. */

const SIGNALS = {
  no_start: ["wont start", "won't start", 'not starting', 'no start', 'dead', 'turn over', 'turning over', 'cranks', 'cranking', "wont turn", 'no power'],
  starter: ['click', 'clicking', 'clicks once', 'single click', 'no crank'],
  battery: ['battery', 'jump', 'jumped', 'jump start', 'lights dim', 'dim lights', 'died overnight'],
  alternator: ['battery light', 'charging', 'alternator', 'dimming', 'dies while driving', 'electrical'],
  brakes: ['brake', 'brakes', 'braking', 'grinding', 'grind', 'squeal', 'squeak', 'squeaking', 'pedal', 'soft pedal', 'spongy'],
  overheating: ['overheat', 'overheating', 'temperature', 'temp gauge', 'steam', 'coolant', 'antifreeze', 'radiator'],
  check_engine: ['check engine', 'engine light', 'warning light', 'dashboard light'],
  suspension: ['clunk', 'clunking', 'knock', 'bump', 'bumpy', 'bounce', 'bouncing', 'rough ride', 'suspension', 'strut', 'shock'],
  oil_change: ['oil change', 'oil', 'service due', 'maintenance', 'due for service'],
};

/* Phrases that mean "I have no idea", which is an honest answer deserving a
   real path rather than a fabricated diagnosis. */
const UNSURE_TEXT = ['dont know', "don't know", 'no idea', 'not sure', 'unsure', 'cant tell', "can't tell", 'no clue', 'idk', 'nothing specific', 'hard to say'];

const SAFETY_FLAGS = [
  { match: ['no brakes', 'brakes failed', 'pedal to the floor', 'pedal goes to floor', 'soft pedal', 'spongy', 'pedal feels soft', 'pedal is soft', 'pedal sinking', 'brake feels soft'],
    level: 'stop', text: "A brake pedal that sinks or feels spongy can mean the system is losing pressure. Please don't drive it — we come to the car." },
  { match: ['steam', 'smoke', 'burning smell', 'burning', 'overheat', 'overheating'],
    level: 'stop', text: 'Steam, smoke, or a burning smell means stop and let it cool. Driving on can turn a repair into a new engine.' },
  { match: ['steering', "won't steer", 'wont steer', 'wheel shaking', 'hard to steer'],
    level: 'stop', text: "Anything affecting steering isn't safe to drive on. Leave it where it is and we'll come to you." },
  { match: ['dies while driving', 'shut off while driving', 'stalled', 'stalling', 'cut out'],
    level: 'caution', text: 'A car that shuts off while moving can lose power steering and brake assist. Avoid highways until this is sorted.' },
  { match: ['grinding', 'metal on metal', 'scraping'],
    level: 'caution', text: "Grinding when braking usually means the pads are gone and it's cutting into the rotor. Short trips only." },
];

/* Some faults can honestly be priced as a range before anyone sees the car.
   Some cannot: a stored engine code is a $30 petrol cap or a $2,400 catalytic
   converter, and a number spanning that tells the customer nothing. */
const RANGEABLE = {
  battery: true, starter: true, alternator: true, brakes: true,
  oil_change: true, suspension: true,
  check_engine: false, no_start: false, overheating: false, other: false,
};

const NO_RANGE_REASON = {
  check_engine: 'A stored code can point at a $30 petrol cap or a $2,000 converter. Anyone quoting a range before reading it is guessing.',
  no_start: "Fuel, spark, sensors, immobiliser — it's a wide field until someone tests it.",
  overheating: 'Could be a hose clamp, could be a water pump. The gap is wide enough that a range would mislead you.',
  other: "We don't know enough yet to put a number on the repair, and we'd rather say so than invent one.",
};

const NOT_SURE = { label: "I'm not sure", weights: {}, neutral: true };

/* The opening board. Shown whenever free text doesn't narrow anything — which
   includes "I don't know", the most honest thing a worried person can type. */
const BOARD = {
  id: 'board',
  multi: true,
  prompt: "No problem — most people can't name it, and you shouldn't have to. Tap anything that sounds familiar. As many as you like.",
  options: [
    { label: "It won't start at all", weights: { no_start: 3, battery: 3, starter: 3 } },
    { label: 'It starts, but something sounds wrong', weights: { brakes: 2, suspension: 2 } },
    { label: 'A warning light is on', weights: { check_engine: 5 } },
    { label: 'Noise when I brake', weights: { brakes: 6 } },
    { label: 'It runs hot, or there is steam', weights: { overheating: 6 }, safety: 'stop' },
    { label: 'Something is leaking underneath', weights: { overheating: 3, oil_change: 2 } },
    { label: 'It drives rough or bumpy', weights: { suspension: 5 } },
    { label: 'It cut out while I was driving', weights: { alternator: 5, check_engine: 2 }, safety: 'caution' },
    { label: "It's just due for a service", weights: { oil_change: 6 } },
    { label: "None of these — I really can't tell", weights: {}, neutral: true },
  ],
};

const QUESTIONS = {
  crank_behavior: {
    multi: true,
    prompt: 'When you turn the key, what happens? Tap anything that fits.',
    options: [
      { label: 'Nothing at all — silent', weights: { battery: 4, starter: 2 } },
      { label: 'One click, then nothing', weights: { starter: 6, battery: 1 } },
      { label: 'Rapid clicking', weights: { battery: 6 } },
      { label: 'It turns over but never catches', weights: { no_start: 6, check_engine: 2 } },
    ],
  },
  dash_lights: {
    multi: true,
    prompt: 'What are the dashboard lights doing?',
    options: [
      { label: 'Bright and normal', weights: { starter: 4 } },
      { label: 'Dim or flickering', weights: { battery: 5, alternator: 2 } },
      { label: 'Nothing lights up at all', weights: { battery: 6 } },
    ],
  },
  recent_jump: {
    multi: true,
    prompt: 'Has it needed a jump start recently?',
    options: [
      { label: 'Yes, and it went flat again', weights: { alternator: 6, battery: 2 } },
      { label: 'Yes, and it was fine afterwards', weights: { battery: 5 } },
      { label: 'No', weights: { starter: 2 } },
    ],
  },
  cold_weather: {
    multi: true,
    prompt: 'Is it worse in the cold, or first thing in the morning?',
    options: [
      { label: 'Much worse when cold', weights: { battery: 4 } },
      { label: 'Same regardless', weights: {} },
    ],
  },
  noise_type: {
    multi: true,
    prompt: 'What does the noise sound like? Tap anything that fits.',
    options: [
      { label: 'High squeal', weights: { brakes: 5 } },
      { label: 'Grinding, metal on metal', weights: { brakes: 6 }, safety: 'caution' },
      { label: 'Clunk over bumps', weights: { suspension: 6 } },
      { label: 'A rumble that changes with speed', weights: { suspension: 3, brakes: 2 } },
    ],
  },
  brake_pedal: {
    multi: true,
    prompt: 'How does the brake pedal feel? Tap anything that fits.',
    options: [
      { label: 'Normal', weights: { brakes: 1 } },
      { label: 'Soft, or sinking towards the floor', weights: { brakes: 6 }, safety: 'stop' },
      { label: 'Pulsing under my foot', weights: { brakes: 5 } },
      { label: 'Harder to push than usual', weights: { brakes: 4 } },
    ],
  },
  brake_when: {
    multi: true,
    prompt: 'When do you notice it?',
    options: [
      { label: 'Every time I brake', weights: { brakes: 5 } },
      { label: 'Only when braking hard', weights: { brakes: 4 } },
      { label: 'Only at low speed', weights: { brakes: 3 } },
      { label: 'All the time, braking or not', weights: { suspension: 5 } },
    ],
  },
  light_behavior: {
    multi: true,
    prompt: 'Which lights are on, and how?',
    options: [
      { label: 'Check engine, steady', weights: { check_engine: 5 } },
      { label: 'Check engine, flashing', weights: { check_engine: 6 }, safety: 'stop' },
      { label: 'Battery light', weights: { alternator: 6 } },
      { label: 'Temperature warning', weights: { overheating: 6 }, safety: 'stop' },
    ],
  },
  driving_change: {
    multi: true,
    prompt: 'Has the way it drives changed? Tap anything that fits.',
    options: [
      { label: 'Drives normally', weights: {} },
      { label: 'Rough or shaking', weights: { check_engine: 4, suspension: 2 } },
      { label: 'Down on power', weights: { check_engine: 4 } },
      { label: 'Stalling or cutting out', weights: { check_engine: 4, alternator: 3 }, safety: 'caution' },
    ],
  },
  temp_gauge: {
    multi: true,
    prompt: 'What is the temperature gauge doing?',
    options: [
      { label: 'Into the red', weights: { overheating: 6 }, safety: 'stop' },
      { label: 'Higher than usual', weights: { overheating: 5 } },
      { label: 'Normal', weights: {} },
    ],
  },
  coolant_visible: {
    multi: true,
    prompt: 'Any puddle under the car, or steam from the bonnet?',
    options: [
      { label: 'Steam from under the bonnet', weights: { overheating: 6 }, safety: 'stop' },
      { label: 'A coloured puddle underneath', weights: { overheating: 5 } },
      { label: 'Neither', weights: {} },
    ],
  },
  how_long: {
    multi: false,
    prompt: 'How long has this been going on?',
    options: [
      { label: 'Started today', weights: {} },
      { label: 'A few days', weights: {} },
      { label: 'Weeks or longer', weights: {} },
    ],
  },
};

/* Nobody gets forced into confidence they don't have. */
for (const q of Object.values(QUESTIONS)) {
  if (!q.options.some((o) => o.neutral)) q.options.push({ ...NOT_SURE });
}

const QUESTION_PLAN = {
  no_start: ['crank_behavior', 'dash_lights', 'recent_jump'],
  starter: ['crank_behavior', 'dash_lights', 'recent_jump'],
  battery: ['crank_behavior', 'dash_lights', 'cold_weather'],
  alternator: ['recent_jump', 'dash_lights', 'driving_change'],
  brakes: ['noise_type', 'brake_pedal', 'brake_when'],
  suspension: ['noise_type', 'brake_when', 'how_long'],
  check_engine: ['light_behavior', 'driving_change', 'how_long'],
  overheating: ['temp_gauge', 'coolant_visible', 'how_long'],
  oil_change: ['how_long'],
  other: ['driving_change', 'how_long'],
};

const LABELS = {
  no_start: 'Engine turns over but will not start',
  starter: 'Starter motor',
  battery: 'Battery or charging connection',
  alternator: 'Alternator / charging system',
  brakes: 'Brake pads and rotors',
  overheating: 'Cooling system',
  check_engine: 'Engine management fault',
  suspension: 'Suspension component',
  oil_change: 'Oil and filter service',
  other: 'Needs a scan and a look',
};

const EXPLAIN = {
  no_start: 'It is turning over, so the battery and starter are doing their job. That points at fuel, spark, or a sensor.',
  starter: 'A single click with healthy dash lights is the classic signature of a starter that has failed.',
  battery: 'Rapid clicking or dim lights almost always means the battery cannot deliver enough current.',
  alternator: 'Needing a jump more than once usually means the alternator is not recharging as you drive.',
  brakes: 'Noise plus a change in pedal feel is the normal wear pattern for pads reaching the end of their life.',
  overheating: 'Heat problems come from coolant loss, a stuck thermostat, or a failed water pump. All three are findable on site.',
  check_engine: 'The light means a stored fault code. Reading it takes minutes — what it points to is what matters.',
  suspension: 'Noise over bumps with nothing to do with braking is almost always a worn suspension component.',
  oil_change: 'Straightforward scheduled service.',
  other: 'Needs a scan tool and someone looking at it.',
};

/* ---------- text → candidate scores ---------- */

function normalise(text) {
  return ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ') + ' ';
}

function looksUnsure(text) {
  const t = normalise(text);
  const words = t.trim().split(' ').filter(Boolean);
  if (words.length <= 2) return true;
  return UNSURE_TEXT.some((p) => t.includes(p));
}

function detect(text) {
  const t = normalise(text);
  const scores = {};
  for (const [code, words] of Object.entries(SIGNALS)) {
    for (const w of words) {
      if (t.includes(' ' + w) || t.includes(w + ' ')) scores[code] = (scores[code] || 0) + 4;
    }
  }
  return scores;
}

function safetyFrom(text) {
  const t = String(text || '').toLowerCase();
  const hits = SAFETY_FLAGS.filter((f) => f.match.some((m) => t.includes(m)));
  if (!hits.length) return null;
  return hits.find((h) => h.level === 'stop') || hits[0];
}

function topCode(scores) {
  const e = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return e.length ? e[0][0] : 'other';
}

function planFor(scores) {
  return (QUESTION_PLAN[topCode(scores)] || QUESTION_PLAN.other)
    .filter((id) => QUESTIONS[id]).slice(0, 3);
}

/* ---------- answers (multi-select) ---------- */

function applyAnswer(scores, question, optionIndexes) {
  const q = question && question.options ? question : QUESTIONS[question];
  if (!q) return { scores, safety: null, answerLabel: '' };
  const list = Array.isArray(optionIndexes) ? optionIndexes : [optionIndexes];
  const next = { ...scores };
  const labels = [];
  let safety = null;
  let informative = 0;

  for (const i of list) {
    const opt = q.options[i];
    if (!opt) continue;
    labels.push(opt.label);
    if (opt.safety === 'stop') safety = 'stop';
    else if (opt.safety && safety !== 'stop') safety = opt.safety;
    if (opt.neutral) continue;
    const w = Object.entries(opt.weights || {});
    if (w.length) informative += 1;
    for (const [code, delta] of w) next[code] = (next[code] || 0) + delta;
  }
  return { scores: next, safety, answerLabel: labels.join(' · ') || "I'm not sure", informative };
}

/* ---------- assessment ---------- */

const SIGNAL_FLOOR = 6;   // below this we do not name a fault
const BANDS = ['Most likely', 'Possible', 'Worth ruling out'];

function assess(scores, informativeAnswers = 0) {
  const ranked = Object.entries(scores)
    .filter(([code, v]) => v > 0 && code !== 'other')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const top = ranked.length ? ranked[0][1] : 0;
  const confident = ranked.length > 0 && top >= SIGNAL_FLOOR && informativeAnswers >= 1;

  if (!confident) {
    return {
      certain: false,
      lead_code: 'other',
      rangeable: false,
      no_range_reason: NO_RANGE_REASON.other,
      message: "Honestly, that isn't enough for me to name it — and I'd rather say so than invent a number. That's not a problem: identifying it is exactly what the visit is for, and the price for that is fixed no matter what we find.",
      findings: ranked.slice(0, 2).map(([code]) => ({
        code, label: LABELS[code] || code, explain: EXPLAIN[code] || '',
        band: 'Worth ruling out', confidence: null, lead: false,
      })),
    };
  }

  const total = ranked.reduce((s, [, v]) => s + v, 0) || 1;
  const findings = ranked.map(([code, v], i) => ({
    code,
    label: LABELS[code] || code,
    explain: EXPLAIN[code] || '',
    confidence: Math.round((v / total) * 100),
    band: BANDS[i] || 'Worth ruling out',
    lead: i === 0,
  }));

  const lead = findings[0].code;
  return {
    certain: true,
    lead_code: lead,
    rangeable: !!RANGEABLE[lead],
    no_range_reason: RANGEABLE[lead] ? null : (NO_RANGE_REASON[lead] || NO_RANGE_REASON.other),
    message: null,
    findings,
  };
}

/* ---------- optional Claude backend ----------
   Extraction and restatement only. The question bank and the scoring stay
   here, so the model cannot invent a diagnosis, and any failure falls
   silently back to keywords. */

async function detectWithClaude(text) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const codes = Object.keys(SIGNALS).join(', ');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: `You classify car symptom descriptions. Valid codes: ${codes}. Respond ONLY with JSON: {"scores":{"code":number},"restate":"one warm sentence restating what they described in their own terms","unsure":boolean}. Scores 0-10. Set unsure true if the person has not actually described a symptom. Never diagnose beyond the code list. No preamble, no markdown.`,
        messages: [{ role: 'user', content: String(text).slice(0, 1200) }],
      }),
    });
    const data = await r.json();
    const raw = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    const clean = {};
    for (const [k, v] of Object.entries(parsed.scores || {})) {
      if (SIGNALS[k] && Number(v) > 0) clean[k] = Number(v);
    }
    return { scores: clean, restate: String(parsed.restate || '').slice(0, 220), unsure: !!parsed.unsure };
  } catch {
    return null;
  }
}

module.exports = {
  detect, detectWithClaude, safetyFrom, planFor, applyAnswer, assess,
  looksUnsure, topCode,
  QUESTIONS, BOARD, LABELS, EXPLAIN, RANGEABLE, NO_RANGE_REASON, SIGNAL_FLOOR,
};
