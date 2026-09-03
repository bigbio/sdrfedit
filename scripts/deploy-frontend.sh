#!/usr/bin/env bash
# Publish the committed Angular bundle into the Nginx document root.
set -euo pipefail

PROJECT_ROOT="${SDRF_PROJECT_ROOT:-/opt/sdrfedit}"
SOURCE="$PROJECT_ROOT/dist/sdrf-editor/browser"
WEB_ROOT="${SDRF_WEB_ROOT:-/www/wwwroot/www.sdrf.site}"

if [[ ! -f "$SOURCE/index.html" || ! -f "$SOURCE/main.js" ]]; then
  echo "missing frontend build in $SOURCE" >&2
  exit 1
fi

mkdir -p "$WEB_ROOT"
cp -a "$SOURCE/." "$WEB_ROOT/"

# Exercise the same virtual host and API path users reach. Static files do not
# require an Nginx reload.
curl -fsS -H 'Host: www.sdrf.site' http://127.0.0.1/ >/dev/null
curl -fsS -H 'Host: www.sdrf.site' http://127.0.0.1/api/health >/dev/null

echo "frontend deployed to $WEB_ROOT"
