# Phase 32: Infrastructure Foundation - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy ScrumMonsters to AWS Lightsail with a production Docker Compose stack (app, PostgreSQL, Nginx Proxy Manager), HTTPS on scrummonsters.com via Let's Encrypt, auto-restart on VPS reboot, and secrets out of git. Strip all Replit-specific config as a clean break.

</domain>

<decisions>
## Implementation Decisions

### Custom domain setup
- Domain: **scrummonsters.com** (root domain, no subdomain)
- Registrar/DNS: **AWS Route 53** — A record pointing to Lightsail static IP
- No www redirect needed — root domain only
- Let's Encrypt TLS via Nginx Proxy Manager

### Replit coexistence
- **Phase out Replit entirely** — no fallback, no dual-environment
- **Strip all Replit config immediately** in Phase 32 (.replit, replit.nix, any Replit-specific files)
- No data to migrate from Replit — clean start on Lightsail
- Researcher should check codebase for any Replit-specific code paths (environment detection, Replit auth, Replit DB references) and flag them for removal

### Database setup
- **PostgreSQL required in production** — app should fail to start without DATABASE_URL (no in-memory fallback on Lightsail)
- Fresh database, no data migration
- In-memory fallback can remain for local development only

### Claude's Discretion
- Database schema initialization approach (Drizzle push vs migration files)
- PostgreSQL data volume strategy (Docker named volumes vs bind mount — consider Phase 33 backup needs)
- PostgreSQL version (pick current stable)
- Lightsail region (pick based on cost/latency tradeoffs)

### Manual deploy process
- **SSH + git pull** for Phase 32 (before CI/CD in Phase 34)
- Generate a **new SSH key pair** for Lightsail access
- Provide **both** a deploy.sh script and a written runbook
  - deploy.sh: one-command deploy (SSH in, pull, rebuild containers)
  - Runbook: step-by-step explanation of what the script does

</decisions>

<specifics>
## Specific Ideas

- User wants the game branded as **ScrumMonsters** (not ScrumQuest) — the domain is scrummonsters.com. Full app rename is deferred but the infrastructure should use the correct name.
- Clean break from Replit — no maintaining two environments. Once Lightsail works, Replit is gone.
- Deploy script + runbook combo — user wants automation AND understanding.

</specifics>

<deferred>
## Deferred Ideas

- **App-wide rename from ScrumQuest to ScrumMonsters** — branding/code rename across the entire codebase. Captures: all UI text, page titles, component names, README, package.json name, etc. Should be its own phase or added to backlog.

</deferred>

---

*Phase: 32-infrastructure-foundation*
*Context gathered: 2026-02-24*
