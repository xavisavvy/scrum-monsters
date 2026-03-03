#!/bin/sh
set -e

# pg_dump → gzip → upload to S3
TIMESTAMP=$(date +%Y-%m-%dT%H:%M:%S)
FILENAME="${S3_PREFIX}/${POSTGRES_DATABASE}_${TIMESTAMP}.sql.gz"

echo "Creating backup of ${POSTGRES_DATABASE} database..."
PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump -h "${POSTGRES_HOST}" -U "${POSTGRES_USER}" "${POSTGRES_DATABASE}" | gzip > /tmp/backup.sql.gz

echo "Uploading to s3://${S3_BUCKET}/${FILENAME}..."
aws s3 cp /tmp/backup.sql.gz "s3://${S3_BUCKET}/${FILENAME}" --region "${S3_REGION}"

rm -f /tmp/backup.sql.gz
echo "Backup complete: ${FILENAME}"
