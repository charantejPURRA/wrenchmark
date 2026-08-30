# Wrenchmark — working prototype (v2: matching engine)

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


---

# The matching engine

Uber scores one thing that matters: proximity. Any driver can take any trip.

Ours can't. A mechanic is eligible only if they can actually finish the job. So
matching runs as **hard gates first, scoring only among the survivors.**

## Gates — fail any one and you don't appear at all

- Active status, insurance on file and unexpired, license unexpired
- Agreement signed, **training completed**
- Approved for this job type
- Approved for this vehicle class
- Job inside their stated maximum drive time
- Enough capacity left in that arrival window

Every failure is recorded with its reason and shown on the dispatch screen. There is
never a mystery about why someone didn't get offered a job.

## Score — only among the eligible

| Term | Max | Why |
|---|---|---|
| Proximity | 50 | 0 min = 50, 45 min = 0 |
| **Parts on the van** | 22 | Biggest predictor of a completed job |
| Headroom in the window | 14 | Don't fragment somebody's day |
| Completions on this job type | 10 | Demonstrated competence |
| Completions on this vehicle class | 4 | Familiarity |

The parts term is the one with no rideshare equivalent. A mechanic 5 minutes away
without the starter is worse than one 20 minutes away carrying it — the first is an
aborted job, the second is revenue.

## Wave dispatch

Offers go to the top 3 eligible mechanics **at once**. Nobody accepts in 120 seconds,
it widens to the next 3. After 3 waves with no taker, the card hold is released
automatically and the customer is charged nothing.

Sequential single-offer dispatch would be slower and would look far more like
assignment. Batched waves keep it genuinely a choice.

**Declining never affects ranking.** Nothing in the score reads acceptance history,
compliance, or responsiveness — only capability, distance, and completed work. That is
a deliberate constraint, not an oversight: a score that punished declining would be a
control mechanism, and would be read as one.

## Payout

Base share of the ticket plus a per-minute drive allowance, uplifted December through
February. A 40-minute drive to a $90 oil change is a job nobody rational accepts, and
dispatch that ignores that produces a network that quietly stops answering.

## Swapping in Google Maps

`geo.js` estimates drive time from great-circle distance times a 1.28 circuity factor
at 42 km/h effective. Replace `driveMinutes(a, b)` with a Distance Matrix call and
nothing else in the engine changes — every other module reads through that one
function.

Job coordinates currently come from the locality the customer picks. Replace with
Geocoding on the typed address when there's a key; the `lat`/`lng` columns are already
on the jobs table.

## Live dispatch screen

`/admin/dispatch` — metro map with mechanic pins and the job, lines showing who was
offered, and the full ranked candidate table with each score's breakdown and every
exclusion reason. This is the screen that makes the engine auditable.

## Funnel report

`/admin/funnel` — where people leave, counted by distinct session over a rolling
window (`?days=7|14|30`). Behind the admin login like the rest of `/admin`.

The headline is **symptom selected → price viewed**. Everything else on the
screen exists to diagnose that one number.

| Rung | Logged from | What a drop here means |
|---|---|---|
| `symptom_selected` | `/api/triage/start` | — |
| `triage_complete` | `/api/triage/note`, where `assess()` resolves | The questions read as an interrogation, or one branch confuses people |
| `vehicle_identified` | `/api/triage/price` | Friction in the year/make/model cascade |
| `price_viewed` | `/api/triage/price` | They saw the number and did not like it, or did not trust it |
| `slot_selected` | client, on window choice | Supply, not copy |
| `booked` | `/book` | Last-mile form friction |

The branch is stamped at `assess()`, not at the board, because with a
multi-select board the entry taps are not yet a branch — the scores resolve into
one only at assessment. The by-branch table therefore splits by likely cause,
which is the more useful cut anyway: a cause converting at half the rate of the
others is a question set that needs rewriting, not a redesign.

`/api/funnel` accepts only an allowlist of client-side step names. No free-form
steps, so a stray or hostile call cannot pollute the ladder. All logging is
wrapped so that measurement can never break a booking.

On booking, every row in that session is backfilled with the job id, so a funnel
session can be traced to the job it became.

## Hero video

Off unless configured. Files ship in `public/media/` and both blueprints set the
three variables:

```
HERO_VIDEO_MP4=/media/hero.mp4
HERO_VIDEO_WEBM=/media/hero.webm
HERO_VIDEO_POSTER=/media/hero-poster.jpg
# HERO_VIDEO_YOUTUBE=<id>       # alternative: click-to-play, no autoplay
# HERO_VIDEO_HAS_AUDIO=1        # only if the file really has a track
```

The bundled clip is silent, so no sound toggle renders — a control for a track
that does not exist is a button that does nothing.

Two rules are built into the layout. **The video never outranks the conversation
on a phone:** CSS `order` moves it below `.talk` under 760px, because a 16:9
block between the headline and the first question pushes the only action on the
page off the bottom of the screen. **The video dies when triage starts:** the
first question collapses and removes it.

`hero_video_play` and `hero_video_sound_on` are logged, so compare symptom →
price viewed for the fortnight either side of switching it on. A hero video
costing more in scroll depth than it earns in trust is a real outcome.

### Re-encoding a replacement clip

Source was 3840x2160 and 18.6MB. What ships is 1600x900, audio stripped,
`faststart` so playback begins before the download finishes — 857KB and 764KB.

```
ffmpeg -i source.mp4 -an -vf "scale=1600:900:flags=lanczos" \
  -c:v libx264 -profile:v high -preset slow -crf 26 \
  -pix_fmt yuv420p -movflags +faststart public/media/hero.mp4

ffmpeg -i source.mp4 -an -vf "scale=1600:900:flags=lanczos" \
  -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 public/media/hero.webm

ffmpeg -ss 8 -i source.mp4 -frames:v 1 -vf "scale=1600:900:flags=lanczos" \
  -q:v 4 public/media/hero-poster.jpg
```

WebM is listed first in the `<source>` order so browsers that decode VP9 take the
smaller file. Pull the poster from a frame partway in — the first frame of most
clips is the least representative one.
