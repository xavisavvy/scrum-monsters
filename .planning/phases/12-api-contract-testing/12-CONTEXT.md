# Phase 12: API Contract Testing - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate that API responses match documented OpenAPI specifications, with TypeScript type generation from the spec. Covers both REST endpoints (OpenAPI) and WebSocket events (AsyncAPI). CI blocks merge on contract drift.

</domain>

<decisions>
## Implementation Decisions

### Spec scope & endpoints
- All REST endpoints documented in OpenAPI spec (including health endpoints)
- Separate AsyncAPI spec for WebSocket events (comprehensive coverage)
- Both specs in YAML format
- Endpoints organized with tags by purpose (health, game, metrics, etc.)
- Spec version bump required for breaking changes to WebSocket events
- Claude's Discretion: spec file location, whether to include /metrics endpoint

### Validation approach
- CI-only validation (no runtime middleware)
- Both request and response payloads validated against spec
- WebSocket validation via schema validation (TypeScript types match AsyncAPI definitions)
- Spec drift blocks PR merge

### Type generation workflow
- Generated types placed alongside spec (e.g., shared/api-types.generated.ts)
- Claude's Discretion: whether spec or TypeScript is source of truth
- Claude's Discretion: regeneration timing (manual, pre-commit, or CI check)
- Claude's Discretion: whether generated files are committed to git

### Spec documentation depth
- Comprehensive endpoint descriptions (use cases, edge cases, auth requirements)
- Schemas only (no example payloads)
- Claude's Discretion: error schema approach (detailed per-endpoint vs shared)
- Claude's Discretion: whether to serve interactive docs UI (Swagger/ReDoc)

### Claude's Discretion
- Spec file location in project structure
- Whether to include /metrics endpoint in OpenAPI
- Source of truth between spec and TypeScript types
- Type regeneration workflow timing
- Git tracking for generated files
- Error schema design (detailed vs generic)
- API documentation UI (Swagger UI, ReDoc, or none)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-api-contract-testing*
*Context gathered: 2026-02-03*
