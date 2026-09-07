# Deploying to Vercel

Your code is already on GitHub at `Sangam8168/Stock_Watchlist` (branch `master`,
in sync with local), so this is a direct import — no CLI needed.

Four things in this app *will* break on Vercel if you skip them. They're marked
**⚠️** below. Do them in this order.

---

## ⚠️ Step 0 — Open MongoDB Atlas to Vercel (do this first)

This is the single most common failure for this stack. Vercel's serverless
functions run from **rotating IP addresses**, so your Atlas cluster — which right
now almost certainly only allows your home IP — will refuse every connection.
The build itself will fail, because Next touches the DB layer while collecting
page data.

1. Go to **MongoDB Atlas → your cluster → Network Access**
2. **Add IP Address → Allow Access from Anywhere** (`0.0.0.0/0`) → Confirm

> Yes, `0.0.0.0/0` is broad. Your database is still protected by the username and
> password in the connection string. This is the standard approach for serverless
> platforms without static egress IPs. Tighten it later with Atlas's Vercel
> integration or a dedicated tier with a fixed IP if you keep the project.

Also confirm the database user has **read/write** on the `signalist` database.

---

## Step 1 — Import the repo

1. Go to **https://vercel.com/new**
2. Sign in with **GitHub** and authorise access to `Sangam8168/Stock_Watchlist`
3. Click **Import** on that repo
4. Leave the defaults — Vercel detects Next.js, Root Directory `./`, build
   command `next build`. **Don't click Deploy yet** — add the environment
   variables first (next step), because the build needs `MONGODB_URI`.

---

## ⚠️ Step 2 — Add environment variables *before* the first deploy

Expand **Environment Variables** on the import screen. Copy the values from your
local `.env`.

**Required — the build fails without these:**

| Name | Value |
|---|---|
| `MONGODB_URI` | your Atlas connection string |
| `FINNHUB_API_KEY` | your Finnhub key |
| `BETTER_AUTH_SECRET` | same long random string as local |
| `BETTER_AUTH_URL` | `https://stock-watchlist.vercel.app` — see Step 3 |
| `NEXT_PUBLIC_BASE_URL` | same production URL as above |

**Optional — features degrade cleanly without them:**

| Name | Enables |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | "Continue with Google" |
| `NODEMAILER_EMAIL` / `NODEMAILER_PASSWORD` / `EMAIL_FROM` | welcome + digest + password-reset emails |
| `GEMINI_API_KEY` | AI welcome copy and the daily news summary |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | background poll + digest crons (Step 5) |

> **Do not set `NEXT_PUBLIC_FINNHUB_API_KEY`.** Anything prefixed `NEXT_PUBLIC_`
> is inlined into the JavaScript sent to every visitor's browser — your API key
> would be publicly readable. The code reads the server-only `FINNHUB_API_KEY`
> first, which is why it's empty in your local `.env`. Keep it that way.

Then click **Deploy**.

---

## ⚠️ Step 3 — Fix the URL variables after the first deploy

`BETTER_AUTH_URL` must exactly match the origin the site is served from, or
sign-in will fail — the auth cookies and OAuth callbacks are built from it. You
can't know the final URL until the first deploy finishes, so:

1. When the deploy completes, copy the production domain Vercel shows you
   (something like `https://stock-watchlist-xyz123.vercel.app`)
2. **Settings → Environment Variables**, update **both**:
   - `BETTER_AUTH_URL` → that exact URL
   - `NEXT_PUBLIC_BASE_URL` → that exact URL
3. **Deployments → ⋯ on the latest → Redeploy**

No trailing slash. Must be `https://`.

---

## ⚠️ Step 4 — Add the production Google OAuth callback (only if using Google sign-in)

Google rejects any redirect URI it hasn't been told about.

1. **https://console.cloud.google.com/apis/credentials** → your OAuth 2.0 Client
2. Under **Authorised redirect URIs**, click **Add URI**:

```
https://<your-vercel-domain>/api/auth/callback/google
```

3. Keep the existing `http://localhost:3000/...` entry so local dev still works
4. **Save** (changes can take a few minutes to propagate)

---

## Step 5 — Connect Inngest for the background jobs (optional)

Without this the app works fine — the in-app **Refresh** button fetches on
demand — but the 15-minute poll and the daily digest email won't run on their own.

1. **https://app.inngest.com** → your app → **Deploy / Sync new app**
2. Give it your endpoint:

```
https://<your-vercel-domain>/api/inngest
```

3. Make sure `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are set in Vercel
   (Step 2) and that you've redeployed since adding them

Registered schedules: poll `*/15 * * * *`, digest `30 12 * * 1-5`,
stale-thesis sweep `0 13 * * 1-5`, news `0 12 * * *`.

---

## Step 6 — Verify the deployment

Walk this in the browser on the live URL:

1. **`/sign-up`** → create an account → you should land on the dashboard
   *(if this hangs or 500s, it's almost always Step 0 — the Atlas IP allowlist)*
2. **`/watchlist`** → **Load demo watchlist** → 8 theses appear
3. **Simulate "while you were away"** → the digest panel fills with ranked changes
4. **Mark all reviewed** → the nav badge clears
5. **Refresh** → pulls live quotes from Finnhub
6. If you configured mail: **Email me this** → the toast names the destination
   address, and the digest arrives there

---

## If something breaks

| Symptom | Cause |
|---|---|
| Build fails: `MONGODB_URI must be set within .env` | Env vars weren't added before deploying — add them, redeploy |
| Build fails or pages 500 with a Mongo timeout | **Step 0** — Atlas is blocking Vercel's IPs |
| Sign-in redirects in a loop, or the session doesn't stick | `BETTER_AUTH_URL` doesn't exactly match the live origin (**Step 3**) |
| Google sign-in: `redirect_uri_mismatch` | **Step 4** — callback URL not registered |
| Prices show as `—` everywhere | `FINNHUB_API_KEY` missing or over its rate limit |
| No digest emails | Gmail app password missing, or the account you're signed in as has an undeliverable address |
| Crons never fire | Inngest app not synced to the production `/api/inngest` URL |

**Reading logs:** Vercel → your project → **Logs** (runtime) or the specific
deployment → **Building** (build output). The Mongo and auth errors above all
surface there with clear messages.

---

## Note on secrets

Your `.env` is correctly gitignored, so nothing sensitive reached GitHub. But the
credentials in it have been on disk in a duplicate file (`.env 2`) — if you want
to be careful before making the project public, rotate the Finnhub key, the Atlas
password, and the Gmail app password, and put the fresh values in Vercel rather
than reusing the old ones.
