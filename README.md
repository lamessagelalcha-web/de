# Dembi Dolloo Online Exam System (Vercel + Postgres)

Waajjira Barnoota Magaalaa Dambi Doolloo – Grade 12 National Examination Preparation.

Static front end (`public/`) + serverless API (`api/`) + Postgres database (Neon). Students can now log in from **any computer**; all data is shared and stored in the database.

## Project layout

| Path | Purpose |
|------|---------|
| `public/` | Web pages: `index.html`, `style.css`, `app.js` (UI logic), `api.js` (API client), `pdf-import.js` (PDF reader) |
| `api/` | Serverless functions (auth, question banks, exam, results, admin) |
| `lib/` | Shared server code (database, login cookies, helpers) |
| `db/schema.sql` | Table definitions (created automatically on first request; file is for reference) |
| `vercel.json`, `package.json` | Vercel config + dependencies |

## Deploy on Vercel

1. Push this folder to a GitHub repository (or use `vercel` CLI from this folder).
2. In Vercel: **Add New > Project**, import the repo. Framework preset: **Other**. No build command needed.
3. In the project go to **Storage** (or Marketplace) > **Neon Postgres** > create a database and **connect it to the project**. This adds `DATABASE_URL` automatically.
4. Go to **Settings > Environment Variables** and add:
   - `ADMIN_PASSWORD` – the admin login password (required; no default any more)
   - `AUTH_SECRET` – a long random string (32+ characters). Generate one with `openssl rand -base64 32`.
5. **Redeploy** (Deployments > ... > Redeploy) so the variables take effect.
6. Open the site, use **Admin Login**, and import your question PDFs.

The tables are created automatically the first time the site is used.

### Run locally (optional)

```
npm install
npm i -g vercel
vercel link && vercel env pull .env.local   # downloads DATABASE_URL etc. (add ADMIN_PASSWORD and AUTH_SECRET first)
vercel dev
```

## What changed from the localStorage version

- **Database instead of localStorage**: users, question banks, in-progress exams and results are stored in Postgres.
- **Real login sessions**: signed, HttpOnly cookie (7 days). Student passwords are hashed with bcrypt (old SHA-256 hashes from the localStorage version are not migrated – students must re-register).
- **Admin password** comes from the `ADMIN_PASSWORD` environment variable, not from source code. It is checked on the server.
- **Answers are graded on the server.** The browser never receives the correct answers during an exam; they are only returned after submitting.
- **Server-side timer**: the 2-hour deadline is stored in the database, so changing the PC clock does not help and an exam resumes on any computer with the same account.
- Each answer is saved to the database as it is chosen. Submitting twice is prevented.

## PDF format

Unchanged. The PDF must contain real text (not a scanned image). Number questions from 1, options A–D, and give the answer:

```
1. What is 7 x 8?
A. 54
B. 56
C. 60
D. 50
Answer: B
```

Or put all answers at the end (`Answer Key` then `1-B  2-B  3-A ...`). PDFs are read in the admin's browser (pdf.js from cdnjs, needs internet); only the parsed questions are sent to the database.

## Notes & limits

- Free-tier Neon databases sleep when idle, so the first request after a quiet period can take a second or two.
- There is no login rate-limiting. For a public deployment consider adding Vercel Firewall rate limits on `/api/auth/login`.
- There is a single admin account (shared password). Rotate it by changing `ADMIN_PASSWORD` and redeploying.
- Existing browser data (`dd_*` localStorage keys) is not imported. Re-import question PDFs and have students register again.
