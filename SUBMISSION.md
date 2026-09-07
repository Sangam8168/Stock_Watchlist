# Submission form content

Copy each block into the matching field on the submission form.

---

## TITLE

```
Stock Watchlist — a thesis-aware watchlist that tells you what actually changed since you last looked
```

---

## DESCRIPTION

*(The editor supports bold, lists and links — the formatting below is intentional.)*

---

**Most watchlists show you prices. Prices aren't change** — they're numbers you
have to re-interpret on every visit. The brief asks for "what has meaningfully
changed," and you can't answer that without knowing what the stock meant to the
user in the first place.

So here, **a watchlist item is a thesis**, not a ticker: an entry zone, a level
that would prove you wrong, a target, and a catalyst date. "Meaningful" is judged
against *that*, never a fixed 5% rule.

**What the engine detects** (12 kinds, each scored 0–100 for severity):

- price entered **your** entry zone, breached **your** invalidation, or hit **your** target — direction-aware, so a short's levels invert
- a move that's abnormal **for this stock's own volatility** (`max(5%, mean + 2σ)`), gated on market hours so an after-hours print isn't called a crash
- a catalyst inside 5 **trading** days (not calendar days)
- 52-week extremes, valuation re-rates, earnings prints, fresh coverage
- **data-quality events** — stale or delayed quotes are surfaced as first-class changes rather than hidden

**Returning shows a diff, not a dashboard.** "While you were away" is filtered
against a per-device watermark, so it's genuinely *since your last visit* — not a
fixed 24-hour window. Each entry carries the literal **was → now**: `Price $63.86
→ $60.14`, `Distance to entry −8.8% → −14.1%`, coloured against your thesis
direction. A separate **History** view keeps the full chronological record,
including events you've already reviewed.

### Three engineering decisions I'd point a reviewer at

1. **The detection engine is a pure function.** `detectChanges(prev, next, thesis)`
   — no I/O, no DB, no clock (market-hours and trading-day math are injected). It
   is therefore fully unit-tested and replayable: **12 tests that run with no
   `.env`, no database and no network.**

2. **Detection is per-symbol, not per-user-per-symbol.** Events split into
   *symbol-level* (shared: news, abnormal moves, earnings) and *thesis-level*
   (per-user: your entry/invalidation/target). Cost scales with the number of
   distinct tickers, not users × tickers. Measured in the running database:
   **3 users watching NVDA produced 12 shared symbol-events — one set, not one
   set each** — while only the genuinely user-specific thesis-events were stored
   per person.

3. **"Caught up" is per-device and monotonic.** Watermarks are keyed
   `(userId, deviceId, symbol)` and only ever advance (`$max`), so your laptop
   can't clear your phone's badges and a slow request can't re-hide something.
   A brand-new device is seeded from your furthest-along one, so a new phone
   doesn't replay three weeks you already triaged.

### On honesty about data

Every snapshot records its `source`, `asOf` and a `stale` flag, and the UI says
when data is delayed instead of quietly showing a number. The same principle
applies to the signed-out page: it renders **real** quotes, and when there isn't
yet enough captured history to draw a truthful line, it shows the real quote
board and says so rather than animating a generated one.

### Edge cases handled deliberately

- **Stock splits** — a 2:1 split looks identical to a −50% crash. Round-ratio
  detection suppresses the false "invalidation breached" and asks you to re-check
  your levels instead.
- **First sighting** — a crossing requires *both* a previous and a current price,
  so adding a stock never fires a fake "entered your zone."
- **Delisted / no-quote tickers** — guarded so they don't render as `$0.00`.
- **Runaway values** — a P/E re-rate is only reported inside sane bounds, after a
  real ticker reported "P/E expanded 12342%" during testing.

Built with Next.js 15 (App Router, Server Actions — no REST layer), TypeScript in
strict mode, MongoDB with TTL-bounded collections, Better Auth, and Inngest for
the poll and digest crons.

---

## INSTRUCTIONS TO RUN

*(These are the exact steps I verified against a clean extract of the submitted ZIP.)*

---

**Prerequisites:** Node 20+ and a MongoDB you can reach (local `mongod` or a free
Atlas cluster).

**1. Install**

```bash
unzip stock-watchlist-submission.zip
cd Stock_Watchlist
npm install
```

**2. Validate the core immediately — no config needed**

The change-detection engine is a pure function, so you can verify it before
setting anything up:

```bash
npm test          # 12 change-engine cases — no .env, no DB, no network
npx tsc --noEmit  # strict typecheck
```

**3. Configure**

```bash
cp .env.example .env
```

Only **four** values are required:

| Variable | Value |
|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/watchlist`, or an Atlas connection string |
| `FINNHUB_API_KEY` | free key from https://finnhub.io |
| `BETTER_AUTH_SECRET` | any long random string — `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |

Everything else is optional. Without Google OAuth the "Continue with Google"
button simply doesn't appear; without mail credentials, password-reset links are
printed to the server console so the flow is still testable.

**4. Run**

```bash
npm run dev     # → http://localhost:3000
```

**5. See the whole product in about 60 seconds**

1. **Sign up** (email + password — no verification step).
2. Go to **/watchlist**.
3. Click **"Load demo watchlist"** — adds 8 stocks that already have theses,
   entry zones and invalidation levels.
4. Click **"Simulate while you were away"** — this runs the **real** detection
   engine over synthetic prices, so the digest lights up instantly regardless of
   market hours or whether the background poll has captured any history yet.
5. You'll now see the **"While you were away"** panel: ranked changes, plain-English
   reasons, and was → now value deltas.
6. Try the **History** tab for the full chronological record, and the **Table**
   tab (General / Thesis / Performance / Fundamentals column presets).
7. Click **"Mark all reviewed"** — the nav badge clears, and revisiting shows
   only what's new since that moment.

**Optional — the background jobs.** In a second terminal:

```bash
npx inngest-cli@latest dev
```

This runs the 15-minute poll and the daily digest cron. Not required for the demo
above; the in-app **Refresh** button fetches on demand.

**Note on `npm run build`:** it requires `MONGODB_URI` to be set, because Next
collects page data at build time and that touches the DB layer. Run it after
step 3, not before — otherwise it exits with
`MONGODB_URI must be set within .env`.

**Where to look in the code**

| What | File |
|---|---|
| The change engine + its tests | `lib/changes/detect.ts`, `lib/changes/detect.test.ts` |
| Ingestion & the two-pass detection split | `lib/watchlist/pipeline.ts` |
| Market-hours / trading-day math | `lib/market.ts` |
| Digest, watermarks, reads/writes | `lib/actions/watchlist.actions.ts` |
| Design write-up | `ARCHITECTURE.md`, `SCALING.md` |
