# Family Ledger

A shared loan/contribution tracker for you and your family — hosted on Vercel,
with data synced live through a free Supabase database. No Claude account
needed for anyone once this is deployed.

## How it works

- **Vercel** hosts the app itself (the website everyone visits).
- **Supabase** (a free hosted Postgres database) stores the shared ledger
  data — total loan amounts, interest rates, and everyone's monthly
  contributions — in one row that every visitor reads from and writes to.
- When one person saves a change, everyone else's screen updates within a
  second or two automatically (no refresh needed), via Supabase's realtime
  feature.

## Part 1 — Set up the free database (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a free account, then
   create a new project (pick any name/region; the free tier is enough for
   this).
2. Once the project is ready, open **SQL Editor** in the left sidebar, click
   **New query**, paste in the entire contents of `supabase-setup.sql`
   (included in this project), and click **Run**. This creates the `ledger`
   table and the access rules it needs.
3. Turn on realtime for the table. The included `supabase-setup.sql` already
   does this for you (the last block in that file). If you ran it before
   reading this, just re-run the whole script again in the **SQL Editor** —
   it's safe to run more than once. If you'd rather do it by clicking
   instead: go to **Database → Publications**, find `supabase_realtime`,
   and toggle on the `ledger` table there (this screen has moved around
   between Supabase versions, so if you don't see "Publications" in the
   Database section's sidebar, the SQL approach above is the reliable
   fallback).
4. Go to **Project Settings → API**. You'll need two values from this page:
   - **Project URL**
   - **anon public** key (NOT the `service_role` key — that one must stay
     secret and is never used in this app)

Keep this tab open — you'll paste these two values in shortly.

## Part 2 — Run it locally first (optional, but recommended)

1. Install [Node.js](https://nodejs.org) if you don't already have it.
2. In this project folder, copy `.env.example` to `.env.local` and fill in
   the two Supabase values from above:
   ```
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
3. Install dependencies and start it:
   ```
   npm install
   npm run dev
   ```
4. Open the local address it prints (usually `http://localhost:5173`) and
   confirm the app loads and you can add a loan or a month's contribution.

## Part 3 — Deploy to Vercel

**Option A — via GitHub (recommended for future updates):**

1. Push this project to a new GitHub repository.
2. Go to [vercel.com](https://vercel.com), click **Add New → Project**, and
   import that repository. Vercel will auto-detect it as a Vite app.
3. Before deploying, open **Environment Variables** in the setup screen and
   add:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon public key
4. Click **Deploy**. Vercel gives you a live `https://your-app.vercel.app`
   link when it's done.

**Option B — via the Vercel CLI (quicker one-off deploy):**

1. `npm install -g vercel`
2. From this project folder: `vercel login`, then `vercel`
3. Follow the prompts (accept the defaults for a Vite app).
4. Add the environment variables either when prompted, or afterwards via
   `vercel env add VITE_SUPABASE_URL` and `vercel env add VITE_SUPABASE_ANON_KEY`.
5. Run `vercel --prod` to deploy to your production URL.

## Part 4 — Add it to everyone's iPhone Home Screen

1. Send the `https://your-app.vercel.app` link to your family.
2. Each person opens it in **Safari**.
3. Tap the **Share** button → **Add to Home Screen**.

It'll now sit on their home screen with its own icon and open full-screen,
with no browser bar and no Claude sign-in — and every edit syncs to
everyone else automatically.

## A note on security

This app has no login system — everyone with the link can view and edit the
ledger, using a public "anon" database key that's visible to anyone who
inspects the app's files. That's a reasonable trade-off for a private family
tool shared only with people you trust, but don't put anything more
sensitive than loan/contribution figures into it. If you'd ever like a login
step added (so only invited family members can open it), that's a
reasonably small addition using Supabase's built-in authentication — just
ask.
