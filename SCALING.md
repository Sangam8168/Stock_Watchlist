# Scaling — every stage

Variables: **U** users · **W** avg watchlist size (target 20–40) · **S** distinct
symbols anyone watches (bounded — ~8,000 US equities exist, a few thousand get
watched) · poll = every 15 min during market hours (~26 cycles/trading day).

The design goal at every stage: **cost scales with S, not with U × W.**

---

## 1. Ingestion — enumerate the work

| | Before | Now |
|---|---|---|
| "which symbols to poll" | `Watchlist.distinct('symbol')` — index scan over all U×W rows | `WatchedSymbol` refcount collection — one doc per distinct symbol, `O(S)`; maintained on add/remove/recategorise |
| cadence | every symbol every 15 min | **tiered**: symbols in someone's *active* category every cycle; the rest on the top of the hour; hourly-only when the market is closed |
| provider spend | 5 Finnhub calls/symbol/cycle | profile/metrics/earnings cached 1 h (`revalidate`), so ~2 fresh calls/symbol after warm-up; `fetchJSON` retries 429/5xx with backoff; a manual refresh skips the fetch entirely if a fresh snapshot exists (< 45 s) |

**The real wall** is the provider. Finnhub free = 60 req/min. At S = 3,000 that's
~6,000 fresh calls/cycle → doesn't fit 15 min at 60/min. Fixes, in order of
leverage: (a) tiered polling (done — most symbols aren't "active"); (b) a paid
tier (300–600/min); (c) Finnhub's **trade websocket** — subscribe to all watched
symbols, keep last price in memory/Redis, snapshot on a timer — removes per-symbol
price polling; (d) shard the poll cron by `hash(symbol) % N` across N workers.

---

## 2. Snapshots — the time series

Append-only, ~S writes/cycle. S = 3,000 → ~78k/day, **90-day TTL index** → ~7M
docs steady state. Index `(symbol, capturedAt)`. Fine for Mongo.

- Reads never sort this collection: the poll caches the latest snapshot on
  `WatchedSymbol.latest`, so "current price for symbol X" is an `O(1)` point read.
- Volatility / sparkline need daily closes, not every tick — computed with a
  `$group` by calendar day (bounded output), not a scan of intraday rows.
- Next step at higher scale: a `DailyBar` rollup (one row/symbol/day, long TTL) +
  a short TTL (7 d) on the intraday collection — shrinks the hot set ~20×.

---

## 3. Detection — the O(U × W) trap, and the fix

Most "meaningful changes" are **identical for everyone** who watches the ticker:
abnormal move, news break, 52-week extreme, earnings, valuation shift, split,
stale data. Only *thesis* events differ per user: entered **your** entry band,
broke **your** invalidation, hit **your** target.

So detection is split ([`lib/watchlist/pipeline.ts`](lib/watchlist/pipeline.ts)):

```
refreshSymbol(sym):
  ├─ Pass 1  detect symbol-level changes ONCE  → SymbolEvent   (no userId)
  └─ Pass 2  for users who set levels only:    → ChangeEvent   (per user)
             detect thesis-level changes
```

Verified: after the demo, `symbolevents` held `abnormal_move, news_break,
catalyst_imminent, stale_data`; `changeevents` held only `entered_entry_zone,
invalidation_breached`.

**Impact:** 10,000 users watch NVDA, it has an abnormal move → **1** `SymbolEvent`
row, not 10,000. Thesis writes happen only for the minority of items that have
entry/invalidation/target/catalyst set (`Watchlist.find({symbol, $or:[levels]})`).

Idempotency: unique `dedupeKey` on each store → the cron and "Refresh now" can
race and re-detect freely; duplicate writes are no-ops.

---

## 4. Reads — the watchlist page

`getWatchlist` / `getSinceYouLeft` merge the two event stores through one helper
([`lib/watchlist/changes-read.ts`](lib/watchlist/changes-read.ts)):

- `ChangeEvent.find({userId, symbol:$in})` — index `(userId, createdAt)`
- `SymbolEvent.find({symbol:$in})` — index `(symbol, createdAt)`, shared across all users
- latest snapshot — `WatchedSymbol.latest` point reads (was: a `$group` over the whole series)
- price history — one day-bucketed aggregation, capped at 30 points/symbol
- seen watermarks — `SeenState` unique index `(userId, deviceId, symbol)`

Every query is indexed and bounded. The **nav badge** no longer runs the full
digest on every page — `getUnseenCount` is three indexed `countDocuments`.

---

## 5. Mail — two-stage fan-out

The naïve version (`getAllUsers()` → loop → `step.run` per user) breaks twice at
scale: it loads every user into memory, and it makes 2 Inngest steps per user in
**one** function invocation (step-count limits, serial execution).

Now ([`lib/inngest/functions.ts`](lib/inngest/functions.ts)):

```
dispatchWatchlistDigests (cron 30 12 * * 1-5)
  ├─ usersWithRecentActivity(24h)   ← only users with a ChangeEvent, or watching
  │                                   a symbol with a SymbolEvent, in the window
  └─ step.sendEvent(batches of 250)  → app/watchlist.digest.user  (one per user)

sendUserWatchlistDigest  (event: app/watchlist.digest.user)
  concurrency: 20            ← at most 20 digests built at once
  throttle: 100 / 60s        ← ≤ 100 emails/min
  idempotency: userId+"-"+day ← a retry or dup event never double-sends
  └─ buildUserDigest → sendWatchlistDigestEmail
```

- **Pre-filtered**: quiet users (the majority on any given day) are never
  processed — no digest built, no query run for them.
- **Provider**: Gmail SMTP is the demo transport (~500/day cap). For real volume,
  swap `createTransport` for Resend/SES/Postmark (batch API, DKIM, dedicated IP) —
  ~10 lines in [`lib/nodemailer/index.ts`](lib/nodemailer/index.ts), everything
  downstream unchanged. The `throttle` config then moves to the provider's limit.
- **Timezone**: the cron fires once (7:30 am ET). Global scale → bucket users by
  timezone, one dispatcher cron per bucket.
- **Not built**: per-user frequency (daily/weekly/off) + one-click unsubscribe —
  needs a `NotificationPref` doc + an unsubscribe route. ~1 hour.

---

## 6. Database — indexes & sharding

| Collection | Key indexes | Shard key (when needed) |
|---|---|---|
| `watchlist` | `(userId, symbol)` unique, `(symbol, notify)` | `hash(userId)` |
| `watchedsymbols` | `symbol` unique, `(tier, lastPolledAt)` | `hash(symbol)` |
| `snapshots` | `(symbol, capturedAt)`, TTL 90d | `hash(symbol)` |
| `symbolevents` | `(symbol, createdAt)`, `dedupeKey` unique, TTL 120d | `hash(symbol)` |
| `changeevents` | `(userId, createdAt)`, `(userId, dedupeKey)` unique, TTL 120d | `hash(userId)` |
| `seenstates` | `(userId, deviceId, symbol)` unique | `hash(userId)` |

TTL indexes keep every growing collection flat regardless of age.

---

## 7. What I'd add next, by scale

| At roughly | Add |
|---|---|
| 1k users | nothing — current design holds |
| 10k users | `DailyBar` rollup; move Finnhub price to the trade websocket + Redis latest-price cache |
| 100k users | shard the poll cron by symbol-hash; Redis token-bucket rate limiter for the provider; timezone-bucketed digest crons; a real email provider |
| 1M users | Mongo sharding per the table above; separate read replica for page loads; the change feed on a queue (Kafka/SQS) instead of direct writes |
