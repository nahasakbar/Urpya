# Ledger

A personal tracker for debts and income — bank loans, family loans,
moneylender plans, rent, businesses — with a payoff Strategy. Each person has
their own account, and any debt or income source can be shared with other
people to manage it together. Hosted on Vercel, with data in a free Supabase
database.

## How it works

- **Vercel** hosts the app (the website everyone opens).
- **Supabase** stores the data and handles sign-in. Everyone signs in with a
  6-digit code sent to their email — no passwords.
- Each debt, income source and monthly entry is saved separately, with a
  version number, so two people editing at once never silently overwrite
  each other. Every change is recorded in a history (who, what, when), every
  save can be undone, and deleted items can be restored.
- Access rules in the database make sure people only ever see their own items
  and what's been shared with them. Signed-out visitors see nothing.
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
     `Ledger`, host = `smtp.gmail.com`, port = `465`, username = the Gmail
     address, password = the app password. Save.
3. **Make the sign-in email show a code.** On the same **Authentication →
   Emails** page, change both the **Magic link or OTP** and the **Confirm
   sign up** templates to:
   - Subject: `Your Ledger sign-in code`
   - Body:
     ```html
     <h2>Your Ledger sign-in code</h2>
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

## On an iPhone

Open the link in **Safari**, tap **Share → Add to Home Screen**. It opens
full-screen like an app. **Account → Add due dates to my calendar** puts each
debt's due date in the iPhone Calendar with an alert the day before.
