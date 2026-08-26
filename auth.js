/* Authentication.

   Three audiences, three levels of access, no user accounts:

     - Operations  → password, set by ADMIN_PASSWORD
     - Mechanics   → a personal link containing their own token. A mechanic
                     sees their own board and nothing else.
     - Customers   → the unguessable job token already in the URL

   No dependencies. Cookies are HMAC-signed with SESSION_SECRET so they can't
   be forged, and nothing sensitive is stored inside them. */

const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET ||
  crypto.randomBytes(32).toString('hex'); // regenerates on restart if unset
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const MAX_AGE = 60 * 60 * 12; // 12 hours

function sign(value) {
  const mac = crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
  return value + '.' + mac;
}

function verify(signed) {
  if (!signed || typeof signed !== 'string') return null;
  const i = signed.lastIndexOf('.');
  if (i < 1) return null;
  const value = signed.slice(0, i);
  const mac = signed.slice(i + 1);
  const expect = crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
  // timing-safe compare; lengths must match first or timingSafeEqual throws
  if (mac.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  const [payload, ts] = value.split('|');
  if (!ts || Date.now() / 1000 - Number(ts) > MAX_AGE) return null;
  return payload;
}

function issue(payload) {
  return sign(payload + '|' + Math.floor(Date.now() / 1000));
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setCookie(res, name, value) {
  const secure = process.env.NODE_ENV === 'production' ? ' Secure;' : '';
  res.setHeader('Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax;${secure} Max-Age=${MAX_AGE}`);
}

function clearCookie(res, name) {
  res.setHeader('Set-Cookie', `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/* Timing-safe password check that doesn't leak length. */
function passwordOk(given) {
  if (!ADMIN_PASSWORD) return false;
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

function isAdmin(req) {
  return verify(parseCookies(req).wm_admin) === 'admin';
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  const back = encodeURIComponent(req.originalUrl || '/admin');
  res.redirect('/login?next=' + back);
}

/* A mechanic reaches their board through a personal link carrying their token.
   The token is exchanged for a cookie on first visit so the link can be short
   and the token doesn't sit in the address bar afterwards. */
function makeTechGuard(db) {
  return function requireTech(req, res, next) {
    if (isAdmin(req)) return next();

    const key = req.query.k;
    if (key) {
      const c = db.prepare(`SELECT id FROM contractors WHERE access_token=?`).get(key);
      if (c) {
        setCookie(res, 'wm_tech', issue('tech:' + c.id));
        // inside app.use('/tech', ...) req.path has the mount prefix stripped,
        // so rebuild the real path and drop the token from the address bar
        const clean = (req.originalUrl || '/tech').split('?')[0];
        return res.redirect(clean);
      }
    }
    const payload = verify(parseCookies(req).wm_tech);
    if (payload && payload.startsWith('tech:')) {
      req.contractorId = Number(payload.slice(5));
      return next();
    }
    res.status(403).send(deniedPage());
  };
}

function deniedPage() {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Wrenchmark</title><link rel="stylesheet" href="/style.css"></head><body>
<div class="shell"><div class="narrow" style="padding-top:80px;text-align:center">
  <h1 style="font-size:28px;font-weight:670;letter-spacing:-.03em;margin:0 0 10px">This link isn't yours</h1>
  <p style="color:var(--g500);font-size:16px;margin:0 0 24px">Mechanics reach their jobs through the personal link we text them. If you've lost yours, call the office and we'll send it again.</p>
  <a class="btn" href="/">Back to the start</a>
</div></div></body></html>`;
}

function loginPage(next, error) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in · Wrenchmark</title><link rel="stylesheet" href="/style.css"></head><body>
<div class="shell"><div style="max-width:400px;margin:0 auto;padding-top:90px">
  <div style="text-align:center;margin-bottom:26px">
    <div style="font-size:19px;font-weight:640;letter-spacing:-.03em">Wrenchmark<span style="color:var(--g400)">.</span></div>
    <div style="font-size:14px;color:var(--g500);margin-top:5px">Operations</div>
  </div>
  <form method="post" action="/login" class="panel"><div class="panel-b">
    <input type="hidden" name="next" value="${String(next || '/admin').replace(/"/g, '&quot;')}">
    <div class="f"><label>Password</label>
      <input type="password" name="password" autofocus autocomplete="current-password"></div>
    ${error ? `<div class="notice stop" style="margin-top:0;margin-bottom:16px"><div><b>Not recognised</b>Check the password and try again.</div></div>` : ''}
    <button type="submit" class="btn btn-wide">Sign in</button>
  </div></form>
</div></div></body></html>`;
}

module.exports = {
  issue, verify, setCookie, clearCookie, parseCookies,
  passwordOk, isAdmin, requireAdmin, makeTechGuard, loginPage, deniedPage,
  hasPassword: () => !!ADMIN_PASSWORD,
};
