# BUSSY setup — click by click

Everything you (Rohan) have to do by hand, in order. Budget about an hour the first time.
You'll end up with: a Supabase project (database + Google login + file storage), a Google OAuth
client, the code on GitHub, and the site live on Vercel.

> **Keep a scratch note open.** You'll copy six things along the way: Supabase project URL,
> anon/publishable key, service-role/secret key, database password, Google client ID, Google client secret.

---

## 0. Install the tools (once)

1. Install **Node.js 20 or newer** from <https://nodejs.org> (the LTS button).
2. Open Terminal (Mac) or PowerShell (Windows) and run:
   ```bash
   corepack enable
   corepack prepare pnpm@9.15.0 --activate
   pnpm -v        # should print 9.x
   ```
3. Install **Git** if `git --version` doesn't print a version (<https://git-scm.com>).
4. Make free accounts at **github.com**, **supabase.com** and **vercel.com** (sign up to Vercel *with GitHub*).

## 1. Unzip and install

```bash
cd ~/Downloads            # wherever you saved bussy.zip
unzip bussy.zip
cd bussy
pnpm install              # creates pnpm-lock.yaml — keep it, Vercel uses it
cp .env.example .env.local
```

## 2. Create the Supabase project

1. <https://supabase.com/dashboard> → **New project**.
2. Organization: yours. **Name:** `bussy`. **Database password:** click *Generate*, then **copy it to your note**.
3. **Region:** *East US (North Virginia)* — Vercel is set to run in the same place (`iad1`), which keeps pages fast.
4. Click **Create new project** and wait ~2 minutes.
5. Left sidebar → **Project Settings** (gear) → **Data API**: copy **Project URL**
   (looks like `https://abcdxyz.supabase.co`). The part before `.supabase.co` is your **project ref**.
6. **Project Settings → API Keys**: copy the **anon / publishable** key and the **service_role / secret** key.
   (Newer projects show *Publishable* and *Secret* keys instead of *anon* and *service_role*; use those.)
7. Open `.env.local` in any text editor and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://abcdxyz.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<service_role or secret key>
   BOOTSTRAP_ADMIN_EMAILS=<matthew's gmail>,<sid's gmail>,<your gmail>
   ```
   The bootstrap emails must be the **exact Google accounts** the three of you will sign in with.

## 3. Create the database tables

Pick **one** of these.

**A. Command line (recommended — repeatable):**
```bash
npx supabase login                         # opens a browser; approve it
npx supabase link --project-ref abcdxyz    # your project ref; paste the DB password when asked
npx supabase db push                       # runs every file in supabase/migrations, in order
```
You should see six migrations applied (`…_schema`, `…_functions`, `…_rls`, `…_storage`, `…_views`, `…_seed`).

**B. No command line:** Supabase dashboard → **SQL Editor** → **New query**. Open each file in
`supabase/migrations/` **in filename order**, paste the whole file, click **Run**. Do all six.

**Check it worked:** dashboard → **Table Editor** shows `requests`, `profiles`, `vendors`, … and
`vendors` has 24 rows. **Storage** shows two buckets: `receipts` and `esl-exports`.

## 4. Create the Google sign-in client

1. Go to <https://console.cloud.google.com>. Top bar → project picker → **New project** → name `BUSSY` → **Create**,
   then make sure `BUSSY` is selected in the top bar.
2. Left menu (☰) → **APIs & Services → OAuth consent screen** (Google may call this **Google Auth Platform**).
   Click **Get started**:
   - **App name:** `BUSSY` · **User support email:** your email → **Next**
   - **Audience:** **External** → **Next**
   - **Contact information:** your email → **Next** → agree → **Create**
3. Still in Google Auth Platform → **Audience** → under *Publishing status* click **Publish app** → **Confirm**.
   (BUSSY only asks for name + email, so Google doesn't need to review it. If you skip this, only people you list
   as *test users* can sign in.)
4. **Clients** → **Create client**:
   - **Application type:** *Web application* · **Name:** `BUSSY web`
   - **Authorized JavaScript origins:** add `http://localhost:3000`
     (you'll add the Vercel address in step 8)
   - **Authorized redirect URIs:** add `https://abcdxyz.supabase.co/auth/v1/callback`
     (your project ref — copy the exact value shown in Supabase's Google provider panel in the next step)
   - **Create**. Copy the **Client ID** and **Client secret** to your note.

## 5. Turn on Google login in Supabase

1. Supabase dashboard → **Authentication → Sign In / Providers** → **Google**.
2. Toggle **Enable Sign in with Google** on. Paste **Client ID** and **Client Secret**. **Save**.
   (The *Callback URL* shown there is the one you pasted into Google in step 4.)
3. **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:3000` for now (you'll change it in step 8).
   - **Redirect URLs → Add URL:** `http://localhost:3000/**`

## 6. Run it on your laptop

```bash
pnpm dev
```
Open <http://localhost:3000> → **Continue with Google** → pick your account. Because your email is in
`BOOTSTRAP_ADMIN_EMAILS`, you land on the Dashboard as an admin. Anyone else lands on *Waiting on an admin*
until you approve them in **Users & settings**.

Quick checks: submit a test request (it gets **#1**), approve it, export it, mark it submitted, check it in on
**Package log**. Then cancel or delete it before importing real data (Raw data → open it → *Override status* →
Returned/Canceled).

## 7. Put the code on GitHub

1. github.com → **New repository** → name `bussy` → **Private** → **Create** (no README).
2. In the `bussy` folder:
   ```bash
   git init
   git add .
   git commit -m "BUSSY v2"
   git branch -M main
   git remote add origin https://github.com/<you>/bussy.git
   git push -u origin main
   ```
   `.env.local` and the `reference/` spreadsheets are git-ignored — secrets and team data never go to GitHub.

## 8. Deploy on Vercel

1. <https://vercel.com/new> → **Import** the `bussy` repo.
2. Vercel detects **Next.js** and **pnpm** automatically (from `vercel.json` and `pnpm-lock.yaml`). Leave build settings alone.
3. Open **Environment Variables** and add each of these (same values as `.env.local`):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role / secret key |
   | `BOOTSTRAP_ADMIN_EMAILS` | the three Google emails, comma-separated |
   | `NEXT_PUBLIC_ESS_FORM_URL` | ESS reimbursement form link (optional) |

4. **Deploy**. When it finishes, copy your address, e.g. `https://bussy-lhr.vercel.app`
   (Project → **Settings → Domains** lets you pick a nicer `*.vercel.app` name).
5. Tell Supabase and Google about that address:
   - Supabase → **Authentication → URL Configuration**: **Site URL** = `https://bussy-lhr.vercel.app`;
     **Redirect URLs** add `https://bussy-lhr.vercel.app/**` (keep the localhost one).
     For Vercel preview deployments also add `https://*-<your-vercel-team>.vercel.app/**`.
   - Google Cloud → **Clients → BUSSY web → Authorized JavaScript origins**: add `https://bussy-lhr.vercel.app` → **Save**.
6. Open the Vercel address and sign in. Done — every `git push` to `main` redeploys automatically.

> `NEXT_PUBLIC_*` variables are baked in at build time. If you change one in Vercel, click
> **Deployments → ⋯ → Redeploy**.

## 9. Bring in the data

Put the files in `reference/` (git-ignored), then:

```bash
# Last year → season 2025-26 (statuses come from its ESL ORDERS tab automatically)
pnpm import:forms --file reference/BUSSY_2025-2026.xlsx --season 2025-26 --dry-run   # read the report
pnpm import:forms --file reference/BUSSY_2025-2026.xlsx --season 2025-26
pnpm parity --season 2025-26                                                        # compare with the workbook

# This year's 18 responses → season 2026-27 (import these BEFORE people start using the new form,
# so their Forms IDs 1–18 keep the same request numbers)
pnpm import:forms --file reference/BUSSY_2026-2027_responses.xlsx --season 2026-27 \
  --statuses reference/statuses_2026-27.csv --dry-run
pnpm import:forms --file reference/BUSSY_2026-2027_responses.xlsx --season 2026-27 \
  --statuses reference/statuses_2026-27.csv
```

`statuses_2026-27.csv` is optional and looks like:
```
legacy_form_id,status,admin_notes
1,Received,
2,Submitted to ESL,invoice 3283
3,Approved by TC/CE,
```
Without it, imported rows start as *Pending review*. You can also do all of this from the browser:
**Users & settings → Import** (same code; leave *Dry run* ticked the first time).

Last: **Users & settings → Season** — confirm the 2026-27 start date (seeded as 2026-08-30) and enter
**Budgets**.

## 10. Troubleshooting

| You see | Fix |
|---|---|
| Google says `redirect_uri_mismatch` | The redirect URI in Google must be exactly `https://<ref>.supabase.co/auth/v1/callback`. |
| After Google you land back on `/login?error=auth` | Supabase → URL Configuration is missing your site in **Redirect URLs** (include the `/**`). |
| You're an admin but stuck on "Waiting on an admin" | Your email isn't exactly in `BOOTSTRAP_ADMIN_EMAILS`, or `SUPABASE_SERVICE_ROLE_KEY` is missing in Vercel. Fix it, redeploy, sign out and back in. Or in Supabase **Table Editor → profiles**, set your row's `access_status` = `approved`, `role` = `admin`. |
| `relation "public.request_view" does not exist` | Migrations didn't run — redo step 3. |
| Vercel build fails at install | Commit `pnpm-lock.yaml` (run `pnpm install` locally first). |
| Vercel blocks the deploy for a vulnerable Next.js version | `pnpm up next eslint-config-next react react-dom`, commit, push. |
| Receipt upload says "new row violates row-level security" | The signed-in user isn't approved yet, or the storage migration didn't run. |
| Package/approval counts look stale | Refresh — pages always load fresh data, but an open tab doesn't update by itself. |

## Local Supabase (optional, for developers)

`npx supabase start` runs Postgres + Auth + Storage in Docker with all migrations applied.
Put its printed URL/keys in `.env.local`, and add your Google client to `supabase/.env`:
```
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=...
```
(add `http://127.0.0.1:54321/auth/v1/callback` to the Google client's redirect URIs). `pnpm test:db` runs the RLS tests.
