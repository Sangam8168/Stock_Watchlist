<div align="center">
  <h1>Stock Watchlist — a smart market watchlist</h1>
  <p><b>Don't just track stocks. See what has <i>meaningfully changed</i> since you last checked — and what deserves your attention now.</b></p>

  <p>
    <img src="https://img.shields.io/badge/-Next.js%2015-black?style=for-the-badge&logo=next.js&logoColor=white"/>
    <img src="https://img.shields.io/badge/-TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
    <img src="https://img.shields.io/badge/-MongoDB-00A35C?style=for-the-badge&logo=mongodb&logoColor=white"/>
    <img src="https://img.shields.io/badge/-Inngest-black?style=for-the-badge&logo=inngest&logoColor=white"/>
    <img src="https://img.shields.io/badge/-Better%20Auth-black?style=for-the-badge&logo=betterauth&logoColor=white"/>
    <img src="https://img.shields.io/badge/-Tailwind%20CSS-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white"/>
  </p>
</div>

---

## The idea

A watchlist isn't a list of tickers — it's a list of **theses**. Each item you add
has a one-sentence reason, an entry band, a level that would prove you wrong, and
a catalyst date. A change is only **meaningful** relative to *that* thesis:

- you've entered the entry zone you were waiting for
- price broke your invalidation level (long) or ran through it (short)
- the move is large **for this stock's own volatility** — not a fixed %
- a catalyst is within 5 trading days
- new coverage, a 52-week extreme, a valuation re-rate, an earnings print

When you come back, the app shows a ranked **"While you were away"** digest —
plain-English reasons, per-device "caught up" tracking so your phone and laptop
don't clear each other's badges — and the same feed goes out as a daily email.

100-word pitch: **[PITCH.md](PITCH.md)** · Full design write-up:
**[ARCHITECTURE.md](ARCHITECTURE.md)** · Scaling notes: **[SCALING.md](SCALING.md)**

---

## Requirement coverage

| Requirement | Where |
|---|---|
| Create & manage a watchlist | `/watchlist`, `lib/actions/watchlist.actions.ts` — add / remove / edit thesis, 5 categories with review cadences, search-to-add |
| View latest market information | `lib/actions/market-data.actions.ts` — 15-min poll → per-symbol snapshots (price, day %, 52-wk range, P/E, market cap, next earnings, news); TradingView charts on the dashboard and stock pages |
| Return later & see what changed | `lib/changes/detect.ts` (pure, unit-tested engine) + per-device `SeenState` + "While you were away" digest + `Change history` timeline + daily email — see below |

### "Return later and see what changed", in five layers

This is the requirement the whole app is built around, so it's answered more than once:

1. **Before you open it** — the nav badge (`WatchlistNavLink` → `getUnseenCount`) counts unseen events, so you know something moved without loading the page.
2. **What's new since *you* last looked** — the *While you were away* panel. Events are filtered against your `(userId, deviceId, symbol)` watermark, not a fixed window, so it's genuinely "since your last visit" — `You last checked Tuesday at 09:15 — 3h ago · 6 updates across 3 names`.
3. **The literal was → now** — each group carries `deltas`: the last snapshot taken *at or before* your watermark diffed against the current one. `Price $63.86 → $60.14`, `Distance to entry −8.8% → −14.1%`, `P/E`, `Articles (5d)`. Coloured against your thesis direction (a short's drop is green; a widening gap to entry is red even though the number fell).
4. **The full record** — the **History** view (`ChangeHistory`) is the chronological feed over 24h / 7d / 30d / 90d, grouped by day, *including events you've already reviewed*. The digest empties as you triage it; the history never does.
5. **When you don't come back** — the daily Inngest digest email, plus `flagStaleThesesDaily`, which nudges theses you haven't reviewed in a while.

Marking things seen is explicit (`Mark all reviewed` / per-symbol `Reviewed`), and watermarks only ever move forward (`$max`), so two devices can't hide events from each other. A brand-new device is seeded from your furthest-along device (`ensureSeenBaseline`) instead of replaying three weeks of history you already triaged on your laptop.

### Design decisions

| Question | Answer |
|---|---|
| What counts as a meaningful change | Relative to your thesis, scored 0–100 — see the table in `ARCHITECTURE.md` |
| State across sessions / devices | Server-side `(userId, deviceId, symbol)` watermarks, monotonic `$max` updates |
| Stale / delayed / conflicting data | `source` + `asOf` + `stale` on every snapshot; intraday-move alerts gated on market hours; `unconfirmedFields` when two provider endpoints disagree |
| Scale | Ingestion deduped across users (one fetch per symbol), append-only TTL-bounded snapshot series, materialized change feed — page loads never hit the data provider |
| Simple vs. complex | One ~200-line detection module, Inngest + Mongo TTL indexes instead of a separate scheduler/queue, no websockets (15-min grain is right for a *watchlist*) |

---

## Tech stack

- **Next.js 15** (App Router, Server Actions) · **TypeScript**
- **MongoDB** + **Mongoose** — `watchlist`, `snapshots`, `changeevents`, `seenstates`
- **Better Auth** — email/password
- **Inngest** — the 15-min ingestion + detection cron, the daily digest, housekeeping
- **Finnhub** — market data (free tier is enough)
- **Tailwind CSS** + Radix primitives
- **Gemini** / **Nodemailer** — welcome + digest emails (optional for the watchlist itself)

---

## Quick start

**Prerequisites:** Node 20+ (uses native TS type-stripping for tests) and a MongoDB
you can reach — a local `mongod` or a free Atlas cluster.

```bash
npm install
cp .env.example .env       # fill in the four required values below
npm run dev                # → http://localhost:3000
```

Only **four** variables are required. Everything else is optional and the app
degrades cleanly without it (see *Running with less* below).

| Variable | Where to get it |
|---|---|
| `MONGODB_URI` | local `mongodb://127.0.0.1:27017/watchlist`, or an Atlas connection string |
| `FINNHUB_API_KEY` | free key at [finnhub.io](https://finnhub.io) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |

Then: **sign up → `/watchlist` → "Load demo watchlist" → "Simulate while you were
away"**. That runs the real detection engine over synthetic prices, so the digest
lights up immediately — no waiting for market hours, and it works even before the
background poll has captured any history.

To exercise the scheduled poll and the digest cron, run the Inngest dev server in
a second terminal (optional):

```bash
npx inngest-cli@latest dev
```

### Verify your install

These two need **no `.env`, no database and no network** — the change engine is a
pure function, so you can validate the core of the app before configuring
anything:

```bash
npm test          # 12 change-engine cases
npx tsc --noEmit  # strict typecheck
```

This one needs `MONGODB_URI` set (Next collects page data at build time, which
touches the DB layer). It fails with `MONGODB_URI must be set within .env` if you
run it too early:

```bash
npm run build
```

### Running with less

| Missing | What happens |
|---|---|
| `GOOGLE_CLIENT_ID` / `SECRET` | "Continue with Google" is hidden; email/password still works |
| `NODEMAILER_*` | No emails sent. Password-reset links print to the **server console** (`[reset-password] link for …`) so the flow is still testable |
| `GEMINI_API_KEY` | Welcome email uses static copy; the optional daily *news* summary is skipped (the watchlist digest is unaffected — it needs no LLM) |
| Inngest not running | No background poll; the in-app **Refresh** button fetches on demand |
| `FINNHUB_API_KEY` | Search returns nothing and snapshots are written with `source: finnhub:no-quote` + `stale: true`, so the UI marks the data delayed instead of showing invented numbers |

Full `.env` reference:

```env
NODE_ENV=development
NEXT_PUBLIC_BASE_URL=http://localhost:3000

FINNHUB_API_KEY=            # https://finnhub.io  (or NEXT_PUBLIC_FINNHUB_API_KEY)
MONGODB_URI=                # local mongod or MongoDB Atlas

BETTER_AUTH_SECRET=         # any long random string
BETTER_AUTH_URL=http://localhost:3000

# optional — "Continue with Google" (button appears automatically once both are set)
GOOGLE_CLIENT_ID=          # console.cloud.google.com → OAuth client
GOOGLE_CLIENT_SECRET=      # redirect URI: <BETTER_AUTH_URL>/api/auth/callback/google

# optional — emails (welcome, daily digest, password-reset link)
GEMINI_API_KEY=
NODEMAILER_EMAIL=
NODEMAILER_PASSWORD=
EMAIL_FROM="Stock Watchlist <no-reply@localhost>"
```

**Auth:** email/password + optional Google OAuth. "Forgot password" works out of the
box — with email configured the reset link is mailed; without it, the link is
printed to the server console so you can still test the flow.

### Try it

Sign in → **/watchlist** → **Load demo watchlist** → **Simulate "while you were
away"**. The simulate button runs the real detection engine on synthetic prices
so the digest lights up regardless of market hours or whether you have an API key.

---

## Tests

```bash
npm test        # change-detection engine — node:test, 12 cases
```

The engine (`lib/changes/detect.ts`) is a pure function of
`(previous snapshot, current snapshot, thesis)` — no I/O, no clock, no DB — so it
is fully unit-tested and replayable.

---

## Project map

| Area | File |
|---|---|
| Change engine (+ tests) | `lib/changes/detect.ts`, `lib/changes/detect.test.ts` |
| Ingestion + detection pipeline | `lib/watchlist/pipeline.ts` |
| Snapshot builder (Finnhub) | `lib/actions/market-data.actions.ts` |
| Market-hours / trading-day math | `lib/market.ts` |
| Watchlist reads/writes + digest | `lib/actions/watchlist.actions.ts` |
| Cron jobs | `lib/inngest/functions.ts` |
| Digest email render | `lib/watchlist/digest.ts` |
| Models | `database/models/{watchlist,snapshot,changeEvent,seenState}.model.ts` |
| UI | `app/(root)/watchlist/`, `components/watchlist/` |
| Demo helpers | `lib/actions/demo.actions.ts` |
