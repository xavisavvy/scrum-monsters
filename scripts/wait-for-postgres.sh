#!/bin/bash
# Wait for PostgreSQL to be ready (up to 30 seconds)
echo "⏳ Waiting for PostgreSQL..."
RETRIES=30
until docker compose exec -T postgres pg_isready -U scrumquest -d scrumquest > /dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -le 0 ]; then
    echo "❌ PostgreSQL failed to start"
    exit 1
  fi
  sleep 1
done
sleep 2
echo "✓ PostgreSQL ready"
