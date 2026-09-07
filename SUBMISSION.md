# Submission form content

Copy each block into the matching field on the submission form.

---

## TITLE

```
Stock Watchlist — a thesis-aware watchlist that tells you what actually changed since you last looked
```

---

## DESCRIPTION

*(Paste into the Description field. The editor supports bold, headings, lists and
links — the structure below is deliberate: it lets a reviewer skim the headings
and still hit every requirement and judging criterion.)*

---

## Stock Watchlist — a smart market watchlist that shows what meaningfully changed since you last checked

**Most watchlists show you prices. Prices aren't change** — they're raw numbers
you have to re-interpret on every single visit. The brief asks for *"what has
meaningfully changed"*, and that question is unanswerable unless the system knows
what the stock meant to **you** in the first place.

So in this app, **a watchlist item is a thesis, not a ticker**: an entry zone, an
invalidation level that would prove you wrong, a price target, and a catalyst
date. Every change is scored **relative to that thesis** — never a fixed "5% move"
rule that's meaningless for one stock and catastrophic for another.

---

### ✅ How this meets the required functionality

**1. Create and manage a watchlist**
Full CRUD via **Next.js Server Actions** (no REST layer): search-and-add any listed
ticker, attach a thesis, edit or clear any level, snooze/mute, bulk select →
categorise / mute / remove, move a bought position to a **Portfolio** section, and
export to **CSV / Google Sheets**. Items are organised into 5 buckets, each with
its own review cadence (Active setups · Developing · Long-term · Earnings watch ·
Speculative).

**2. View latest market information**
Live quotes, day change, 52-week range, P/E, market cap, next earnings date and
company news from the **Finnhub API**, plus **TradingView** charts. Four
presentation modes: Cards, sortable **Table** (General / Thesis / Performance /
Fundamentals column presets), Chart, and History. Every data point carries its
`source`, `asOf` timestamp and a `stale` flag — the UI tells you when data is
delayed instead of quietly showing a stale number.

**3. Return later and see what changed** ← *the heart of the project*
Answered in **five layers**:
- a **nav badge** with the unseen count, before you even open the page
- **"While you were away"** — changes since **your** last visit, filtered against a
  per-device watermark, not a fixed 24-hour window
- literal **was → now deltas**: `Price $63.86 → $60.14`, `Distance to entry −8.8% → −14.1%`
- a **History timeline** (24h / 7d / 30d / 90d) that keeps the full record even
  after you've reviewed it
- a **daily digest email** for when you don't come back at all

---

### 🧠 Engineering depth & problem interpretation

**The change-detection engine is a pure function.**
`detectChanges(previousSnapshot, currentSnapshot, thesis)` — no I/O, no database,
no clock (market-hours and trading-day math are injected as dependencies). That
makes it deterministic, replayable and **fully unit-tested: 12 test cases that run
with no `.env`, no database and no network.** A reviewer can validate the core of
this project in 30 seconds, before configuring anything.

**Detection is per-symbol, not per-user-per-symbol.**
Events are split into *symbol-level* (shared across everyone: news, abnormal
moves, earnings, 52-week extremes) and *thesis-level* (private per user: your
entry / invalidation / target). Detection cost therefore scales with the number of
**distinct tickers**, not `users × tickers`. Measured in the running database:
**3 users watching NVDA produced 12 shared symbol-events — one set, not one set
per user.**

**Cross-device state is monotonic.**
"Caught up" is tracked as `(userId, deviceId, symbol)` watermarks that only ever
move forward (`$max`), so your laptop can't clear your phone's badges and a slow
request can never re-hide something you've already seen. A brand-new device is
seeded from your furthest-along device instead of replaying three weeks of
history you already triaged.

**What counts as "meaningful"** — 12 change types, each scored 0–100 for severity:
price entered *your* entry zone · breached *your* invalidation · hit *your* target
(all direction-aware, so a short's levels invert) · a move abnormal **for this
stock's own volatility** (`max(5%, mean + 2σ)`) · a catalyst within 5 **trading**
days · 52-week highs/lows · valuation re-rates · earnings prints · fresh news
coverage · corporate actions · **stale-data events**.

---

### 🛡️ Resilience & edge cases

Handled deliberately, most found by running against real market data:

- **Stock splits** — a 2:1 split is numerically identical to a −50% crash.
  Round-ratio detection suppresses the false "invalidation breached" alert and
  tells you to re-check your levels instead.
- **First sighting** — a level crossing requires *both* a previous and a current
  price, so adding a stock can never fire a phantom "entered your entry zone".
- **Market hours** — abnormal-move alerts are gated on real NYSE sessions
  (`America/New_York`, with a 2025–26 holiday calendar), so an after-hours print
  isn't reported as a crash.
- **Delisted / no-quote tickers** — guarded so they never render as `$0.00`.
- **Runaway values** — P/E re-rates are bounded, after a real ticker reported
  "P/E expanded 12342%" in testing.
- **Duplicate/racing writes** — idempotent `dedupeKey` upserts mean the same
  change is never logged twice, even if the poll overlaps itself.
- **Graceful degradation** — no Google credentials hides the OAuth button; no mail
  credentials prints password-reset links to the server console; no API key marks
  data stale rather than inventing numbers.

---

### 🧹 Code quality & simplicity

**TypeScript in strict mode**, zero `tsc` errors. Clear separation: a pure engine
(`lib/changes/detect.ts`), an ingestion pipeline (`lib/watchlist/pipeline.ts`), a
single shared read path so every surface — page, digest, email — stays consistent.
No custom scheduler or queue: **Inngest** for crons and **MongoDB TTL indexes** for
bounded retention. No WebSockets — a 15-minute grain is the right resolution for a
*watchlist*, and pretending otherwise would be complexity for its own sake.

**Stack:** Next.js 15 (App Router, Server Actions, Turbopack) · React 19 ·
TypeScript · MongoDB + Mongoose · Better Auth (email/password + Google OAuth +
password reset) · Inngest · Tailwind CSS v4 + shadcn/ui · Finnhub · Nodemailer.

---

### 💡 Originality

The brief said *"don't build the obvious watchlist."* The obvious one is a price
grid with percentage columns. This one inverts the question: instead of *"what is
the price?"* it answers *"does this still deserve a place on my list, and what
changed since I last decided that?"* — including a **stale-thesis sweep** that
flags names which have gone quiet for 30+ days, so the list stays a decision tool
rather than an archive.

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
