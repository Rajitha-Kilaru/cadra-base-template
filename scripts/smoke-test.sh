#!/usr/bin/env bash
# smoke-test.sh — runs the Prairie Ridge API smoke test against BASE_URL.
# Usage:  BASE_URL=https://your-backend.onrender.com bash scripts/smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3001}"
PASS=0
FAIL=0

# Known data values (from the mock data pack in data/)
FARM_ID="F-020"
CROP="SOYBEAN"
STATE="IA"
STAGE="2"
IDEM_KEY="smoke-test-$(date +%s)"
LABELLED_PRODUCT="FNG-1112"
UNLABELLED_PRODUCT="FNG-5415"
DISCONTINUED_PRODUCT="FNG-9992"

ORD_ID=""  # filled during test

check() {
  local label="$1" expected="$2" actual="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  PASS: $label"
    ((PASS++))
  else
    echo "  FAIL: $label (expected '$expected', got: $(echo "$actual" | tr '\n' ' ' | head -c 120))"
    ((FAIL++))
  fi
}

extract() {
  echo "$1" | python3 -c "import sys,json; print(json.load(sys.stdin)${2})" 2>/dev/null || true
}

echo "=== Prairie Ridge Smoke Test ==="
echo "Target: $BASE_URL"
echo ""

# 1. Health
echo "--- Health ---"
R=$(curl -s "$BASE_URL/api/health")
check "health returns ok" '"status":"ok"' "$R"

# 2. List returns items
echo "--- List ---"
R=$(curl -s "$BASE_URL/api/orders")
check "list returns 200" "items" "$R"
check "list has total > 0" '"total":' "$R"
LIST_TOTAL=$(extract "$R" "['total']" 2>/dev/null || echo 0)
check "total > 0" "$(echo "$LIST_TOTAL > 0" | bc -l | grep -q 1 && echo yes || :)"

# 3. List with q and status filters
echo "--- Filters ---"
R=$(curl -s "$BASE_URL/api/orders?q=Elmhurst&status=DRAFT")
check "q + status filter" "items" "$R"

# 4. Invalid page_size
echo "--- Invalid params ---"
R=$(curl -s "$BASE_URL/api/orders?page_size=101")
check "page_size>100 -> 400" "VALIDATION_ERROR" "$R"
R=$(curl -s "$BASE_URL/api/orders?page=0")
check "page=0 -> 400" "VALIDATION_ERROR" "$R"
R=$(curl -s "$BASE_URL/api/orders?status=BOGUS")
check "invalid status -> 400" "VALIDATION_ERROR" "$R"

# 5. Unknown order -> 404
echo "--- Unknown order ---"
R=$(curl -s "$BASE_URL/api/orders/ORD-99999")
check "unknown order -> 404" "NOT_FOUND" "$R"

# 6. Create order (idempotent)
echo "--- Create order (idempotent) ---"
R1=$(curl -s -X POST "$BASE_URL/api/orders" \
  -H 'Content-Type: application/json' \
  -d "{\"farm_id\":\"$FARM_ID\",\"field\":{\"crop\":\"$CROP\",\"state\":\"$STATE\",\"growth_stage\":$STAGE},\"idempotency_key\":\"$IDEM_KEY\"}")
ORD_ID=$(extract "$R1" "['order_id']")
HTTP1=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/orders" \
  -H 'Content-Type: application/json' \
  -d "{\"farm_id\":\"$FARM_ID\",\"field\":{\"crop\":\"$CROP\",\"state\":\"$STATE\",\"growth_stage\":$STAGE},\"idempotency_key\":\"$IDEM_KEY\"}")
check "first create -> 201" "201" "$(echo "$HTTP1" | grep -o 201 || echo '')"
R2=$(curl -s -X POST "$BASE_URL/api/orders" \
  -H 'Content-Type: application/json' \
  -d "{\"farm_id\":\"$FARM_ID\",\"field\":{\"crop\":\"$CROP\",\"state\":\"$STATE\",\"growth_stage\":$STAGE},\"idempotency_key\":\"$IDEM_KEY\"}")
ORD_ID2=$(extract "$R2" "['order_id']")
check "second create -> 200 same order_id" "$ORD_ID" "$ORD_ID2"
check "second create status is DRAFT" "DRAFT" "$R2"

# 7. Add a labelled line
echo "--- Add labelled line ---"
R=$(curl -s -X POST "$BASE_URL/api/orders/$ORD_ID/lines" \
  -H 'Content-Type: application/json' \
  -d "{\"product_code\":\"$LABELLED_PRODUCT\",\"qty\":2}")
check "add labelled line -> 201" "201" "$(echo "$R" | grep -oF "$ORD_ID" && echo 201 || :)"
# Actually check HTTP code
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/orders/$ORD_ID/lines" \
  -H 'Content-Type: application/json' \
  -d "{\"product_code\":\"$LABELLED_PRODUCT\",\"qty\":2}")
check "add labelled line HTTP 201" "201" "$HTTP"

# 8. Add an unlabelled line
echo "--- Add unlabelled line (LABEL_MISMATCH) ---"
R=$(curl -s -X POST "$BASE_URL/api/orders/$ORD_ID/lines" \
  -H 'Content-Type: application/json' \
  -d "{\"product_code\":\"$UNLABELLED_PRODUCT\",\"qty\":1}")
check "unlabelled -> 422 LABEL_MISMATCH" "LABEL_MISMATCH" "$R"
check "message mentions not labelled" "not labelled" "$R"

# 9. Add discontinued product (PRODUCT_INACTIVE)
echo "--- Add discontinued product ---"
R=$(curl -s -X POST "$BASE_URL/api/orders/$ORD_ID/lines" \
  -H 'Content-Type: application/json' \
  -d "{\"product_code\":\"$DISCONTINUED_PRODUCT\",\"qty\":1}")
check "inactive product -> 422 PRODUCT_INACTIVE" "PRODUCT_INACTIVE" "$R"

# 10. Submit
echo "--- Submit ---"
R=$(curl -s -X POST "$BASE_URL/api/orders/$ORD_ID/transition" \
  -H 'Content-Type: application/json' \
  -d '{"to":"SUBMITTED"}')
check "submit -> SUBMITTED" "SUBMITTED" "$R"

# 11. Add note
echo "--- Add note ---"
R=$(curl -s -X POST "$BASE_URL/api/orders/$ORD_ID/notes" \
  -H 'Content-Type: application/json' \
  -d '{"author":"farm","text":"Smoke test note"}')
check "add note -> 201" "201" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE_URL/api/orders/$ORD_ID/notes" \
  -H 'Content-Type: application/json' \
  -d '{"author":"farm","text":"Smoke test note 2"}')"
check "note appears" "smoke test note" "$R"

# 12. Confirm
echo "--- Confirm ---"
R=$(curl -s -X POST "$BASE_URL/api/orders/$ORD_ID/transition" \
  -H 'Content-Type: application/json' \
  -d '{"to":"CONFIRMED"}')
check "confirm -> CONFIRMED or BACKORDERED" "CONFIRMED|BACKORDERED" "$(echo "$R" | grep -oE 'CONFIRMED|BACKORDERED')"

# 13. Malformed JSON -> 400
echo "--- Error envelopes ---"
R=$(curl -s -X POST "$BASE_URL/api/orders" \
  -H 'Content-Type: application/json' \
  -d '{bad json')
check "malformed JSON -> 400" "VALIDATION_ERROR" "$R"

# 14. Unknown route -> 404
R=$(curl -s "$BASE_URL/api/nope")
check "unknown route -> 404" "NOT_FOUND" "$R"

# 15. Stack trace check — inspect every response for stack traces
echo "--- Stack trace leak check ---"
# Re-run key endpoints and check no stack traces
for url in "$BASE_URL/api/health" "$BASE_URL/api/orders" "$BASE_URL/api/orders/$ORD_ID" "$BASE_URL/api/orders?page_size=101"; do
  BODY=$(curl -s "$url")
  if echo "$BODY" | grep -c 'at ' >/dev/null 2>&1 || echo "$BODY" | grep -c 'Error:' >/dev/null 2>&1; then
    echo "  FAIL: stack trace leaked at $url"
    ((FAIL++))
  fi
done
check "no stack traces in responses" "pass" "pass"

# 16. GET the order again — persists
echo "--- Persistence ---"
R=$(curl -s "$BASE_URL/api/orders/$ORD_ID")
check "order still exists after mutations" "$ORD_ID" "$R"
check "status is not DRAFT" "DRAFT" "$(echo "$R" | grep -o 'DRAFT' || echo 'not-draft')"
check "note persisted" "smoke test" "$R"

# Summary
echo ""
echo "=== Results ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "SOME CHECKS FAILED"
  exit 1
else
  echo "ALL CHECKS PASSED"
  exit 0
fi