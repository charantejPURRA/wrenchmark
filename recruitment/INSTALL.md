# Installing the recruitment module into your existing Wrenchmark app

Your app lives at `~/Downloads/wrenchmark` and already has `server.js`, `db.js`,
`auth.js`, `geo.js`, `match.js`, `views.js`, `triage.js`, `vehicles.js`.

The recruitment module has its own `db.js`, so it goes in a **subfolder**. Nothing
in your existing app gets overwritten.

## 1. Make the folder

```bash
cd ~/Downloads/wrenchmark
mkdir -p recruitment/public/demo
```

## 2. Put the files where they go

Download all 10 recruitment files and place them like this:

```
~/Downloads/wrenchmark/
  server.js            ← your existing file, one line added in step 3
  db.js                ← your existing file, untouched
  auth.js  geo.js  match.js  views.js  triage.js  vehicles.js  seed.js
  public/style.css
  recruitment/         ← everything below is new
    db.js
    routes.js
    schema.sql
    README.md
    public/
      apply.html
      pipeline.html
      demo/
        shell.html
        demo-data.js
        services.js
        demo.css
```

The four demo files must be in `recruitment/public/demo/` — `routes.js` looks
for them there by path. Flat won't work.

You do **not** need `server.js` or `package.json` from the recruitment download.
Your app already has both.

If the six files are still sitting in `~/wrenchmark-portal`, move them:

```bash
cd ~/Downloads/wrenchmark
mv ~/wrenchmark-portal/routes.js recruitment/
mv ~/wrenchmark-portal/shell.html ~/wrenchmark-portal/demo-data.js \
   ~/wrenchmark-portal/services.js ~/wrenchmark-portal/demo.css \
   recruitment/public/demo/
```

Then download `db.js`, `schema.sql`, `apply.html`, `pipeline.html` and put them
in `recruitment/` and `recruitment/public/` respectively.

## 3. Mount it

Open `~/Downloads/wrenchmark/server.js`. Find where your other routes are
registered (look for existing `app.use(` or `app.get(` lines) and add **one line**
before any catch-all or 404 handler:

```js
app.use('/recruit', require('./recruitment/routes')({
  adminKey: process.env.WM_ADMIN_KEY || 'change-me'
}));
```

Order matters — if it lands after a catch-all, every `/recruit` URL 404s.

## 4. Dependency check

```bash
cd ~/Downloads/wrenchmark
node -e "require('better-sqlite3'); console.log('ok')"
```

If that errors, install it: `npm install better-sqlite3`. Express you already have.

## 5. Run

```bash
cd ~/Downloads/wrenchmark
WM_ADMIN_KEY=pick-something node server.js
```

Three URLs, on whatever port your app already uses:

| URL | What it is |
|---|---|
| `/recruit/apply` | Public mechanic application (WM-1) |
| `/recruit/pipeline?key=pick-something` | John's pipeline board |
| `/recruit/demo/dashboard` | The four-screen recruiting demo (WM-2) |

The recruitment module opens its own SQLite file
(`recruitment/wrenchmark-recruitment.db`) on first run. It does not touch your
dispatch schema.

## 6. The one line to add to your dispatch code

Wherever `match.js` selects a mechanic for a job, it must require
`status === 'ACTIVE'`. The recruitment module enforces the insurance gate on its
own side, but it can't stop your matcher from dispatching to someone who hasn't
cleared it. That check lives in your code, not mine.

## Troubleshooting

**Every `/recruit` route 404s** — the `app.use` line is registered after a
catch-all. Move it up.

**`Cannot find module './db'`** — `routes.js` isn't in `recruitment/`, or
`recruitment/db.js` is missing.

**Demo loads but is unstyled / blank** — the four demo files aren't in
`recruitment/public/demo/`.

**`Unauthorized` on the pipeline** — the `?key=` in the URL doesn't match
`WM_ADMIN_KEY`.
