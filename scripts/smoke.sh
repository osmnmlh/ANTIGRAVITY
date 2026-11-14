#!/usr/bin/env sh
# Minimal zero-dependency rehearsal smoke script using curl only (Issue #35).
# Usage: ./scripts/smoke.sh [BASE_URL]
# Example: ./scripts/smoke.sh https://antigravity-backend-8lv8.onrender.com

set -eu

BASE_URL="${1:-https://antigravity-backend-8lv8.onrender.com}"
CURL_TIMEOUT="--connect-timeout 15 --max-time 65"

echo "1) Health / wake check -> $BASE_URL/api/health"
curl -fsS $CURL_TIMEOUT "$BASE_URL/api/health"
echo ""

echo "2) Full demo reset -> POST /api/demo/reset"
curl -fsS $CURL_TIMEOUT -X POST "$BASE_URL/api/demo/reset"
echo ""

echo "3) Verify crew packets -> GET /api/packets"
curl -fsS $CURL_TIMEOUT "$BASE_URL/api/packets" | head -c 400
echo ""

echo "4) Trigger cabin gas leak scenario -> POST /api/ai/demo/cabin-gas-leak"
curl -fsS $CURL_TIMEOUT -X POST "$BASE_URL/api/ai/demo/cabin-gas-leak"
echo ""

echo "5) Start Apollo 13 historical incident replay -> POST /api/simulation/incident/start"
curl -fsS $CURL_TIMEOUT -X POST "$BASE_URL/api/simulation/incident/start" \
  -H "content-type: application/json" \
  -d '{"incidentId":"apollo-13","crewId":"crew-1","stepIntervalMs":1500}'
echo ""

sleep 2

echo "6) Stop simulation & reset to baseline -> POST /api/simulation/stop"
curl -fsS $CURL_TIMEOUT -X POST "$BASE_URL/api/simulation/stop" \
  -H "content-type: application/json" \
  -d '{"reset":true}'
echo ""

echo "7) Ask Turkish AI chat question -> POST /api/ai/chat"
curl -fsS $CURL_TIMEOUT -X POST "$BASE_URL/api/ai/chat" \
  -H "content-type: application/json" \
  -d '{"crewId":"crew-1","message":"Su an durumum nedir?"}'
echo ""

echo "8) Final clean reset -> POST /api/demo/reset"
curl -fsS $CURL_TIMEOUT -X POST "$BASE_URL/api/demo/reset"
echo ""

echo "SMOKE REHEARSAL COMPLETE."
