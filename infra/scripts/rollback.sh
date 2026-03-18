#!/bin/bash
set -euo pipefail

# Rollback to previous deployment tag.
# Usage: cd /opt/yurdelo/infra && ./scripts/rollback.sh [compose-file]

cd "$(dirname "$0")/.."

COMPOSE_FILE="${1:-docker-compose.prod.yml}"
TAG_FILE="$(pwd)/.last-deploy-tag"
BACKEND_IMAGE="yurdelo-backend"

if [ ! -f "$TAG_FILE" ] || [ "$(cat "$TAG_FILE")" = "none" ]; then
  echo "ERROR: No previous tag found in $TAG_FILE"
  exit 1
fi

PREV_TAG=$(cat "$TAG_FILE")
echo "Rolling back to: $PREV_TAG"

docker compose -f "$COMPOSE_FILE" stop backend
docker tag "$BACKEND_IMAGE:$PREV_TAG" "$BACKEND_IMAGE:current" 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" up -d backend

echo "Verifying health..."
sleep 5
curl -sf http://localhost:3000/health && echo "Rollback OK" || { echo "Rollback FAILED"; exit 1; }
