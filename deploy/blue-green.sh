#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
ACTIVE_FILE="deploy/nginx/active.conf"
CURRENT="$(grep -o 'server api-[a-z]*:4000' "$ACTIVE_FILE" | head -1 | sed -E 's/.*api-([a-z]+):4000/\1/')"
CURRENT="${CURRENT:-blue}"
if [[ "$CURRENT" == "blue" ]]; then TARGET="green"; else TARGET="blue"; fi

echo "Active backend: $CURRENT; deploying inactive backend: $TARGET"
docker compose build "api-$TARGET"
docker compose up -d "api-$TARGET"
docker compose exec -T "api-$TARGET" npx prisma migrate deploy

for attempt in $(seq 1 30); do
  if docker compose exec -T "api-$TARGET" wget -qO- http://127.0.0.1:4000/api/health >/dev/null; then
    echo "Health check passed for api-$TARGET"
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "Health check failed; keeping api-$CURRENT active"
    docker compose logs --tail=100 "api-$TARGET" || true
    exit 1
  fi
  sleep 2
done

TMP_FILE="${ACTIVE_FILE}.tmp"
sed "s/api-$CURRENT:4000/api-$TARGET:4000/" "$ACTIVE_FILE" > "$TMP_FILE"
mv "$TMP_FILE" "$ACTIVE_FILE"
docker compose exec -T edge nginx -t
docker compose exec -T edge nginx -s reload
echo "Traffic switched to api-$TARGET"
docker compose stop "api-$CURRENT" || true
