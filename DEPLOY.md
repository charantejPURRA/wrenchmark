# Deploying Wrenchmark to Render

Fifteen minutes. After this the link works whether or not your Mac is on.

---

## Before you start

Two free accounts, if you don't have them:

- **github.com** — where the code lives
- **render.com** — sign in with GitHub, it makes step 3 one click

---

## 1 — Make sure secrets aren't in the repo

In `prototype-1`:

```bash
cat .gitignore
```

You should see `.env` in the list. If not, stop and tell me — your password
would end up on GitHub.

```bash
git rm --cached .env 2>/dev/null; git add -A && git commit -m "v9 — deploy ready"
```

The `git rm --cached` is harmless if `.env` was never committed. It removes it
from git if it was.

---

## 2 — Push to GitHub

Create an **empty private repo** at github.com/new. Name it `wrenchmark`. Don't
add a README or .gitignore — the repo must be empty.

Then, with the URL GitHub shows you:

```bash
git remote add origin https://github.com/YOUR-USERNAME/wrenchmark.git
git branch -M main
git push -u origin main
```

If it asks for a password, GitHub wants a **personal access token**, not your
account password: github.com → Settings → Developer settings → Personal access
tokens → Tokens (classic) → Generate new token → tick `repo` → copy it and
paste it as the password.

---

## 3 — Deploy

1. render.com → **New +** → **Blueprint**
2. Connect your GitHub, pick the `wrenchmark` repo
3. Render reads `render.yaml` and shows one service, `wrenchmark`
4. It asks for the values marked `sync: false`:

| Key | Value |
|---|---|
| `ADMIN_PASSWORD` | Something real. This guards every customer's name and phone number. |
| `BASE_URL` | Leave blank for now — you don't know the URL yet |
| `ANTHROPIC_API_KEY` | Skip unless you have one |

5. **Apply.** First build takes 3–5 minutes.

---

## 4 — Set BASE_URL, then redeploy

Render gives you a URL like `https://wrenchmark-a1b2.onrender.com`.

Dashboard → your service → **Environment** → edit `BASE_URL` → paste that URL →
**Save**. It redeploys automatically.

**Don't skip this.** `BASE_URL` is what mechanic links and customer job links
are built from. Wrong, and every text message points at `localhost`.

---

## 5 — Check it

- `https://your-url.onrender.com` — booking flow loads
- `/health` — returns `{"ok":true,...}`
- `/admin` — asks for the password
- **Operations → Mechanics** — the personal links now show your Render domain

Book one job end to end. Then send John the base URL.

---

## What this costs

| | |
|---|---|
| Web service, starter plan | $7/month |
| 1 GB disk | ~$0.25/month |
| **Total** | **~$7.25/month** |

The free plan is $0 but sleeps after 15 minutes idle — a ~50 second wait on the
next visit — and **cannot mount a disk**, so the database and every uploaded
photo reset on each deploy. Fine for a five-minute demo. Not for a link you give
to a mechanic.

---

## After it's live

**Deploys are automatic.** `git push` and it's live in a few minutes.

**A custom domain** takes five minutes: Settings → Custom Domain, add the CNAME
Render gives you at your registrar. Then update `BASE_URL` to match. Worth doing
before John shows anyone — `wrenchmark.onrender.com` reads as a prototype.

**Logs** are under the Logs tab. Every crash, every dispatch, every payment
event lands there.

**Backups.** The disk survives deploys, but back up the database anyway:

```bash
# Render dashboard → Shell
cp /var/data/wrenchmark.db /var/data/backup-$(date +%F).db
```

Weekly is plenty at pilot volume.

---

## Two things that will bite you eventually

**SQLite is single-writer.** Perfectly fine for a pilot in one metro. When two
mechanics submit at the same moment under real load, move to Render's managed
Postgres. Not urgent, but don't be surprised.

**Sessions live in memory.** A deploy signs everyone out and drops any triage
conversation in progress. Harmless at this stage, worth fixing before volume.
