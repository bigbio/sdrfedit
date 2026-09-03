#!/usr/bin/env bash
# Pull is done by GitHub Actions before this script. Here we install deps,
# keep the existing .env, and restart the systemd service.
set -euo pipefail

ROOT=/opt/sdrfedit
BACKEND="$ROOT/backend"

if [[ ! -f "$BACKEND/.env" ]]; then
  echo "missing $BACKEND/.env (API keys live only on the server)" >&2
  exit 1
fi

if [[ ! -x "$BACKEND/.venv/bin/pip" ]]; then
  python3 -m venv "$BACKEND/.venv"
fi

"$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"

chown -R www:www "$ROOT"
chmod 600 "$BACKEND/.env"

systemctl restart sdrf-assistant.service
sleep 2
systemctl is-active --quiet sdrf-assistant.service
curl -sf http://127.0.0.1:8000/api/health
echo
echo "backend deployed"
