#!/bin/bash
# deploy.sh - One-command deploy for ScrumMonsters
# Prerequisites:
#   - SSH key at ~/.ssh/lightsail_scrummonsters (set REMOTE_HOST below after provisioning)
#   - VPS already provisioned per runbook.md Initial Setup section
# Usage: ./deploy.sh
set -e

REMOTE_USER="ubuntu"
REMOTE_HOST="34.199.135.244"
SSH_KEY="$HOME/.ssh/lightsail_scrummonsters"
REMOTE_DIR="/opt/scrummonsters"

echo "Deploying ScrumMonsters to scrummonsters.com..."

ssh -i "$SSH_KEY" "$REMOTE_USER@$REMOTE_HOST" << 'EOF'
  set -e

  echo "[1/4] Pulling latest code..."
  cd /opt/scrummonsters && git pull origin main

  echo "[2/4] Pulling latest Docker image from GHCR..."
  docker compose -f docker-compose.prod.yml pull app

  echo "[3/4] Running database migrations..."
  docker compose -f docker-compose.prod.yml run --rm app npm run db:push

  echo "[4/4] Restarting app container..."
  docker compose -f docker-compose.prod.yml up -d --no-deps app

  echo "Deploy complete."
EOF

echo "Deploy complete. Check https://scrummonsters.com"
