#!/bin/bash
set -euo pipefail

# Deploy script for production.
# Usage: cd /opt/yurdelo/infra && ./scripts/deploy.sh

cd "$(dirname "$0")/.."

GIT_SHA=$(git -C .. rev-parse --short HEAD 2>/dev/null || echo "manual")
# Persistent path — survives reboot (NOT /tmp)
TAG_FILE="$(pwd)/.last-deploy-tag"
COMPOSE_FILE="docker-compose.prod.yml"
BACKEND_IMAGE="yurdelo-backend"

echo "Deploying: $GIT_SHA"

# Save current tag for rollback
CURRENT_TAG=$(docker inspect --format='{{.Config.Image}}' "$BACKEND_IMAGE" 2>/dev/null | grep -oP ':\K.*' || echo "none")
if [ "$CURRENT_TAG" != "none" ]; then
  echo "$CURRENT_TAG" > "$TAG_FILE"
  echo "Saved previous tag: $CURRENT_TAG"
fi

# Build FIRST → migrate with NEW image → start
docker compose -f "$COMPOSE_FILE" build

echo "Running migrations..."
docker compose -f "$COMPOSE_FILE" run --rm backend \
  npx node-pg-migrate up \
    --database-url-var MIGRATION_DATABASE_URL \
    --migrations-dir db/migrations \
    --migration-file-language sql

echo "Starting backend..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps backend
sleep 5

echo "Verifying health..."
if curl -sf http://localhost:3000/health > /dev/null; then
  echo "Deployed: $GIT_SHA"
else
  echo "Health failed! Auto-rollback..."
  if [ -f "$TAG_FILE" ] && [ "$(cat "$TAG_FILE")" != "none" ]; then
    ./scripts/rollback.sh "$COMPOSE_FILE"
  else
    echo "No previous tag — manual intervention required"
  fi
  exit 1
fi
