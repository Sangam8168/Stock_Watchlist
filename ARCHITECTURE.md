# Stock Watchlist — "Since You Left" watchlist

> A watchlist isn't a list of tickers. It's a list of **theses** — each with an
> entry band, a level that would prove it wrong, and a catalyst date. A change is
> "meaningful" only relative to *that* thesis: entering the entry zone you chose,
> breaking your invalidation, a move that's large **for this stock's own
> volatility** — not a fixed percentage.

Everything below falls out of that one decision.

---

## 1. What counts as a meaningful change

Detection lives in one pure function — [`lib/changes/detect.ts`](lib/changes/detect.ts),
`detectChanges(prev, next, thesis, opts)`. No I/O, no database, no wall clock
unless injected. That's what makes it replayable and unit-testable
([`detect.test.ts`](lib/changes/detect.test.ts), 10 cases).

| Signal | Fires when | Severity |
|---|---|---|
| `invalidation_breached` | price crosses your invalidation level — **below** for a long thesis, **above** for a short | 95 |
| `target_reached` | price crosses your target — **up** for a long, **down** for a short | 85 |
| `entered_entry_zone` | price crosses **into** `[entryLow, entryHigh]` | 80 |
| `earnings_reported` | the known earnings date rolled into the past / forward | 70 |
| `catalyst_imminent` | earnings or your catalyst date ≤ 5 **trading** days out | 55–70 |
| `abnormal_move` | `|Δ%| ≥ max(5%, mean + 2·σ of the stock's own daily moves)` — **only during market hours** | 45–80 |
| `new_52w_high` / `new_52w_low` | price prints a fresh 52-week extreme | 50–52 |
| `approaching_52w_high` / `_low` | price **crosses into** the top or bottom 2% of the 52-week range, having been outside it — fires once on entry, not every cycle it loiters there. Quieter than the break on purpose: the break is a fact, this arrives while you can still act | 35–38 |
| `news_break` | headline set **hash changes** *and* article count grows | 30–55 |
| `valuation_shift` | trailing P/E moves 15–150% between sane P/E levels (< 250) — beyond that it's a data artifact, suppressed | 40 |
| `corporate_action` | price gap between checks lands on a round split ratio (2,3,…10×) or exceeds 60% — suppresses the price-derived signals and tells you to re-check your levels | 45 |
| `thesis_stale` | an `active`/`developing` item with **no event in 30 days** (nudge to cull) | 25 |
| `stale_data` | the latest quote is old for the current market state | 15 |

**Crossings need a prior price.** The first time we see a symbol we store a
baseline, not an event — otherwise a stock already inside your entry band would
fire "just entered" the moment you add it. (Tested.)

**Long / short.** A thesis has a `direction`. Short theses flip the invalidation
(price rising *through* it is wrong) and target (profit is *below*). The entry
band is a range either way. (Tested.)

**dedupe keys** carry the day (`entered_entry_zone:NVDA:2026-09-06`), so a change
is logged once even though the poll runs every 15 minutes. A unique
`(userId, dedupeKey)` index makes re-detection a no-op.

---

## 2. Architecture — read/write split

```
  ┌──────────────────────── Inngest cron (*/15, concurrency 1) ───────────────────────┐
  │                                                                                    │
  │  getDistinctWatchedSymbols()          ← O(distinct symbols), never O(users×symbols) │
  │        │                                                                            │
  │        ▼   route on the ticker suffix                                               │
  │  buildSnapshot(sym) ──┬── .NS / .BO → getIndianQuote()   (keyless, INR)             │
  │        │              └── everything else → Finnhub      (9 endpoints)              │
  │        │                                                                            │
  │        ▼   guards: skip the fetch under 45s old; skip the write if price            │
  │  Snapshot.create()     and newsHash are both unchanged   (append-only, TTL 90d)     │
  │        │                                                                            │
  │        ├── Pass 1: detectChanges(...).filter(!isThesisScoped)                       │
  │        │           → SymbolEvent.upsert(dedupeKey)   ONE row, every watcher reads it │
  │        │                                                                            │
  │        └── Pass 2: for users who actually set a level                               │
  │                    detectChanges(...).filter(isThesisScoped)                        │
  │                    → ChangeEvent.upsert(userId, dedupeKey)                          │
  └────────────────────────────────────────┬───────────────────────────────────────────┘
                                           │
   page loads never call a provider ──────▶│
                                           ▼
   getWatchlist(deviceId) / getSinceYouLeft(deviceId)
     = join(Watchlist, WatchedSymbol.latest, SymbolEvent, ChangeEvent)
       filtered at read time by SeenState watermarks and per-user alert prefs
```

**The event split is the whole design.** A symbol-level fact ("up 8% today") is
identical for everyone watching it, so it is computed once and stored once.
A thesis-level fact ("crossed *your* invalidation") can only be per user, and is
only computed for users who set that level — which most never do. Detection cost
therefore tracks distinct symbols, not user count.

**Per-user alert preferences filter at read time, not write time.** Filtering
during detection would put user count back into the write path and undo the
property above. The trade is read CPU for flat writes
([`lib/changes/preferences.ts`](lib/changes/preferences.ts)).

**Two providers, one snapshot shape.** Finnhub returns a null price for every
NSE and BSE listing on this plan, so Indian tickers route to a second source
([`lib/actions/yahoo.actions.ts`](lib/actions/yahoo.actions.ts)). Both paths
converge on `BuiltSnapshot`, so nothing downstream — detection, health,
coverage, the digest — knows a second provider exists. Adding a third venue is a
row in [`lib/changes/exchange.ts`](lib/changes/exchange.ts), not a rewrite.

**Bounded storage.** Every collection that grows with time has a TTL: snapshots
90d, events 120d, seen-state 180d, thesis revisions 730d.

**On-demand path.** `refreshMyWatchlist` reuses the same `refreshSymbols`
pipeline for one user's symbols, rate-limited to 10 calls a minute.

Seven collections: `watchlist` (the thesis), `snapshots` (time series),
`watchedsymbols` (refcount + cached latest), `symbolevents` (shared),
`changeevents` (per user), `seenstates` (watermarks), `thesisrevisions`
(your own edit history). Models in [`database/models/`](database/models).

---

## 3. State across sessions & devices

"How far you've caught up" is server state, keyed **`(userId, deviceId, symbol)`**
in [`seenState.model.ts`](database/models/seenState.model.ts):

- `deviceId` is a random id in `localStorage` ([`useDeviceId`](hooks/useDeviceId.ts)).
  Your laptop and phone each track their own position — opening one doesn't clear
  the "new" badges on the other.
- An event is **unseen** if `createdAt > max(perSymbolWatermark, globalWatermark)`.
- `markSeen` uses `$max` — monotonic. A slow or stale request can never move the
  watermark backwards and re-surface things you've already reviewed.
- A **new device inherits** rather than resets — it seeds from the furthest-along
  device on the account, so a new phone doesn't greet you with months of unread.
- **Two different things, deliberately not conflated.** `__global` is how far
  you've *reviewed*, and it alone decides what counts as new. `__visit` is when
  you were last *here*, and it is only ever used for the "you last checked…"
  wording. They used to be the same row, which meant "since your last visit"
  was measured from the last time you pressed a button — it told someone who had
  visited a minute ago that there were 31 updates since their last visit.
- **Reading counts as reviewing.** A group is marked read once it has been at
  least half on screen for 1.5 continuous seconds in a foreground tab. Rendering
  below the fold doesn't count, and neither does flicking past — the whole point
  of a watermark is that nothing disappears unseen. It marks on the server but
  doesn't refetch, so the list stays put while you read it.
- No `localStorage` for the actual data — only the device id. Everything else is
  in Mongo and reconciles on any device.

---

## 4. Stale, delayed & conflicting data

Four layers, in increasing order of how much we think they matter.

**1 — Per-snapshot staleness.** Every snapshot records `source`, `asOf` (the
provider's own timestamp) and a computed `stale` flag. Stale means no quote, or
`asOf` more than 20 minutes behind now *while that symbol's market is open*.
Clock reasoning is per venue, not per server: an NSE listing is judged against
09:15–15:30 IST ([`lib/changes/exchange.ts`](lib/changes/exchange.ts)).

**2 — Named unconfirmed fields.** A sub-fetch that fails degrades the row rather
than the cycle: `source: "finnhub:partial(metrics)"`, the snapshot is still
written, and the affected fields are listed in `unconfirmedFields` and badged in
the UI. **A field is never defaulted to zero** — a zero in a price column is a
lie, a dash is the truth.

**3 — Graded confidence, and the provider contradicting itself.**
[`lib/changes/confidence.ts`](lib/changes/confidence.ts) scores each quote 0–1,
derived from the polling interval rather than from invented constants: under one
cycle old is 1.0, and the floor lands on the same "three missed polls" threshold
the coverage check uses. One policy, two surfaces.

It also detects a single provider disagreeing with *itself* across endpoints —
a price above the 52-week high the same provider reports is not a rally, it is
`/quote` and `/stock/metric` updating on different schedules. A contradiction
caps confidence below staleness does, because an old price was at least true
once. For dual-listed Indian names there is a genuine second opinion:
`checkCrossListing()` compares NSE against BSE, which are independent order
books.

**4 — The one that matters: silence has two causes.**
[`lib/changes/coverage.ts`](lib/changes/coverage.ts).

An outage writes no snapshots, so it detects no changes, so the digest is empty —
and an empty digest renders exactly like "nothing happened". The app would
reassure the user at precisely the moment it had gone blind, and an outage looks
identical to a calm market.

So before reporting quiet, the app establishes that it could see. If it could
not, it says **"Can't confirm"** and names the symbols. Thresholds are
deliberately asymmetric: three missed 15-minute polls while the market is open,
96 hours when it is shut — a false alarm costs trust just as much as a false
all-clear, and prices legitimately do not move over a long weekend.

A **delisted ticker is reported separately** from blindness. Indian listings get
renamed and demerged often (Zomato became `ETERNAL.NS`; Tata Motors split off
`TMPV.NS`), and a 404 is permanent. Folding it into the blindness count would
leave "Can't confirm" showing forever over something only the user can fix — and
a warning that never clears stops being a warning.

**Abnormal-move alerts are gated on that symbol's market being open**, so a
stale Friday close compared against Monday never produces a fake 7% move.

**Money is never added across currencies.** Where a list mixes INR and USD
holdings, sector concentration falls back to weighting by count. A rupee figure
is roughly 83× a dollar one for comparable value, so summing them would report a
concentration that does not exist.

---

## 5. Scale

| Concern | Approach |
|---|---|
| More users, same symbols | detection is O(distinct symbols); symbol events stored once and read by every watcher |
| Per-user preferences | applied at read time, so user count never enters the write path |
| Larger watchlists | indexed joins, capped event windows, per-list slicing from a single digest query |
| Storage growth | TTL on all five time-growing collections (90 / 120 / 120 / 180 / 730 days) |
| Poll cost off-hours | cron self-throttles to hourly when the market is shut; full sweep on the hour, active symbols only otherwise |
| Redundant writes | fetch skipped under 45s; write skipped when price and `newsHash` are both unchanged |
| Hot lookups | `snapshots (symbol, capturedAt desc)`, `changeevents (userId, symbol, createdAt desc)`, `watchedsymbols.latest` for O(1) current price |
| Detection idempotency | unique `(userId, dedupeKey)` and `(dedupeKey)` — safe to re-run any cycle; cron pinned to `concurrency: 1` |
| Fan-out | `refreshSymbols` in batches of 20 per cron step |
| Digest fan-out | two-stage: a dispatcher finds only users with activity, then one event per user at `concurrency: 5` |

**Two things that only broke past a scale we could test**, both found and fixed:

- **The 16MB ceiling.** Users with recent activity were enumerated with
  `distinct()`, which returns a single BSON document — and BSON documents cap at
  16MB, so past roughly half a million users it simply throws. Replaced with an
  async generator over a `$group` aggregation with `allowDiskUse`.
- **An OOM in the stale-thesis sweep.** It loaded every user's items into
  memory. Now it streams a cursor and writes back in `bulkWrite` batches of 500.

**Abuse is bounded per action, priced by cost** — `refresh` 10/min (hits the
provider), `email` 5/5min (Gmail's own cap), `search` 60/min, `write` 120/min.
The limiter **fails open**: if its datastore is unreachable, locking every user
out is a worse outcome than briefly unmetered traffic. You would invert that for
anything touching money.

---

## 6. Deliberately simple

- **One** detection module, pure, 14 rules. No rules engine, no DSL.
- Inngest + Mongo TTL indexes instead of a separate scheduler / cache / queue.
- The daily digest email (`sendWatchlistDigest`, weekday 12:30 UTC) reuses the
  existing `nodemailer` + Inngest setup and reads the **same** `ChangeEvent` rows
  as the on-site panel — windowed to 24h, filtered to `notify: true` items.
  Render logic: `lib/watchlist/digest.ts`.
- No websockets — a 15-min materialized feed is the right grain for a *watchlist*
  (candidates, not positions). Positions you'd own would need tighter alerting;
  that's the portfolio, a separate list, out of scope here on purpose.
- **No message queue, no Redis, no microservices, no ML.** The job runs every 15
  minutes over a few thousand symbols; MongoDB handles that comfortably. Adding
  Kafka would have been for the CV, not the product.
- **No test framework.** `node --test` ships with Node and reads TypeScript
  directly: 142 tests, zero test dependencies. The honest cost is no coverage
  report.
- **Where we over-built, for the record:** seven column views and roughly forty
  columns in the table. That was breadth for its own sake and would be the first
  thing cut.

---

## 6b. What makes the watchlist itself different

Most watchlists are a quote table. This one is a **decision surface**:

- **Thesis meter** (`ThesisMeter`) — a per-row bar showing invalidation zone ·
  entry band · target with a live price marker. One glance tells you "in the
  zone", "below my invalidation", or "halfway to target" — direction-aware
  (short theses flip it).
- **Sparkline** (`Sparkline`) — inline 30-point price line from the snapshot
  series; no charting library, hides itself under 2 points.
- **Filter + sort bar** — All / Needs attention / Near entry / Catalyst ≤ 2wk /
  Muted, sortable by attention, distance-to-entry, catalyst date, recency, A–Z.
  Turns a 40-name list into "what's actionable right now".
- **Triage on the digest** — a broken thesis shows **Keep on list / Mute 1wk /
  Cull** inline, so "while you were away" produces decisions, not just dismissals.
- **Snooze** (`mutedUntil`) — mute an item's alerts + digest lines for 1–4 weeks
  (e.g. through an earnings print). Honored by `getSinceYouLeft`, the row UI, and
  `buildUserDigest`.
- **On-demand email** — "Email me this" runs the digest for the current user
  right now (`sendTestDigest`), so you can see the email format without waiting
  for the cron.

## 7. Mail alerts

Three emails, all via Inngest + `nodemailer` (Gmail). They need
`NODEMAILER_EMAIL` + `NODEMAILER_PASSWORD` (a Gmail **app password**) set, and
Inngest running (`npx inngest-cli@latest dev` locally, or Inngest Cloud in prod).

| Email | Function | Trigger | Content |
|---|---|---|---|
| Welcome | `sendSignUpEmail` | `app/user.created` event on sign-up | Gemini-personalised intro (falls back to static text) |
| Daily news | `sendDailyNewsSummary` | cron `0 12 * * *` | Per-user watchlist news, Gemini-summarised |
| **Change digest** | `sendWatchlistDigest` | cron `30 12 * * 1-5` (weekday) **or** `app/watchlist.digest` event | The "while you were away" feed: `ChangeEvent`s from the last 24h, grouped by symbol, ranked by severity, `notify:true` and non-muted items only. Skips users with nothing to report. |

- Sign-up does **not** block on the welcome email — `inngest.send` is
  fire-and-forget, so a missing Inngest/email setup never breaks account creation.
- The digest is idempotent to run: `sendTestDigest` and the cron both call
  `buildUserDigest` and send the same HTML (`WATCHLIST_DIGEST_EMAIL_TEMPLATE`).
- Without email creds, `sendTestDigest` returns a clear reason instead of throwing;
  the cron's send step just fails-and-retries in Inngest.

---

## 7b. Edge cases handled

| Case | Handling |
|---|---|
| Unknown / delisted ticker | Finnhub returns `{c:0,t:0}` — treated as **no data** (stale, price `undefined`), not "$0.00" |
| Missing `dp` (daily %) | derived from `(close − prevClose) / prevClose` |
| Stock split / share-class change | round-ratio / >60% gap detection → `corporate_action`, price signals suppressed for that tick |
| P/E data artifact (30 → 3700) | valuation-shift capped to 15–150% between P/Es under 250 |
| News-count baseline catch-up | jump > 12 shows "fresh coverage", not a fabricated article count |
| First observation of a symbol | stored as a baseline, no crossing events invented |
| New device / cleared storage | `ensureSeenBaseline` seeds the watermark from the user's furthest-along device |
| Provider 429 / 5xx | `fetchJSON` retries twice with backoff (honours `Retry-After`) before giving up |
| Refresh-button spam | skips the 5-call fetch entirely if a fresh non-stale snapshot exists (< 45s) |
| Market closed | intraday-move + abnormal-move alerts gated on `isMarketOpen`; poll self-throttles to hourly |
| Concurrent detection (cron + manual) | unique `(userId, dedupeKey)` index makes duplicate writes no-ops |
| Snooze on a missing item | `matchedCount` checked, returns `ok:false` |
| Invalid entry band (low ≤ 0, high < low) | distance/meter return null instead of dividing by zero |
| Volatility window during market hours | computed from one point **per calendar day** (aggregation), not the last N poll ticks |

**Known limits (documented, not yet built):** entry criteria aren't *enforced*
(quick-add allows a thesis-less item); no liquidity floor check; per-user
`ChangeEvent` fan-out isn't split into symbol-level vs thesis-level writes (see
§5 — matters only past ~10k users/symbol); holiday calendar covers 2025–26 only;
DST edges can shift a trading-day countdown by ±1.

---

## 8. Where to look

**The pure core** — twelve modules in `lib/changes/`, no I/O in any of them,
which is why there are 142 tests and not six. A test is three object literals
and an assertion.

| Module | Decides |
|---|---|
| `detect.ts` | what changed — 14 event types, the only module that reads a thesis |
| `health.ts` | how the list as a whole is doing (broken counts double) |
| `coverage.ts` | whether silence can honestly be reported as "nothing happened" |
| `confidence.ts` | how much a quote is worth trusting; provider self-contradiction |
| `exchange.ts` | which venue a ticker trades on, its hours and its currency |
| `preferences.ts` | whether this user should see this event |
| `parse-thesis.ts` | pulling levels out of a pasted sentence (regex, no LLM) |
| `revision.ts` | diffing a thesis edit, and spotting a loosened invalidation |
| `concentration.ts` | sector concentration, currency-safe |
| `currency.ts` | conversion that refuses to guess an unknown source currency |
| `explain.ts` | why an event is ranked where it is (factors sum to the score) |
| `display.ts` | formatting every surface shares |

| Area | File |
|---|---|
| Ingestion + detection pipeline | `lib/watchlist/pipeline.ts` |
| Snapshot builder (**not** a server action — see below) | `lib/market-data/snapshot.ts` |
| Indian market provider | `lib/actions/yahoo.actions.ts` |
| Watchlist reads/writes + digest | `lib/actions/watchlist.actions.ts` |
| Cron jobs | `lib/inngest/functions.ts` |
| Rate limiting, structured logging | `lib/observability/` |
| Models | `database/models/` (seven) |
| UI | `app/(root)/`, `components/watchlist/`, `components/search/` |
| Reviewer test bench | `components/watchlist/TestBench.tsx`, `lib/actions/demo.actions.ts` |

**Two things are deliberately not server actions.** Anything exported from a
`'use server'` module is a public endpoint any browser can call.
`buildSnapshot` spends about six provider requests per call, so leaving it
exported was a free way to drain the API quota — it now lives in
`lib/market-data/snapshot.ts`. And a lookup that returned any user's watchlist
from just their email address moved to `lib/watchlist/users.ts`; its only caller
is a cron. `getQuote` stays an action because the thesis editor needs it, but
requires a session and is metered.

Run the tests: `npm test` — 142, no database or network required.
