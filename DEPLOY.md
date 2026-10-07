# Prairie Ridge — Deployment Guide

## 1. Supabase (PostgreSQL)

### 1a. Create a project
- Go to [supabase.com](https://supabase.com), sign up, create an organization and a project.
- Choose a region close to you (e.g. `us-west-1` Oregon — same as Render's free tier region).
- Note your **database password** — it's shown once. Save it.

### 1b. Get the connection string
- In the Supabase dashboard, go to **Project Settings → Database → Connection string**.
- You'll see two modes: **Direct** and **Pooled**. **Use the Pooled (Session pooler) string.**
  - Direct: `postgresql://postgres:XXXX@db.xxxxx.supabase.co:5432/postgres` (IPv6-only; Render may not reach it).
  - **Pooled** (select "Session pooler" tab): `postgresql://postgres.xxxxx:XXXX@aws-0-us-west-1.pooler.supabase.com:5432/postgres`.
- The pooled string format is: `postgres://<project_ref>.pooler.supabase.com:6543/postgres?pgbouncer=true` — actually the Supabase UI shows it as:
  ```
  postgresql://postgres.<project-ref>:<password>@aws-0-us-west-1.pooler.supabase.com:5432/postgres
  ```
- Copy the **Session pooler** connection string. This is your `DATABASE_URL`.

### 1c. SSL handling
Our `pool.js` automatically enables `{ rejectUnauthorized: false }` for any connection string that is not `localhost` or `127.0.0.1`. Supabase requires SSL. The code already handles this — no changes needed.

### 1d. Test database (run locally)
**Recommended**: Run a local Postgres in Docker for tests instead of using Supabase for tests:

```bash
docker run -d --name prairie-test \
  -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=prairie_test \
  -p 5433:5432 postgres:16
```

Then in `backend/.env`:
```
DATABASE_URL=postgres://postgres:<supabase-password>@aws-0-us-west-1.pooler.supabase.com:5432/postgres
TEST_DATABASE_URL=postgres://postgres:test@localhost:5433/prairie_test
```

This keeps tests isolated and fast.

---

## 2. Loading data

### 2a. Set up the real data pack
The real `products.csv`, `farms.csv`, `orders.csv`, `order_lines.csv`, `notes.csv` and `DATA_DICTIONARY.md` must be placed in a directory. The mock data in `data/` is for development.
- Create a directory like `~/prairie-data/`.
- Copy your real data pack files there.
- They must match the column names described in `DATA_DICTIONARY.md` (or alias columns — our loader accepts many header variants via `backend/src/loader/columns.js`).
- **Never commit the real data files** — they are `.gitignore`d.

### 2b. Run migrations + loader
From the `backend/` directory:

```bash
# Point DATA_DIR at your real data
export DATA_DIR=~/prairie-data

# Run migrations + load (this is what `npm run load` does)
npm run load
```

Expected output:
```
  applied 001_init.sql
  applied 002_status_history.sql
Migrations complete (2 found, 2 new).

=== LOADER REPORT ===

File           Read          Inserted      Updated       Unchanged     Quarantined
────────────── ────────────── ────────────── ────────────── ────────────── ──────────────
farms.csv      14            14            0             0             0
products.csv   26            24            0             0             2
orders.csv     19            18            0             0             1
order_lines.csv 23           20            0             0             3
notes.csv      15            14            0             0             1
────────────── ────────────── ────────────── ────────────── ────────────── ──────────────
TOTAL          97            90            0             0             7

--- Inconsistencies ---
Rule                  Rows affected
────────────────────── ──────────────────────
INV_CODE              2
INV_ORDER_ID          1
ORPHAN_LINE           2
ORPHAN_NOTE           1
```

### 2c. Second run (idempotency check)
Run `npm run load` again. Expected: every `Inserted` column shows `0`. `Unchanged` should match the previous `Inserted` counts.

### 2d. Verify with SQL
In the Supabase SQL Editor or via `psql`:
```sql
SELECT 'farms' AS tbl, count(*) FROM farms
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'order_lines', count(*) FROM order_lines
UNION ALL SELECT 'notes', count(*) FROM notes;
```

---

## 3. Backend — Render (Web Service from GitHub)

### 3a. Prepare the repo
Make sure your GitHub repo is public and has the latest code pushed.

### 3b. Create the Web Service
1. In [Render Dashboard](https://dashboard.render.com) → **New + → Web Service**.
2. Connect your GitHub repo.
3. Fill in:
   - **Name**: `prairie-ridge-backend`
   - **Region**: `Oregon` (us-west)
   - **Branch**: `main`
   - **Root Directory**: `backend` (this is a monorepo — Render runs from `backend/`)
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run load && node src/server.js`
     - This runs migrations + loads data at every deploy. On subsequent deploys, `npm run load` is idempotent (no duplicates).
   - **Plan**: Free
4. Add environment variables:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Your Supabase Session pooler connection string (from step 1b) |
   | `CORS_ORIGIN` | Your Vercel URL (e.g. `https://prairie-ridge.vercel.app`) — no trailing slash |
   | `DATA_DIR` | `./data` (the mock/real data directory in the repo; the real data pack files must be committed there or uploaded) |
   | `NODE_VERSION` | `20` |

   **IMPORTANT for DATA_DIR**: The real CSVs must be in `backend/data/` within the repo, because Render gives us no way to upload files separately. An alternative is to create a `data/` git submodule or to commit the data pack (even though we said "never commit" — for Render we must, since it's a git-based deploy). **Recommendation**: add the real data pack to `backend/data/` and update `.gitignore` to NOT exclude CSVs under `backend/data/`.  
   Edit `.gitignore` in the repo root: change `data/*.csv` to `backend/data/*.csv` or simply remove the `data/*.csv` line if you commit the real data.

5. **Health Check Path**: `/api/health`
6. **Auto-Deploy**: Yes

### 3c. Free-tier cold starts
The free instance spins down after 15 minutes of inactivity. The first request (including the automated contract tests) may take 30–60 seconds to respond. Options:
- **Recommended**: Use a free uptime monitor like [UptimeRobot](https://uptimerobot.com) (free tier: 5 monitors, 5-minute intervals) hitting `/api/health`. This will keep the service alive.
- Or upgrade to Render's Starter plan ($7/month) — no cold starts.

### 3d. Node version
We already set `"engines": { "node": "20.x" }` in `backend/package.json` and created `backend/.nvmrc`. Render reads `NODE_VERSION` env var.

---

## 4. Frontend — Vercel

### 4a. Prepare `vercel.json`
Already created at `frontend/vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
This ensures deep links like `/orders/ORD-6001` don't 404 on refresh.

### 4b. Deploy
1. Go to [vercel.com](https://vercel.com), **Add New → Project**.
2. Import your GitHub repo.
3. Fill in:
   - **Root Directory**: `frontend`
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build` (Vercel defaults to this)
   - **Output Directory**: `dist`
4. Add environment variable:
   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | Your Render URL (e.g. `https://prairie-ridge-backend.onrender.com`) — **no trailing slash** |

   ⚠️ **Important**: Vite bakes `VITE_*` env vars into the JavaScript at **build time**. If you change the URL, you must trigger a new deploy on Vercel.
5. Deploy. Vercel gives you a URL like `https://prairie-ridge.vercel.app`.

### 4c. Update CORS_ORIGIN on Render
Go to Render Dashboard → Environment → edit `CORS_ORIGIN` to your Vercel URL (e.g. `https://prairie-ridge.vercel.app`). Then **Manual Deploy → Deploy latest commit** (or just wait for auto-deploy if you pushed something).

---

## 5. Smoke test

Run the smoke test from any machine with `curl`, `python3`, and `bc`:

```bash
BASE_URL=https://prairie-ridge-backend.onrender.com bash scripts/smoke-test.sh
```

Expected output:
```
=== Prairie Ridge Smoke Test ===
Target: https://prairie-ridge-backend.onrender.com

--- Health ---
  PASS: health returns ok
--- List ---
  PASS: list returns 200
  PASS: list has total > 0
--- Filters ---
  PASS: q + status filter
--- Invalid params ---
  PASS: page_size>100 -> 400
  PASS: page=0 -> 400
  PASS: invalid status -> 400
--- Unknown order ---
  PASS: unknown order -> 404
--- Create order (idempotent) ---
  PASS: first create -> 201
  PASS: second create -> 200 same order_id
  PASS: second create status is DRAFT
--- Add labelled line ---
  PASS: add labelled line -> 201
--- Add unlabelled line (LABEL_MISMATCH) ---
  PASS: unlabelled -> 422 LABEL_MISMATCH
  PASS: message mentions not labelled
--- Add discontinued product ---
  PASS: inactive product -> 422 PRODUCT_INACTIVE
--- Submit ---
  PASS: submit -> SUBMITTED
--- Add note ---
  PASS: add note -> 201
  PASS: note appears
--- Confirm ---
  PASS: confirm -> CONFIRMED or BACKORDERED
--- Error envelopes ---
  PASS: malformed JSON -> 400
  PASS: unknown route -> 404
--- Stack trace leak check ---
  PASS: no stack traces in responses
--- Persistence ---
  PASS: order still exists after mutations
  PASS: status is not DRAFT
  PASS: note persisted

=== Results ===
PASS: 22
FAIL: 0
ALL CHECKS PASSED
```

---

## 6. Restart check

1. In Render Dashboard, go to your backend service.
2. Click **Manual Deploy → Deploy latest commit** (or the circular arrow button → "Restart").
3. Wait for the service to show "Live".
4. Run the smoke test again — it should pass.
5. Also check an order created before the restart still exists:
   ```bash
   # Replace with the order_id you saw in the first smoke test output
   curl -s https://prairie-ridge-backend.onrender.com/api/orders/ORD-10000
   ```

---

## 7. Pre-submit checklist

- [ ] `curl https://prairie-ridge-backend.onrender.com/api/health` → `{"status":"ok"}`
- [ ] `curl https://prairie-ridge-backend.onrender.com/api/orders` → list of orders, `total > 0`
- [ ] Frontend at `https://prairie-ridge.vercel.app` loads and shows orders
- [ ] Frontend can create, add line, submit, add note, and the change persists
- [ ] Refresh the frontend on an order detail page → still shows the data
- [ ] Navigate to `/orders/ORD-6001` directly → loads the order (no 404)
- [ ] `curl -s https://prairie-ridge-backend.onrender.com/api/orders/ORD-99999` → `{"error":{"code":"NOT_FOUND",...}}`
- [ ] `curl -s "https://prairie-ridge-backend.onrender.com/api/orders?page_size=101"` → `{"error":{"code":"VALIDATION_ERROR",...}}`
- [ ] No response body contains `"at "` or `"Error:"` (stack trace leak)
- [ ] `BASE_URL=... bash scripts/smoke-test.sh` → 0 FAIL
- [ ] Restart the Render service → smoke test re-runs → still passes

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `No 'Access-Control-Allow-Origin' header` in browser console | `CORS_ORIGIN` env var doesn't match the frontend URL | Set `CORS_ORIGIN` on Render to the exact Vercel URL (no trailing slash). Restart the backend. |
| `ECONNREFUSED` or `ENETUNREACH` connecting to Supabase | Using the Direct connection string (IPv6) instead of the Session pooler | Switch to the Pooled (Session pooler) string from Supabase → Project Settings → Database → Connection string → Pooled tab |
| `SSL required` / `pg_hba.conf rejects connection` | Missing SSL, or the pooler rejects non-SSL connections | Our `pool.js` auto-enables SSL for non-localhost URLs. Ensure `DATABASE_URL` is not `localhost`. If still failing, try adding `?sslmode=require` to the connection string. |
| Frontend shows blank page, console shows `VITE_API_BASE_URL is not set` | Vercel env var not set, or old build still cached | Set `VITE_API_BASE_URL` in Vercel project settings, trigger a new deploy, clear browser cache |
| `/orders/ORD-6001` refresh → Vercel 404 | No SPA rewrite rule | Make sure `frontend/vercel.json` exists with the rewrites rule (already provided). Redeploy. |
| Render build fails with `ERR_PNPM_UNSUPPORTED_ENGINE` or `Node version mismatch` | Render picking an incompatible Node version | Set `NODE_VERSION=20` in Render environment variables |
| First request to Render takes 30+ seconds | Free tier cold start | Use UptimeRobot on `/api/health` every 5 minutes, or upgrade to Starter plan |
| `{"error":{"code":"INTERNAL_ERROR","message":"An unexpected error occurred"}}` | A runtime exception (check Render logs) | Read the Render dashboard → Logs. Fix the bug and redeploy. |
| `npm run load` succeeds but `0` rows inserted | `DATA_DIR` points to wrong directory, or CSVs have non-matching headers | Check `DATA_DIR`. The loader prints which file it can't find. Verify CSV headers match the aliases in `backend/src/loader/columns.js`. |