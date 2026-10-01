# Kaayi

A personal tracker for debts and income — bank loans, family loans,
moneylender plans, rent, businesses — with a payoff plan. Each person has
their own account, and any debt or income source can be shared with other
people to manage it together. Made by Paradox Dynamics. It runs as a website
(hosted on Vercel) and as an iPhone app, with data in Supabase.

## How it works

- **Vercel** hosts the app (the website everyone opens).
- **Supabase** stores the data and handles sign-in: email and password, or
  Google. A new account confirms its email with a 6-digit code, and a
  forgotten password is reset with one (codes rather than links, so it works
  the same in a browser, a Home Screen icon or a future app).
- Each debt, income source and monthly entry is saved separately, with a
  version number, so two people editing at once never silently overwrite
  each other. Every change is recorded in a history (who, what, when), every
  save can be undone, and deleted items can be restored.
- Access rules in the database make sure people only ever see their own items
  and what's been shared with them. Signed-out visitors see nothing.
- Anyone can sign up. Each person picks their currency (it only changes the
  symbol; nothing is converted), can read a plain privacy note, download a
  backup, and delete their account and everything they own.
- The calculations are checked by automatic tests (`npm test`), which also run
  before every build — a change that breaks the sums can't be deployed.

## Upgrading from the old shared family ledger (one time)

Do these in order. Nothing in the old ledger is changed until step 5.

1. **Create the new tables.** In Supabase, open **SQL Editor → New query**,
   paste the whole of `supabase/accounts-setup.sql`, and click **Run**. It
   only adds new tables; the app you're using now keeps working.
2. **Connect an email sender.** Supabase's built-in email only sends to
   people on your Supabase team, at 2 emails an hour, and its templates
   can't be edited. So connect a Gmail account (ideally a new one just for
   the app) as the sender:
   - In that Google account, turn on **2-Step Verification**, then open
     [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords),
     create an app password named "Supabase" and copy it.
   - In Supabase, open **Authentication → Emails → Set up SMTP**, switch on
     custom SMTP and fill in: sender email = the Gmail address, sender name =
     `Kaayi`, host = `smtp.gmail.com`, port = `465`, username = the Gmail
     address, password = the app password. Save.
3. **Make the sign-in email show a code.** On the same **Authentication →
   Emails** page, change both the **Magic link or OTP** and the **Confirm
   sign up** templates to:
   - Subject: `Your Kaayi sign-in code`
   - Body:
     ```html
     <h2>Your Kaayi sign-in code</h2>
     <p>Enter this code in the app to sign in:</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
     <p>It expires in an hour. If you didn't ask for it, you can ignore this email.</p>
     ```
   (The `{{ .Token }}` part is what puts the code in the email. Sign-in links
   don't work well in the Home Screen app, so the app uses codes.)
4. **Update the app** (Claude uploads it), then open it, sign in with your
   email and the code, and tap **Import it** on the welcome screen. It shows
   whether the total still owed matches the old ledger exactly. Only one
   person imports; anyone else who signs in afterwards is told to ask you to
   share items with them. Do this when nobody is recording payments in the
   old app — anything recorded there after the import won't come across.
5. **Lock the old ledger.** Once you're happy everything came across, run
   `supabase/lock-old-ledger.sql` the same way as step 1. After this, the old
   copy can't be read or changed through the app's link any more — it stays in
   Supabase as a backup.
6. **Share.** Open any debt or income source → **Sharing** → enter someone's
   email → **Can edit** or **View only** → **Share**, then send them the
   invite. They sign in with that email and it appears for them.

If a sign-in code doesn't arrive: check spam, wait a minute and try again.
Supabase also caps how many sign-in emails go out per hour (you can raise
it under **Authentication → Rate Limits**). If none arrive at all, recheck the
SMTP settings from step 2; the Gmail account's inbox may also have a
warning from Google.

## Sign-in setup

1. **Email templates** (Supabase → Authentication → Emails). Each needs the
   code, `{{ .Token }}`, rather than a link:
   - **Confirm sign up** (new accounts). Subject `Confirm your Kaayi
     account`; body:
     ```html
     <h2>Confirm your Kaayi account</h2>
     <p>Enter this code in the app to confirm your email:</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
     <p>It expires in an hour. If you didn't sign up, you can ignore this email.</p>
     ```
   - **Reset password**. Subject `Reset your Kaayi password`; body:
     ```html
     <h2>Reset your Kaayi password</h2>
     <p>Enter this code in the app, then choose a new password:</p>
     <p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
     <p>It expires in an hour. If you didn't ask for it, you can ignore this email.</p>
     ```
   Accounts made before passwords existed sign in the first time with
   **Forgot password?**, which sets their password.

   Supabase sometimes can't load a saved template and sends its own
   original email, with a link instead of a code. The link works too: it
   opens Kaayi signed in (or, from a password reset, on "Set a new
   password"). For that, step 2 below must be done.
2. **Set the app's address** (Supabase → Authentication → URL
   Configuration): **Site URL** = the app's address (e.g.
   `https://yourapp.vercel.app`), and add the same address under **Redirect
   URLs**. Otherwise email links (and Google) go to `localhost` and look
   broken.
3. **Keep "Confirm email" on** (Authentication → Sign In / Providers →
   Email). Sharing is by email address, so an address must be proven before
   it can see what's shared with it.
4. **Google (optional).** The button appears by itself once Google is
   switched on in Supabase:
   - In [Google Cloud Console](https://console.cloud.google.com), create a
     project, then **APIs & Services → OAuth consent screen**: External, app
     name `Kaayi`, your email as support and developer contact; publish it
     ("In production").
   - **Credentials → Create credentials → OAuth client ID → Web
     application.** Under **Authorized redirect URIs** add
     `https://<your-project>.supabase.co/auth/v1/callback` (Supabase shows
     this exact address on its Google page). Create, then copy the **Client
     ID** and **Client secret**.
   - In Supabase → **Authentication → Sign In / Providers → Google**: switch
     it on, paste the Client ID and secret, save.

## Opening it to everyone

For when people outside the family start using it:

1. **Update the database.** Run the whole of `supabase/accounts-setup.sql`
   again (SQL Editor → New query → paste → Run). It's safe to run again; this
   adds "Delete my account", currencies for shared items and people's own
   names. Run it again whenever this file changes.
2. **Protect your Gmail.** While codes are sent from your Gmail, strangers
   could make it send lots of emails. In Supabase, open **Authentication →
   Rate Limits** and set the limit for sending emails to about 20 an hour.
3. **Turn on the robot check** (Cloudflare Turnstile, free, no domain needed):
   - At [dash.cloudflare.com](https://dash.cloudflare.com) (free account),
     open **Turnstile → Add widget**. Name it `Kaayi`, add your app's web
     address (e.g. `yourapp.vercel.app`) as the hostname, choose
     **Managed**, and create it. It gives a **Site key** and a **Secret key**.
   - The app needs the **Site key** (it isn't secret). Kaayi's is already in
     `src/App.jsx` (`LEDGER_TURNSTILE_KEY`); a Vercel environment variable
     `VITE_TURNSTILE_SITE_KEY` would override it. On this computer
     (localhost) the check is off.
   - The iPhone app runs from the address `localhost` inside the phone. If
     its sign-in screen says "The robot check couldn't run here", add
     `localhost` to the widget's hostnames in Cloudflare too.
   - Open the live app's sign-in screen. If it says "The robot check couldn't
     run here", the web address is missing from the widget's hostnames in
     Cloudflare. Once there's no such message and you can sign in, then, and
     only then, in Supabase open
     **Authentication → Attack Protection** (called "Bot and Abuse Protection"
     in some versions), switch on **CAPTCHA protection**, choose
     **Turnstile**, paste the **Secret key** and save. Doing this before the
     app has the site key would stop everyone signing in.
4. **Later, with a domain:** a proper email sender (e.g. Resend) can replace
   Gmail. Then update the privacy note's line about Gmail.

## Setting up from scratch

1. Create a free project at [supabase.com](https://supabase.com).
2. Run `supabase/accounts-setup.sql` in **SQL Editor**, and connect an email
   sender and set the templates as in steps 2 and 3 above.
3. From **Project Settings → API**, copy the **Project URL** and the
   **anon public** key (never the `service_role` key).
4. Deploy to [vercel.com](https://vercel.com) from GitHub, with these
   environment variables:
   - `VITE_SUPABASE_URL` = the Project URL
   - `VITE_SUPABASE_ANON_KEY` = the anon public key

To run it on your computer: copy `.env.example` to `.env.local`, fill in the
same two values, then `npm install` and `npm run dev`. `npm test` runs the
checks.

## The company website

The `site` folder is Paradox Dynamics' website (home, Kaayi, Privacy, Terms
and Support), for paradoxdynamics.co.uk. It's plain web pages with no build
step. To put it online with Cloudflare Pages (free, business use allowed):

1. In Cloudflare, open **Workers & Pages → Create → Pages → Import an
   existing Git repository**, connect GitHub and choose this repository.
2. Production branch `main`. Framework preset **None**. Leave the build
   command empty. Build output directory: `site`. Save and deploy.
3. In the new project, open **Custom domains** and add
   `paradoxdynamics.co.uk`, then `www.paradoxdynamics.co.uk`.

After that, every upload to GitHub updates the website by itself, just as it
does the app.

## In Safari on an iPhone

Open the website's link in **Safari**. **Account → Add due dates to my
calendar** puts each debt's due date in the iPhone Calendar with an alert the
day before.

## The iPhone app

The app is the same code as the website, wrapped by Capacitor into a real
iPhone app. The Xcode project is in `ios/`. In the app you also get reminders
as notifications, a Face ID lock, the share sheet for invites and backups,
and little vibrations on taps and saves.

**Building it on this Mac** (needs Xcode 26, which needs macOS Sequoia 15.6
or later):

1. In Terminal, in this folder: `npm install`, then `npm run ios`. That runs
   the checks, builds the website, copies it into the iPhone project and
   opens Xcode.
2. In Xcode, pick your iPhone (plugged in) at the top, then press ▶. The
   first time, Xcode asks you to choose a **Team** under **Signing &
   Capabilities**: pick Paradox Dynamics once its developer account exists.
3. After changing the website's code, run `npm run ios` again, or the app
   keeps the old copy.

**Getting it into the App Store**, in order:

1. **D-U-N-S number** for Paradox Dynamics (free, from Dun & Bradstreet via
   Apple's lookup page; takes up to about two weeks). Apple requires money
   apps to come from a company, not a person.
2. **Apple Developer Program** as an organisation (£79 a year), using the
   company's exact registered name and the D-U-N-S number.
3. **A website domain and email** (e.g. kaayi.app and support@…). The App
   Store listing needs a public privacy policy page and a support page.
4. In **App Store Connect**, create the app with bundle ID
   `com.paradoxdynamics.kaayi`, fill in the privacy questions (Kaayi stores
   email, name and the money details you enter; nothing is used for
   tracking or ads), and add screenshots.
5. In Xcode: **Product → Archive**, then **Distribute App → App Store
   Connect**. Test it through **TestFlight** first, then submit for review.
6. When reviewing, Apple signs in to try the app. Give them a test account
   (email and password) with some sample debts in it, in the review notes.

The app icon's source is `resources/icon.svg`. The website's icons are in
`public/`.
