# Wrenchmark — working prototype

Full customer → mechanic → payment → data loop. Runs locally, no accounts required.

## Run it

```bash
npm install
node server.js
```

Open **http://localhost:3000**

Three tabs across the top:

| Tab | Who it's for |
|---|---|
| **Book** | Customer. Picks a symptom, gets a fixed price, accepts. |
| **Tech** | Mechanic. Sees the offer, accepts or declines, files the work order. |
| **Admin** | You and John. Job list, live metrics, event log, CSV export. |

## The 90-second demo

1. **Book** → tap a service card → **Continue**
2. **Year → Make → Model.** Each dropdown fills from the one above it. Pick a model and the
   vehicle is recognized — pricing class is derived from the catalogue, never asked.
3. Address and arrival window → name and mobile → **See my price**
4. Fixed price, split labor / parts / trip → **Accept price and book**
   → card is **authorized**, not charged
5. **Mechanic** → *John Doe* → offer is waiting → **Accept this job** → **Open**
6. Fill the diagnosis, attach photos, pick an outcome

   - *Completed* → card captured at exactly the quoted amount
   - *Couldn't complete* → hold released, customer charged **$0**

7. **Operations** → metrics update live. Open any job for the full record and event log.

To show shop routing: book *Suspension noise* on a **BMW X3**. The quote page flips to a
shop-visit notice, and booking it anyway releases the hold immediately — a job with no
eligible mobile mechanic never sits on a customer's card.

## What's real vs. stubbed

**Real:** SQLite database, full schema, a 28-make vehicle catalogue with cascading
year/make/model selection and automatic pricing-class derivation, quoting off a rate card,
offer/accept dispatch filtered by zone and approved job type, photo upload, payment state
machine, abort reason codes, immutable event log, live metrics, CSV export.

**Stubbed (one object each, both in `server.js`):**

- `payments` — swap for Stripe. `authorize` → `paymentIntents.create({capture_method:'manual'})`,
  `capture` → `paymentIntents.capture`, `release` → `paymentIntents.cancel`.
  The authorize/capture split *is* the no fix–no fee promise. Don't restructure it.
- `sendSms` — swap for Twilio `messages.create`. Right now every message lands in the
  outbox table shown at the bottom of Admin, which is better for demos anyway.

## Three design decisions worth defending

**Offer/accept, never assign.** Jobs are offered to every eligible mechanic; first accept
wins. Every offer, accept, decline, and expiry is written to `job_events` with a timestamp.
That table is the record that each mechanic chose whether to take the work — keep it,
never delete rows from it.

**No GPS tracking.** Deliberately absent. It's the clearest "monitoring means and manner"
signal there is, and 30 pilot jobs don't need it.

**The diagnosis schema is built past what v1 uses.** Fault codes, system, component,
labor hours, severity, and photo roles are all captured and exported now, even though
nothing consumes them yet. Structure can't be retrofitted onto a year of free-text notes,
and this table is what the whole roadmap sits on.

## Metrics captured automatically

Jobs booked · Completed · Abort rate · Quote-to-invoice variance · Revenue captured ·
Redo rate (same vehicle, same system, inside 90 days)

Redo rate is the one nobody tracks and the one that eventually carries the warranty pitch.

## Files

```
server.js     routes, payment state machine, CSV export
db.js         schema + event logger
vehicles.js   year/make/model catalogue + pricing-class derivation
seed.js       rate card, symptom catalogue, two contracted mechanics
views.js      screens
public/       design system
uploads/      diagnosis photos
wrenchmark.db created on first run — delete it to reset
```

## Before this touches a real customer

- Name cleared, USPTO Class 37
- MN employment counsel on the five-factor test
- Contractor agreements signed, COIs on file
- Real Stripe and Twilio credentials
- Move off SQLite to Postgres
- Add auth — right now every route is open

## Editing the vehicle catalogue

`vehicles.js` holds one row per model: `[name, class, firstYear, lastYear]`. Class is one of
`economy`, `standard`, `truck_suv`, `euro_luxury` and it drives the rate card directly. The
customer is never asked what kind of car they have — adding a model to the catalogue is
what makes it bookable and priced.
