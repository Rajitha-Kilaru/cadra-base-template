# Approach — Prairie Ridge Ag Supply Ordering System

## A. Scope

The workflow: a farm user finds their order by ID or farm name, opens it, adds a labelled product line, submits it, and adds a note. Ops uses an inline panel to confirm (which may backorder if stock is short), ship, deliver, cancel, or un-backorder.

Screens: Order List (search + status filter + pagination), Order Detail (field, lines, notes, ops panel), and a New Order form. Seven endpoints match the contract: health, order list, order detail, idempotent create, add line, transition, add note.

Excluded: auth, per-warehouse inventory, fulfilment routing, notifications, editing or removing lines, and all styling.

Assumptions where the brief is silent: note authors are "farm" or "ops"; product codes normalise to AAA-9999 (2–3 letter prefix); un-backorder re-checks stock and rejects with "insufficient stock" if still short; stock is reserved on confirm and released on cancel.

## B1. Whole-System Decomposition

```
 ┌──────────────────────┐
 │    Notifications     │ ← async (events/outbox table)
 │  (SMS/email outbox)  │
 └──────┬───────────────┘
        │ reads events
 ┌──────┴──────────────────────┐
 │        Ordering              │ ← sync REST ↔ React frontend
 │  (orders, lines, notes,     │
 │   price snapshots)           │
 └──────┬──────────────────────┘
        │ FK references (read)
 ┌──────┴──────────┐  ┌───────────────┐
 │ Catalog & Labels │  │  Inventory    │
 │ (products,       │  │ (stock, res)  │
 │  labels)         │  └───────┬───────┘
 └─────────────────┘          │ async
                      ┌───────┴──────────────┐
                      │  Fulfilment &        │
                      │  Delivery            │
                      └──────────────────────┘
```

Label and stock checks are synchronous — fast in-process reads against the same Postgres. Notifications and fulfilment hand-off are async via an events/outbox table. Ordering owns orders, lines, notes, and price snapshots; it references farms, products, labels, and stock by foreign key. I build Ordering first with a read model of Catalog/labels, since the farm can't order until products and labels exist. At 400 farms and ~60 orders/day, a modular monolith with one Postgres is right — no microservices overhead.

## B2. The Ordering Slice

Frontend: pages → shared components → one API client (`src/api/client.ts`) → React Query hooks. The client parses every response, including error envelopes, into a typed `ApiError`. React Query holds server state; filters live in the URL query string so refresh keeps them; form state is local.

Backend: Express routes → services (rules + transactions) → repositories (raw SQL via `pg`) → pure domain modules (transition table, label check, code normaliser). Zod validates at the HTTP boundary. Every mutation runs in a READ COMMITTED transaction with `SELECT ... FOR UPDATE` on the order row; confirm/un-backorder/cancel also lock stock rows ordered by `product_code` to avoid deadlocks. I rejected GraphQL — it adds complexity for seven endpoints that map 1:1 to the REST contract.

## C. Data and Validation

Entities: `farms`, `products` (+ `product_labels`), `orders`, `order_lines`, `notes`. The loader (`npm run load`) reads CSVs from `DATA_DIR`, runs migrations, upserts on natural keys with `INSERT ... ON CONFLICT DO UPDATE ... WHERE (row differs)`. Loaded rows are `source='import'`; API rows are `source='api'` and never touched. Normalises IDs (F-020, ORD-6001, L-7001, N-7001), booleans, statuses, states, growth stages, dates, and prices — stored as NUMERIC(10,2). Headers match via alias maps; missing columns fail loudly; invalid rows quarantined per rule in `loader-report.json`.

Validation has three layers: zod at the route boundary, business rules in services, and DB constraints as the final safety net.

## D. Risks and Trade-offs

Risk 1 — Wrong product ships because label data is inconsistent. Handled by rejecting unlabelled products at add-line time with a LABEL_MISMATCH error naming product, crop, state, and stage.

Risk 2 — Duplicate orders or races under load. Handled by UNIQUE(farm_id, idempotency_key) plus ON CONFLICT, and row locks on all mutations.

Trade-off — Modular monolith instead of microservices: delays independent scaling of fulfilment and inventory but removes network overhead, simplifies deployment, and ships sooner.
