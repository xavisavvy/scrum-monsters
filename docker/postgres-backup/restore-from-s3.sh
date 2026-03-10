#!/bin/bash
set -e

# Restore a PostgreSQL database from an S3 backup
# Usage: ./restore-from-s3.sh <s3-key>
# Example: ./restore-from-s3.sh scrummonsters/scrummonsters_2026-03-09T02:00:00.sql.gz

if [ -z "$1" ]; then
  echo "Usage: $0 <s3-key>"
  echo "Example: $0 scrummonsters/scrummonsters_2026-03-09T02:00:00.sql.gz"
  echo ""
  echo "List available backups:"
  echo "  source /opt/scrummonsters/.env"
  echo "  aws s3 ls s3://\${BACKUP_S3_BUCKET}/scrummonsters/ --region us-east-1"
  exit 1
fi

S3_KEY="$1"

# Load environment variables
echo "Loading environment from /opt/scrummonsters/.env..."
set -a
source /opt/scrummonsters/.env
set +a

# Validate required env vars
for var in BACKUP_S3_BUCKET POSTGRES_USER POSTGRES_DB BACKUP_S3_ACCESS_KEY_ID BACKUP_S3_SECRET_ACCESS_KEY; do
  if [ -z "${!var}" ]; then
    echo "ERROR: Required environment variable $var is not set in /opt/scrummonsters/.env"
    exit 1
  fi
done

# Export AWS credentials for aws CLI
export AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY_ID}"
export AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_ACCESS_KEY}"
export AWS_DEFAULT_REGION="us-east-1"

COMPOSE="docker compose -f /opt/scrummonsters/docker-compose.prod.yml"
RESTORE_FILE="/tmp/restore.sql.gz"

echo ""
echo "=== ScrumMonsters Database Restore ==="
echo "Backup: s3://${BACKUP_S3_BUCKET}/${S3_KEY}"
echo "Target: ${POSTGRES_DB} (user: ${POSTGRES_USER})"
echo ""

# Step 1: Download backup from S3
echo "[1/6] Downloading backup from S3..."
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${S3_KEY}" "${RESTORE_FILE}" --region us-east-1
echo "  Downloaded $(du -h ${RESTORE_FILE} | cut -f1) to ${RESTORE_FILE}"

# Step 2: Stop the app container
echo "[2/6] Stopping app container..."
${COMPOSE} stop app
echo "  App container stopped."

# Step 3: Drop and recreate the database
echo "[3/6] Dropping and recreating database ${POSTGRES_DB}..."
${COMPOSE} exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};"
${COMPOSE} exec -T postgres psql -U "${POSTGRES_USER}" -d postgres -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"
echo "  Database recreated."

# Step 4: Restore from backup
echo "[4/6] Restoring database from backup (gunzip | psql)..."
gunzip -c "${RESTORE_FILE}" | ${COMPOSE} exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > /dev/null
echo "  Restore complete."

# Step 5: Verify data integrity
echo "[5/6] Verifying data integrity..."
TABLE_COUNT=$(${COMPOSE} exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")
TABLE_COUNT=$(echo "${TABLE_COUNT}" | tr -d ' ')
echo "  Tables found: ${TABLE_COUNT}"

USER_COUNT=$(${COMPOSE} exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -t -c \
  "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "  0 (table may not exist)")
USER_COUNT=$(echo "${USER_COUNT}" | tr -d ' ')
echo "  Users found: ${USER_COUNT}"

if [ "${TABLE_COUNT}" -eq 0 ] 2>/dev/null; then
  echo "  WARNING: No tables found after restore. The backup may be empty."
fi

# Step 6: Restart app and verify health
echo "[6/6] Restarting app container..."
${COMPOSE} start app
echo "  Waiting 10 seconds for app to start..."
sleep 10

echo "  Checking health..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://scrummonsters.com/api/health)
if [ "${HTTP_STATUS}" = "200" ]; then
  echo "  Health check PASSED (HTTP ${HTTP_STATUS})"
else
  echo "  Health check returned HTTP ${HTTP_STATUS} (expected 200)"
  echo "  Check app logs: ${COMPOSE} logs --tail=50 app"
fi

# Cleanup
rm -f "${RESTORE_FILE}"
echo ""
echo "=== Restore Complete ==="
echo "  Database: ${POSTGRES_DB}"
echo "  Tables: ${TABLE_COUNT}"
echo "  Users: ${USER_COUNT}"
echo "  Health: HTTP ${HTTP_STATUS}"
