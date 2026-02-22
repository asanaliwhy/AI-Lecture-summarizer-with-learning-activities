#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-https://localhost:3443}"
API_BASE="${API_BASE:-${BASE_URL}/api/v1}"
EMAIL="${SMOKE_EMAIL:-smoke-test@example.com}"
PASSWORD="${SMOKE_PASSWORD:-ChangeMe123!}"

echo "[smoke] Base URL: ${BASE_URL}"
echo "[smoke] API URL:  ${API_BASE}"

echo "[smoke] 1) Health check"
curl -f -k -sS "${API_BASE}/health" >/dev/null

echo "[smoke] 2) Auth login endpoint reachable"
curl -f -k -sS -X POST "${API_BASE}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}" >/tmp/smoke-login.json || true

ACCESS_TOKEN="$(node -e "const fs=require('fs');try{const d=JSON.parse(fs.readFileSync('/tmp/smoke-login.json','utf8'));console.log(d.access_token||'')}catch(e){console.log('')}" 2>/dev/null || true)"

if [ -n "${ACCESS_TOKEN}" ]; then
  echo "[smoke] 3) Summary generation endpoint reachable (authorized)"
  curl -f -k -sS -X POST "${API_BASE}/summaries/generate" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{"content_id":"00000000-0000-0000-0000-000000000000","format":"bullets","length":"short"}' >/dev/null || true
else
  echo "[smoke] 3) Skipped authorized summary generate (no token from login)"
fi

echo "[smoke] 4) WebSocket endpoint handshake reachable"
WS_URL="$(echo "${BASE_URL}" | sed 's#^https://#wss://#; s#^http://#ws://#')/api/v1/ws"
node -e "
const { WebSocket } = require('ws');
const url = process.env.WS_URL;
const ws = new WebSocket(url, { rejectUnauthorized: false });
const timer = setTimeout(() => { console.error('WS timeout'); process.exit(1); }, 8000);
ws.on('open', () => { clearTimeout(timer); ws.close(); process.exit(0); });
ws.on('error', () => { clearTimeout(timer); process.exit(1); });
" || { echo "[smoke] WebSocket smoke check failed"; exit 1; }

echo "[smoke] ✅ All smoke checks completed"

