# Prairie Ridge Ag Supply — Farm Input Ordering

Full-stack ordering system: React frontend, Node.js/Express REST API, PostgreSQL (Supabase-hosted),
idempotent CSV loader. Monorepo: `/backend` (API) and `/frontend` (React + Vite + TypeScript).

- **Backend** — `backend/` — Express + `pg` (plain SQL) + `zod`. See `backend/.env.example`.
- **Loader** — `npm run load` in `backend/` reads `$DATA_DIR`, runs migrations first, normalises and
  upserts the export, prints a report, writes `loader-report.json`.
- **Frontend** — `frontend/` (Phase 6).

### Backend notes (contract decisions)

- **Error precedence — adding a line** (in this exact order):
  1. `NOT_FOUND` (order) → 2. `VALIDATION_ERROR` (body) → 3. `NOT_FOUND` (product) →
  4. `ORDER_IMMUTABLE` → 5. `PRODUCT_INACTIVE` → 6. `LABEL_MISMATCH`.
- **Error precedence — transitions**: `NOT_FOUND` (order) → `VALIDATION_ERROR` (body) →
  `INVALID_TRANSITION` (incl. moving to the current status) → (DRAFT→SUBMITTED only: no-lines
  `VALIDATION_ERROR`, then `FARM_ON_HOLD`).
- **Product-code normalisation**: input is trimmed and uppercased; any of `-`, space, `_`, or no
  separator between the letter prefix and digits is accepted and converted to canonical form.
  Canonical = 2–3 letters + 4 digits (`AAA-9999`, e.g. `fng1112`, `FNG 1112`, `FN-2404` → `FN-2404`).
  Anything that doesn't normalise → 400 `VALIDATION_ERROR` (body) / `INV_CODE` (loader quarantine).
- **Note authors**: `author` must be `"farm"` or `"ops"`. Notes are allowed in every status,
  including after `SHIPPED`.
- **Un-backorder** (`BACKORDERED → CONFIRMED`): re-checks stock per product across all lines;
  if still short, returns `409 INVALID_TRANSITION` with message `"Insufficient stock for <codes>"`
  and no status change.
- **Stock reservation**: on `CONFIRMED`, `stock_available` is decremented and `stock_reserved`
  incremented per product (in the same transaction). `CONFIRMED → CANCELLED` and
  `CONFIRMED → BACKORDERED` release the reservation. `CONFIRMED → SHIPPED` consumes it
  (`reserved -= qty`). Reservation uses `SELECT ... FOR UPDATE` on stock rows ordered by
  `product_code`.
- **Isolation**: every mutation runs in a READ COMMITTED transaction with
  `SELECT ... FOR UPDATE` on the order row.
- **Extra table**: `order_status_history` (from/to/at) — small audit trail, written on every
  transition. Not returned by the API.
- **`farm_id` on orders**: not a hard foreign key. An order whose farm can't be resolved loads
  with the normalised id stored and `farm_name: null` (per contract).
- **Loader**: never touches rows with `source='api'`. Loaded rows are `source='import'`.

### Running locally

```bash
cd backend
cp .env.example .env          # then edit DATABASE_URL (+ TEST_DATABASE_URL for tests)
npm install
npm run load                  # runs migrations, then loads $DATA_DIR
npm test                      # unit + integration tests (needs TEST_DATABASE_URL)
npm run dev                   # API on $PORT
```

## Prerequisites

- Python 3.11+
- [OpenCode](https://opencode.ai) ≥ 1.17.0
- A Cadra JWT (`CADRA_TOKEN`) from the F1 Setup page
- Your Cadra proxy URL (from the F1 Setup page)

## Setup

1. Clone this repo (or use it as a GitHub template).
2. Set the environment variables (both values come from the F1 Setup page):
   ```bash
   export CADRA_PROXY_URL=<your-proxy-url>   # e.g. https://your-proxy.example.com/v1
   export CADRA_TOKEN=<your-cadra-jwt>
   ```
   `opencode.json` reads both via `{env:…}` — no file edits needed.
3. Install OpenCode if not already installed (see [opencode.ai](https://opencode.ai)).
4. Run OpenCode in this directory:
   ```bash
   opencode
   ```
5. Complete `APPROACH.md` and implement your solution in `src/` (start with `src/solution.py`).
6. Push your work to a **public** GitHub repository.
7. Submit your repo URL on the F1 demo page.

## Python environment (optional)

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Project layout

```
.
├── opencode.json    # Cadra provider config (reads CADRA_PROXY_URL + CADRA_TOKEN from env)
├── APPROACH.md      # Your written approach (required for submission)
├── src/
│   └── solution.py  # Your solution code
├── requirements.txt
└── README.md
```
