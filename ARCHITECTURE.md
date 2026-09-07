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
                 ┌─────────────── Inngest cron (*/15) ───────────────┐
                 │  getDistinctWatchedSymbols()   ← O(symbols), not   │
                 │        │                          O(users×symbols) │
                 │        ▼                                           │
                 │  refreshSymbol(sym):                               │
                 │    buildSnapshot(sym)  ─ Finnhub: quote, profile,  │
                 │        │                  metrics, earnings, news  │
                 │        ▼                                           │
                 │    Snapshot.create(...)         (append-only, TTL 90d)
                 │        │                                           │
                 │        ▼   for each user watching sym:             │
                 │    detectChanges(prev, next, thesis)               │
                 │        │                                           │
                 │        ▼                                           │
                 │    ChangeEvent.upsert(dedupeKey)  (materialized feed)
                 └────────────────────────┬──────────────────────────┘
                                          │
   page loads never call Finnhub ────────▶│
                                          ▼
   getWatchlist(deviceId) / getSinceYouLeft(deviceId)
     = join(Watchlist, latest Snapshot, ChangeEvent) filtered by SeenState
```

- **Ingestion is deduped across users.** 10,000 people watching `AAPL` cost
  exactly one fetch. Snapshots are shared; theses are per-user.
- **Reads are pure DB joins.** The dashboard, the watchlist, and the "while you
  were away" digest all read materialized rows. No provider call on the hot path.
- **Bounded storage.** `snapshots` and `changeEvents` have TTL indexes (90 / 120
  days), so the time series stays flat regardless of age.
- **On-demand path** ([`refreshMyWatchlist`](lib/actions/watchlist.actions.ts))
  reuses the exact same `refreshSymbols` pipeline for just the current user's
  symbols — powers the "Refresh now" button.

Collections: `watchlist` (thesis), `snapshots` (time series), `changeevents`
(feed), `seenstates` (caught-up watermarks). Models in
[`database/models/`](database/models).

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
- No `localStorage` for the actual data — only the device id. Everything else is
  in Mongo and reconciles on any device.

---

## 4. Stale, delayed & conflicting data

Every snapshot records `source`, `asOf` (the provider's timestamp), and a
computed `stale` flag:

- **Stale** = no quote, or `asOf` is > 20 min behind now **while the US market is
  open** ([`lib/market.ts`](lib/market.ts) does all clock reasoning in
  `America/New_York` with a holiday list).
- The UI shows it explicitly — `delayed · as of 2h ago` — never silently.
- **Abnormal-move alerts are gated on `isMarketOpen`.** We don't cry wolf about a
  7% "move" that's really just a stale Friday close being compared to Monday.
- **Partial provider failure** degrades the row: `source: "finnhub:partial(metrics)"`,
  the snapshot is still written, detection still runs on what we have.
- **Conflicting sources** (profile market-cap vs. metrics market-cap disagree
  > 5%) → the field is tagged in `unconfirmedFields` and badged `unconfirmed` in
  the UI rather than picking a winner.

---

## 5. Scale

| Concern | Approach |
|---|---|
| More users, same symbols | ingestion is O(distinct symbols); snapshots shared |
| Larger watchlists | reads are indexed joins, capped event windows, category grouping so the UI stays usable at 40+ names |
| Storage growth | TTL indexes on `snapshots` (90d) and `changeevents` (120d) |
| Poll cost off-hours | cron self-throttles to hourly when `!isMarketOpen` |
| Hot symbol lookups | `snapshots (symbol, capturedAt desc)`, `changeevents (userId, symbol, createdAt desc)` |
| Detection idempotency | unique `(userId, dedupeKey)` — safe to re-run any cycle |
| Fan-out | `refreshSymbols` batches (20/cron step, 4-wide within a batch) |

---

## 6. Deliberately simple

- **One** detection module, pure, ~10 rules. No rules engine, no DSL.
- Inngest + Mongo TTL indexes instead of a separate scheduler / cache / queue.
- The daily digest email (`sendWatchlistDigest`, weekday 12:30 UTC) reuses the
  existing `nodemailer` + Inngest setup and reads the **same** `ChangeEvent` rows
  as the on-site panel — windowed to 24h, filtered to `notify: true` items.
  Render logic: `lib/watchlist/digest.ts`.
- No websockets — a 15-min materialized feed is the right grain for a *watchlist*
  (candidates, not positions). Positions you'd own would need tighter alerting;
  that's the portfolio, a separate list, out of scope here on purpose.

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

| Area | File |
|---|---|
| Change engine (+ tests) | `lib/changes/detect.ts`, `lib/changes/detect.test.ts` |
| Ingestion + detection pipeline | `lib/watchlist/pipeline.ts` |
| Snapshot builder (provider) | `lib/actions/market-data.actions.ts` |
| Market-hours / trading-day math | `lib/market.ts` |
| Watchlist reads/writes + digest | `lib/actions/watchlist.actions.ts` |
| Cron jobs | `lib/inngest/functions.ts` (`pollWatchlistSymbols`, `sendWatchlistDigest`, `flagStaleThesesDaily`) |
| Digest email render | `lib/watchlist/digest.ts` |
| Models | `database/models/{watchlist,snapshot,changeEvent,seenState}.model.ts` |
| UI | `app/(root)/watchlist/`, `components/watchlist/` |
| Thesis meter / sparkline / snooze | `components/watchlist/{ThesisMeter,Sparkline,WatchlistRow}.tsx` |
| Email templates | `lib/nodemailer/{index,templates}.ts` |
| Demo helpers | `lib/actions/demo.actions.ts` (seed + simulate) |

Run the engine tests: `npm test`.
