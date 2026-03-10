# Phase 36: Disaster Recovery - Research

**Researched:** 2026-03-09
**Domain:** PostgreSQL backup/restore, TLS certificate lifecycle, incident response documentation
**Confidence:** HIGH

---

## Summary

Phase 36 proves the disaster recovery path works end-to-end: restore a database from S3, verify TLS certificate renewal, and document everything in a runbook. The infrastructure is already in place from Phases 32-35 -- this phase validates it works and fills the documentation gap.

The most important technical finding is that the current backup sidecar uses `pg_dump` in **plain-text SQL format** (no `-Fc` or `-Ft` flag), piped through gzip. This means restore MUST use `gunzip | psql`, NOT `pg_restore`. The phase description references "pg_restore" but that command only works with PostgreSQL custom/tar archive formats. Using `pg_restore` on a plain-text dump will fail with "input file does not appear to be a valid archive". This is a common and well-documented mistake.

For TLS certificate verification, Nginx Proxy Manager handles Let's Encrypt renewal automatically via an internal hourly timer that renews certificates expiring within 30 days. Since NPM is GUI-based with no CLI, "forcing" renewal means either (a) deleting and re-requesting the certificate through the NPM admin UI, or (b) using the NPM API. For monitoring, adding a Blackbox Exporter to the Prometheus stack enables a `probe_ssl_earliest_cert_expiry` metric that triggers alerts when the certificate is within 14 days of expiry.

The existing runbook (`runbook.md`) already covers initial setup, deploy procedure, rollback, and backup basics across 8 parts. Phase 36's runbook task extends it with a new "Incident Response" section covering failure scenarios (OOM, disk full, DB connection exhaustion, cert expiry) with step-by-step recovery procedures.

**Primary recommendation:** Fix the restore command to use `gunzip | psql` (not `pg_restore`), add Blackbox Exporter for cert monitoring, and extend the existing runbook.md rather than creating a separate document.

---

## Standard Stack

### Core

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| PostgreSQL 17 (alpine) | 17-alpine | Database (already deployed) | Matches backup sidecar pg_dump version |
| aws-cli | alpine apk | S3 download for restore | Already installed in backup sidecar |
| psql | 17 (from postgres:17-alpine) | Restore plain-text SQL dumps | Correct tool for plain-text pg_dump output |
| Blackbox Exporter | latest | TLS certificate expiry monitoring | Standard Prometheus ecosystem tool for endpoint probing |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| Nginx Proxy Manager | latest (already deployed) | Let's Encrypt certificate management | Renewal verification via admin UI or API |
| Prometheus | latest (already deployed) | Alert rules for cert expiry | Add alerting rules file |
| gzip/gunzip | alpine built-in | Decompress backup files | Part of restore pipeline |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Blackbox Exporter | ssl_exporter | More cert-specific but Blackbox is already the ecosystem standard and lighter |
| Blackbox Exporter | x509-certificate-exporter | Overkill -- designed for Kubernetes multi-cert environments |
| Plain-text pg_dump | pg_dump -Fc (custom format) | Custom format enables selective restore via pg_restore, but changing backup format is out of scope for this phase |

**Installation (on VPS, added to docker-compose.prod.yml):**
```yaml
blackbox-exporter:
  image: prom/blackbox-exporter:latest
  restart: unless-stopped
  ports:
    - "127.0.0.1:9115:9115"
  volumes:
    - ./docker/blackbox/blackbox.yml:/config/blackbox.yml:ro
  command:
    - '--config.file=/config/blackbox.yml'
  deploy:
    resources:
      limits:
        memory: 32M
      reservations:
        memory: 16M
```

---

## Architecture Patterns

### Recommended File Structure

```
docker/
  blackbox/
    blackbox.yml           # Blackbox exporter config (https probe module)
  prometheus/
    prometheus.yml         # Updated: add blackbox scrape job
    alerts.yml             # NEW: alerting rules for cert expiry
runbook.md                 # Extended with Part 9: Incident Response
```

### Pattern 1: Database Restore from S3

**What:** Download gzipped SQL dump from S3, decompress, feed into psql
**When to use:** Data corruption, accidental deletion, VPS replacement

**CRITICAL: The backup uses plain-text SQL format, not custom archive format.**

```bash
# 1. List available backups
aws s3 ls s3://scrummonsters-backups/scrummonsters/ --region us-east-1

# 2. Download the target backup
aws s3 cp s3://scrummonsters-backups/scrummonsters/scrummonsters_2026-03-09T02:00:00.sql.gz /tmp/restore.sql.gz --region us-east-1

# 3. Stop the app to prevent writes during restore
docker compose -f docker-compose.prod.yml stop app

# 4. Drop and recreate the database (inside postgres container)
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U scrummonsters -d postgres -c "DROP DATABASE IF EXISTS scrummonsters;"
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U scrummonsters -d postgres -c "CREATE DATABASE scrummonsters OWNER scrummonsters;"

# 5. Restore from backup (gunzip | psql, NOT pg_restore)
gunzip -c /tmp/restore.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U scrummonsters -d scrummonsters

# 6. Verify data integrity
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U scrummonsters -d scrummonsters -c "SELECT count(*) FROM users;"

# 7. Restart the app
docker compose -f docker-compose.prod.yml start app

# 8. Verify health
curl https://scrummonsters.com/api/health
```

### Pattern 2: Certificate Renewal Verification via NPM

**What:** Verify that Nginx Proxy Manager's auto-renewal works before production cert expires
**When to use:** Initial setup validation, after NPM upgrades

NPM renews certificates automatically every hour, targeting certs expiring within 30 days. Let's Encrypt certs are valid for 90 days, so renewal attempts start at day 60.

**Verification approaches:**
1. **Check current cert expiry via openssl:**
   ```bash
   echo | openssl s_client -connect scrummonsters.com:443 -servername scrummonsters.com 2>/dev/null | openssl x509 -noout -dates
   ```
2. **Check NPM logs for renewal activity:**
   ```bash
   docker compose -f docker-compose.prod.yml logs nginx-proxy-manager | grep -i "renew\|certbot\|certificate"
   ```
3. **Force renewal via NPM admin UI:** Delete and re-request the certificate through the SSL tab on the proxy host (accessible via SSH tunnel to port 81)

### Pattern 3: Prometheus Alert Rules for Cert Expiry

**What:** Blackbox Exporter probes HTTPS endpoint, Prometheus evaluates `probe_ssl_earliest_cert_expiry`
**When to use:** Continuous monitoring -- fires alert when cert expires in under 14 days

```yaml
# docker/prometheus/alerts.yml
groups:
  - name: tls
    rules:
      - alert: TLSCertExpiringSoon
        expr: (probe_ssl_earliest_cert_expiry{job="blackbox-tls"} - time()) / 86400 < 14
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "TLS certificate expires in {{ $value | humanizeDuration }}"
          description: "Certificate for {{ $labels.instance }} expires in less than 14 days."

      - alert: TLSCertExpiryCritical
        expr: (probe_ssl_earliest_cert_expiry{job="blackbox-tls"} - time()) / 86400 < 7
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: "TLS certificate expires in {{ $value | humanizeDuration }}"
```

```yaml
# docker/blackbox/blackbox.yml
modules:
  https_2xx:
    prober: http
    timeout: 10s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: [200]
      method: GET
      tls_config:
        insecure_skip_verify: false
```

```yaml
# Addition to docker/prometheus/prometheus.yml
rule_files:
  - '/etc/prometheus/alerts.yml'

scrape_configs:
  # ... existing scrumquest job ...

  - job_name: 'blackbox-tls'
    metrics_path: /probe
    params:
      module: [https_2xx]
    static_configs:
      - targets:
          - https://scrummonsters.com
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

### Anti-Patterns to Avoid

- **Using `pg_restore` on plain-text SQL dumps:** Will fail with "input file does not appear to be a valid archive." The backup.sh uses `pg_dump` without `-Fc`, producing plain SQL. Use `psql` instead.
- **Restoring without stopping the app first:** Active writes during restore can cause constraint violations or data corruption.
- **Skipping the DROP/CREATE step:** Restoring into an existing database with data causes duplicate key errors. Always start clean.
- **Testing restore on production during business hours:** Use off-peak or a separate test database.
- **Closing port 80 on Lightsail firewall:** Let's Encrypt HTTP-01 challenge requires port 80 permanently. NPM renewal will silently fail without it.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS cert expiry monitoring | Custom script checking cert dates | Blackbox Exporter + Prometheus alert rules | Industry standard, integrates with existing Prometheus/Grafana stack |
| Certificate renewal | Manual certbot commands | NPM built-in auto-renewal | NPM already manages certs; manual certbot will conflict with NPM's internal state |
| S3 backup listing/download | Custom Node.js script | aws-cli (already in backup sidecar) | aws-cli is already installed and configured with IAM credentials |
| Alerting notifications | Custom webhook/email script | Prometheus Alertmanager (future) or Grafana alert contacts | For now, alerts visible in Prometheus/Grafana UI; notification routing is a future enhancement |

**Key insight:** All the building blocks exist (aws-cli in sidecar, NPM managing certs, Prometheus running). This phase validates the recovery path works, not builds new infrastructure.

---

## Common Pitfalls

### Pitfall 1: Using pg_restore on Plain-Text Dumps
**What goes wrong:** `pg_restore: error: input file does not appear to be a valid archive`
**Why it happens:** pg_dump without `-Fc` or `-Ft` produces plain SQL text. pg_restore only handles custom/tar formats.
**How to avoid:** Use `gunzip -c backup.sql.gz | psql -U user -d dbname`
**Warning signs:** The backup.sh script has no format flag on the pg_dump command

### Pitfall 2: Restore Into Populated Database
**What goes wrong:** Duplicate key violations, partial restore, inconsistent state
**Why it happens:** Plain-text SQL dumps contain INSERT statements that conflict with existing data
**How to avoid:** DROP and recreate the database before restoring
**Warning signs:** Error messages containing "duplicate key value violates unique constraint"

### Pitfall 3: NPM Certificate Volume Not Persisted
**What goes wrong:** After `docker compose down && up`, NPM loses its Let's Encrypt certificates and must re-request them (hitting rate limits)
**Why it happens:** Not using named volumes for `/etc/letsencrypt` and `/data`
**How to avoid:** Already mitigated -- `docker-compose.prod.yml` uses `npm_letsencrypt` and `npm_data` named volumes
**Warning signs:** Certificate errors after container recreation

### Pitfall 4: Let's Encrypt Rate Limits During Testing
**What goes wrong:** Too many certificate requests hit Let's Encrypt rate limits (5 duplicate certs per week)
**Why it happens:** Repeatedly deleting and re-requesting the same certificate
**How to avoid:** Use `--dry-run` for testing, or check renewal logs instead of forcing re-issuance. Rate limit: 50 certificates per registered domain per week, 5 duplicate certificates per week.
**Warning signs:** "too many certificates already issued" error from Let's Encrypt

### Pitfall 5: Blackbox Exporter DNS Resolution in Docker
**What goes wrong:** Blackbox Exporter cannot resolve `scrummonsters.com` from inside Docker network
**Why it happens:** Docker's internal DNS does not resolve external domains by default in some configurations
**How to avoid:** Ensure the Docker default bridge network has proper DNS configuration, or use the VPS's host network for the blackbox exporter
**Warning signs:** `probe_success` metric is 0 with DNS resolution errors in logs

### Pitfall 6: Restoring to Wrong Database User
**What goes wrong:** Restored objects owned by wrong user, app cannot access tables
**Why it happens:** pg_dump captures the original owner; restore as different user leaves ownership mismatched
**How to avoid:** Always restore as the same user that owns the database (`scrummonsters`)
**Warning signs:** "permission denied for table" errors after restore

---

## Code Examples

### Restore Script (for runbook)

```bash
#!/bin/bash
# restore-from-s3.sh - Full database restore from S3 backup
# Usage: ./restore-from-s3.sh <backup-filename>
# Example: ./restore-from-s3.sh scrummonsters/scrummonsters_2026-03-09T02:00:00.sql.gz
set -e

BACKUP_FILE="${1:?Usage: $0 <s3-key>}"
COMPOSE="docker compose -f docker-compose.prod.yml"
LOCAL_FILE="/tmp/restore.sql.gz"

# Load env vars for S3 credentials
source /opt/scrummonsters/.env

echo "[1/6] Downloading backup from S3..."
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${BACKUP_FILE}" "$LOCAL_FILE" \
  --region us-east-1

echo "[2/6] Stopping app to prevent writes..."
$COMPOSE stop app

echo "[3/6] Dropping and recreating database..."
$COMPOSE exec postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS ${POSTGRES_DB};"
$COMPOSE exec postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};"

echo "[4/6] Restoring from backup..."
gunzip -c "$LOCAL_FILE" | $COMPOSE exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"

echo "[5/6] Verifying data integrity..."
TABLE_COUNT=$($COMPOSE exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "  Tables found: $TABLE_COUNT"

USER_COUNT=$($COMPOSE exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -t \
  -c "SELECT count(*) FROM users;" 2>/dev/null || echo "0")
echo "  Users found: $USER_COUNT"

echo "[6/6] Restarting app..."
$COMPOSE start app

# Wait for health check
sleep 10
curl -sf https://scrummonsters.com/api/health && echo " Health OK" || echo " Health check failed!"

rm -f "$LOCAL_FILE"
echo "Restore complete."
```

### Check Certificate Expiry (for runbook)

```bash
# Check current cert expiry date
echo | openssl s_client -connect scrummonsters.com:443 -servername scrummonsters.com 2>/dev/null \
  | openssl x509 -noout -enddate

# Check days until expiry
echo | openssl s_client -connect scrummonsters.com:443 -servername scrummonsters.com 2>/dev/null \
  | openssl x509 -noout -checkend $(( 14 * 86400 )) \
  && echo "Certificate valid for >14 days" \
  || echo "WARNING: Certificate expires within 14 days"
```

### Docker Compose Memory Budget After Blackbox Addition

```
Service              Limit    Typical
app                  -        150-200 MB
postgres             -        80-120 MB
postgres-backup      -        20-30 MB
nginx-proxy-manager  -        60-80 MB
prometheus           128 MB   40-60 MB
grafana              128 MB   80-100 MB
dozzle               32 MB   15-20 MB
blackbox-exporter     32 MB   10-15 MB
                              --------
Total                         ~455-625 MB of 1024 MB
```

Blackbox Exporter adds only ~10-15 MB -- well within the remaining memory budget.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| pg_dump plain text + psql restore | pg_dump -Fc (custom format) + pg_restore | Long-standing best practice | Custom format allows selective restore, parallel restore, and is compressed by default. Current setup uses plain text -- works fine for small DB but consider migrating to -Fc in future |
| Manual cert renewal checks | Automated monitoring via Blackbox Exporter | Prometheus ecosystem standard | No human needs to remember to check cert expiry |
| Ad-hoc runbook knowledge | Documented incident response procedures | Industry standard (SRE practices) | Reduces MTTR, enables anyone to respond to incidents |

**Future improvement (out of scope):**
- Switch backup format to `pg_dump -Fc` for custom format dumps (enables `pg_restore`, parallel restore, selective table restore). Would require updating backup.sh and the restore procedure.

---

## Open Questions

1. **Alertmanager for notifications**
   - What we know: Prometheus alert rules can fire, but without Alertmanager there is no notification delivery (email, Slack, etc.)
   - What's unclear: Whether the team wants notification delivery now or just Prometheus/Grafana UI visibility
   - Recommendation: For now, alerts visible in Prometheus Alerts UI and Grafana. Alertmanager adds ~25-40 MB RAM and configuration complexity. Flag as future enhancement.

2. **NPM API for forced renewal**
   - What we know: NPM has an internal API that supports certificate renewal via `renew(access, data)` with JWT auth
   - What's unclear: Exact API endpoints and authentication flow for headless renewal
   - Recommendation: Use the NPM admin UI via SSH tunnel for manual renewal verification. The GUI approach is simpler and well-documented. API approach is fragile across NPM versions.

3. **Staging environment for cert testing**
   - What we know: The phase calls for "staging environment" cert renewal testing, but the current infra has only one VPS (production)
   - What's unclear: Whether a separate staging environment exists or should be created
   - Recommendation: "Staging" can mean verifying the renewal mechanism works on the production NPM instance by checking logs and cert dates, without actually forcing a re-issuance (which risks rate limits). The Blackbox Exporter + alert rules prove the monitoring path. Alternatively, verify by checking the NPM internal renewal timer logs.

---

## Specific Findings Per Plan

### 36-01: pg_restore Test from S3

- **CRITICAL:** Use `psql`, not `pg_restore`. The backup format is plain-text SQL (gzipped).
- The backup sidecar already has `aws-cli` installed. For the restore test, aws-cli must be available on the host OR run the download from within the backup container.
- The IAM backup user already has `GetObject` + `ListBucket` permissions -- restore download will work.
- S3 bucket: `scrummonsters-backups`, prefix: `scrummonsters/`
- Database tables to verify after restore: `users`, `user_profiles`, `user_stats`, `estimation_history`, `sessions`, `class_mastery_progress` (6 tables from schema.ts)
- Consider creating a `restore-from-s3.sh` script alongside `backup.sh` in the `docker/postgres-backup/` directory

### 36-02: Certificate Renewal Verification

- NPM auto-renews hourly, targeting certs expiring within 30 days
- Let's Encrypt certs are valid 90 days, so first renewal attempt is at day 60
- Verification: check cert dates via openssl, check NPM logs for renewal entries
- Add Blackbox Exporter (10-15 MB RAM) for continuous `probe_ssl_earliest_cert_expiry` monitoring
- Add Prometheus alert rules: warning at 14 days, critical at 7 days
- Do NOT repeatedly delete/recreate certs -- Let's Encrypt rate limits (5 duplicates/week)

### 36-03: Incident Response Runbook

- Extend existing `runbook.md` (already has 8 parts) with Part 9: Incident Response
- Failure scenarios to document:
  1. **OOM kill:** Check `dmesg | grep -i oom`, `docker inspect` for OOMKilled, restart with memory limits review
  2. **Disk full:** `df -h`, identify large files (`docker system df`), prune unused images/volumes (`docker system prune`)
  3. **DB connection exhaustion:** Check `pg_stat_activity`, identify idle connections, restart app
  4. **Cert expiry:** Check dates, verify port 80 open, check NPM logs, force renewal via UI
  5. **App crash loop:** Check logs, rollback to prior image tag, check health endpoint
- Each scenario needs: symptoms, diagnosis commands, fix steps, verification

---

## Sources

### Primary (HIGH confidence)
- `docker/postgres-backup/backup.sh` -- confirms plain-text pg_dump format (no `-Fc` flag)
- `docker-compose.prod.yml` -- full production stack definition with all services and volumes
- `runbook.md` -- existing 8-part runbook covering setup, deploy, rollback, backups
- `shared/schema.ts` -- 6 database tables to verify after restore
- `docker/prometheus/prometheus.yml` -- current Prometheus config (no alerting rules yet)

### Secondary (MEDIUM confidence)
- [NPM Certificate Renewal System (DeepWiki)](https://deepwiki.com/NginxProxyManager/nginx-proxy-manager/3.5-certificate-renewal) -- hourly timer, 30-day threshold, sequential processing
- [PostgreSQL pg_dump docs](https://www.postgresql.org/docs/current/app-pgdump.html) -- plain text format requires psql for restore
- [PromLabs: Monitoring TLS Certificate Expiration](https://promlabs.com/blog/2024/02/06/monitoring-tls-endpoint-certificate-expiration-with-prometheus/) -- Blackbox Exporter pattern
- [Blackbox Exporter GitHub](https://github.com/prometheus/blackbox_exporter) -- configuration and Docker setup

### Tertiary (LOW confidence)
- [NPM GitHub Issue #3979](https://github.com/NginxProxyManager/nginx-proxy-manager/issues/3979) -- renewal "Internal Error" reports (may or may not affect current version)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools already deployed or well-established Prometheus ecosystem components
- Architecture: HIGH -- restore path verified against actual backup.sh code; cert monitoring is standard pattern
- Pitfalls: HIGH -- pg_dump format mismatch is verified from source code; other pitfalls from well-documented PostgreSQL/Let's Encrypt behavior

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (infrastructure is stable; 30-day validity)
