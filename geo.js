/* Geographic layer.
   Swap `driveMinutes` for the Google Distance Matrix API when a key exists —
   everything else in the matching engine reads through this one function. */

const LOCALITIES = [
  { code: 'minneapolis_dt', label: 'Minneapolis — Downtown', lat: 44.9778, lng: -93.2650 },
  { code: 'minneapolis_ne', label: 'Minneapolis — Northeast', lat: 45.0055, lng: -93.2470 },
  { code: 'minneapolis_s', label: 'Minneapolis — South', lat: 44.9330, lng: -93.2620 },
  { code: 'st_louis_park', label: 'St. Louis Park', lat: 44.9597, lng: -93.3702 },
  { code: 'edina', label: 'Edina', lat: 44.8897, lng: -93.3499 },
  { code: 'richfield', label: 'Richfield', lat: 44.8833, lng: -93.2830 },
  { code: 'bloomington', label: 'Bloomington', lat: 44.8408, lng: -93.2983 },
  { code: 'minnetonka', label: 'Minnetonka', lat: 44.9212, lng: -93.4687 },
  { code: 'plymouth', label: 'Plymouth', lat: 45.0105, lng: -93.4555 },
  { code: 'maple_grove', label: 'Maple Grove', lat: 45.0725, lng: -93.4557 },
  { code: 'brooklyn_park', label: 'Brooklyn Park', lat: 45.0941, lng: -93.3563 },
  { code: 'roseville', label: 'Roseville', lat: 45.0061, lng: -93.1566 },
  { code: 'st_paul_dt', label: 'St. Paul — Downtown', lat: 44.9537, lng: -93.0900 },
  { code: 'st_paul_e', label: 'St. Paul — East Side', lat: 44.9670, lng: -93.0430 },
  { code: 'woodbury', label: 'Woodbury', lat: 44.9239, lng: -92.9594 },
  { code: 'eagan', label: 'Eagan', lat: 44.8041, lng: -93.1669 },
  { code: 'burnsville', label: 'Burnsville', lat: 44.7678, lng: -93.2777 },
  { code: 'apple_valley', label: 'Apple Valley', lat: 44.7319, lng: -93.2177 },
];

const byCode = Object.fromEntries(LOCALITIES.map((l) => [l.code, l]));

/* great-circle distance, km */
function haversineKm(a, b) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* Drive time estimate. Twin Cities grid + freeway network runs about a 1.28
   circuity factor against straight-line, at roughly 42 km/h effective door to door.
   Replace this whole function with a Distance Matrix call; signature stays the same. */
function driveMinutes(a, b) {
  const km = haversineKm(a, b) * 1.28;
  const mins = (km / 42) * 60;
  return Math.max(6, Math.round(mins + 4)); // +4 for parking, walking, setup
}

/* Winter penalty — a real dispatch variable in Minnesota, and the season
   that generates most of the no-start volume. */
function seasonalFactor(date = new Date()) {
  const m = date.getMonth(); // 0-indexed
  return (m === 11 || m === 0 || m === 1) ? 1.25 : (m === 10 || m === 2) ? 1.12 : 1.0;
}

/* ---- SVG projection for the dispatch map ---- */
const BOUNDS = { minLat: 44.70, maxLat: 45.12, minLng: -93.52, maxLng: -92.92 };

function project(pt, w, h, pad = 26) {
  const x = pad + ((pt.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * (w - pad * 2);
  const y = pad + ((BOUNDS.maxLat - pt.lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * (h - pad * 2);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

/* Which localities we can actually serve. A booking form that offers an area
   nobody covers takes the customer's details, holds their card, and only then
   tells them no — worse than never offering it. */
function servedLocalities(db) {
  const rows = db.prepare(`SELECT service_zones FROM contractors
    WHERE status='active' AND coi_on_file=1 AND training_completed_at IS NOT NULL`).all();
  const covered = new Set();
  for (const r of rows) {
    try { for (const z of JSON.parse(r.service_zones || '[]')) covered.add(z); } catch (e) {}
  }
  return LOCALITIES.map((l) => Object.assign({}, l, { served: covered.has(l.code) }));
}

module.exports = { LOCALITIES, servedLocalities, byCode, haversineKm, driveMinutes, seasonalFactor, project, BOUNDS };
