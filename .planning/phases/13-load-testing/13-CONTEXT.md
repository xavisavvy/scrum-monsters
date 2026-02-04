# Phase 13: Load Testing - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish performance baselines for HTTP and WebSocket endpoints using k6. Run scheduled load tests and report results without blocking CI/CD pipelines.

</domain>

<decisions>
## Implementation Decisions

### Test scenarios
- Smoke tests (5-10 VUs) plus average load (100 VUs)
- 30 second test duration for all scenarios
- Cover both HTTP endpoints and full WebSocket game flow
- No spike or stress testing in initial implementation

### Threshold strategy
- Full metric suite: latency (p95), error rate, throughput, availability
- HTTP endpoints: p95 < 500ms
- Error rate: < 5%
- WebSocket game events: p95 < 100ms (stricter for real-time feel)

### WebSocket testing
- Simulate full game flow: connect → create/join lobby → vote → reveal
- Target 100 concurrent WebSocket connections
- Separate idle timeout test (5 minutes) for connection stability
  - Runs nightly on schedule AND via manual trigger
  - Informational only — never blocks releases

### CI integration
- No load tests on PRs — avoid slowing down PR workflow
- Full load tests run on nightly schedule against main
- Report format: JSON artifact plus markdown summary in workflow output
- Failures are informational only — never block deploys

### Claude's Discretion
- Per-environment threshold tuning (CI vs staging vs prod)
- Voting pattern simulation (random vs fixed) during WebSocket tests
- k6 script organization and file structure
- Exact ramp-up/ramp-down patterns

</decisions>

<specifics>
## Specific Ideas

- Idle timeout test validates that connections survive ~5 minutes of inactivity
- 100 VUs represents roughly 20 concurrent game lobbies (5 players each)
- WebSocket latency threshold (100ms) is stricter than HTTP (500ms) for real-time responsiveness

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-load-testing*
*Context gathered: 2026-02-03*
