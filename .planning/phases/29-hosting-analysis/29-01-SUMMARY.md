---
phase: 29-hosting-analysis
plan: 01
subsystem: testing/profiling
tags: [profiling, metrics, k6, load-testing, infrastructure]
dependency_graph:
  requires:
    - server/metrics.ts (Prometheus metrics endpoint)
    - tests/load/websocket/game-flow.test.js (k6 load test)
  provides:
    - tests/profiling/metrics-collector.ts (resource metrics sampling)
    - tests/profiling/run-profile.ts (profiling orchestrator)
  affects:
    - Phase 29 hosting decisions (provides actual resource usage data)
tech_stack:
  added:
    - Node.js perf_hooks for event loop utilization monitoring
    - Native fetch API for Prometheus metrics scraping
  patterns:
    - Process metrics sampling at 1s intervals
    - Three-scenario profiling (cold start, steady state, teardown)
    - Bottleneck detection with severity levels
key_files:
  created:
    - tests/profiling/metrics-collector.ts (310 lines)
    - tests/profiling/run-profile.ts (415 lines)
  modified: []
decisions:
  - context: "Event loop utilization monitoring"
    choice: "Used Node.js perf_hooks.performance.eventLoopUtilization()"
    rationale: "Built-in API, no dependencies, provides idle/active/utilization metrics"
    alternatives:
      - "Custom event loop delay measurement (less accurate)"
  - context: "Prometheus metrics parsing"
    choice: "Regex-based parsing of /metrics text format"
    rationale: "No dependencies, handles both gauge and counter metrics, sums labeled counters"
    alternatives:
      - "prom-client client-side parsing (adds dependency)"
  - context: "Bandwidth estimation formula"
    choice: "totalMessages * 500 bytes * 1.3 safety margin"
    rationale: "Conservative estimate accounts for WebSocket overhead and JSON payload size"
    alternatives:
      - "Actual byte counting (requires instrumentation)"
  - context: "Monthly bandwidth extrapolation"
    choice: "730 hours/month * 10% uptime factor"
    rationale: "Assumes 10% of month has active users, conservative estimate for hobby tier"
    alternatives:
      - "100% uptime (unrealistic for small project)"
  - context: "k6 spawning strategy"
    choice: "child_process.spawn with stdio: inherit"
    rationale: "Pipes k6 output directly to console for visibility, proper error handling"
    alternatives:
      - "Silent execution with logged output (less transparent)"
metrics:
  duration: 215s
  tasks_completed: 2
  files_created: 2
  commits: 2
  completed_date: 2026-02-19
---

# Phase 29 Plan 01: Profiling Infrastructure Summary

**One-liner:** Process metrics collector with three-scenario profiling (cold start, steady state, teardown) using k6 load tests, event loop monitoring, and Prometheus scraping for hosting decisions.

## What Was Built

Created profiling infrastructure to measure ScrumQuest's actual resource usage under realistic WebSocket load:

**MetricsCollector (tests/profiling/metrics-collector.ts):**
- Process metrics sampling at 1s intervals: memory (heap, RSS, external), CPU delta calculations
- Event loop utilization via perf_hooks with blocking detection (>90% threshold)
- Prometheus metrics integration: WebSocket connections, message counts, bandwidth estimation
- Structured ProfilingResults output with peak/avg aggregations across all samples

**run-profile orchestrator (tests/profiling/run-profile.ts):**
- Three-scenario profiling pipeline:
  - Cold Start: 10s burst to measure connection storm impact
  - Steady State: Configurable duration (default 60s) for sustained load
  - Teardown: 10s cleanup monitoring
- k6 integration: spawns game-flow.test.js with configurable users/duration
- Bottleneck detection: memory >400MB, CPU >80%, event loop >70%, blocking >90%, cold start spikes
- Bandwidth extrapolation: monthly estimate (730 hours * 10% uptime)
- JSON output to tests/reports/profile-YYYY-MM-DD.json

## Technical Implementation

**CPU percentage calculation:**
```typescript
// Convert CPU microsecond delta to wall clock percentage
cpuPercent = ((userDelta + systemDelta) / (elapsedMs * 1000)) * 100
```

**Prometheus counter parsing:**
- Uses regex exec loop to sum all labeled counter values
- Handles both `metric{label="value"}` and bare `metric` formats
- Fallback to 0 if server not ready (graceful cold start handling)

**Bottleneck severity levels:**
- High: Memory >400MB, CPU >80%, event loop blocking >90%
- Medium: Event loop >70%, cold start RAM spike >50%
- Low: (reserved for future heuristics)

## Key Decisions Made

1. **No npm dependencies**: Used Node.js built-ins only (perf_hooks, child_process, fs)
2. **Regex iteration over matchAll**: Fixed TypeScript compilation by using exec loop instead of spread operator on matchAll
3. **500-byte average message size**: Conservative WebSocket payload estimate with 1.3x safety margin
4. **10% monthly uptime factor**: Realistic for hobby/side project with intermittent usage

## Deviations from Plan

None - plan executed exactly as written. All must-have criteria met:
- ✅ Metrics collector captures process, Prometheus, and event loop metrics
- ✅ Orchestrator runs all three scenarios (cold start, steady state, teardown)
- ✅ Bottleneck detection with severity classification
- ✅ JSON output to tests/reports/ directory
- ✅ k6 error handling with clear installation message
- ✅ No new npm dependencies added

## Verification Results

**TypeScript compilation:**
```bash
npm run check  # ✓ No errors
```

**File structure:**
```
tests/profiling/
├── metrics-collector.ts (310 lines, min 80 required)
└── run-profile.ts (415 lines, min 120 required)
```

**Key links verified:**
- ✅ run-profile.ts imports MetricsCollector from ./metrics-collector
- ✅ run-profile.ts references game-flow.test.js for k6 execution
- ✅ metrics-collector.ts fetches /metrics endpoint for Prometheus data

## Usage

**Run profiling (requires k6 and running server):**
```bash
# Start server in separate terminal
npm run dev

# Run profiling with defaults (50 users, 60s)
npx tsx tests/profiling/run-profile.ts

# Custom configuration
npx tsx tests/profiling/run-profile.ts --users 100 --duration 120
```

**Expected output:**
- Console: Scenario summaries, bottleneck warnings, overall metrics
- File: tests/reports/profile-YYYY-MM-DD.json (detailed results)

## Next Steps (Phase 29 continuation)

1. Run profiling against live server to collect actual resource data
2. Analyze bottlenecks to determine hosting tier requirements
3. Use bandwidth estimates to calculate network costs
4. Document findings in hosting recommendation plan

## Self-Check: PASSED

**Created files verified:**
```bash
✓ tests/profiling/metrics-collector.ts (exists, 310 lines)
✓ tests/profiling/run-profile.ts (exists, 415 lines)
```

**Commits verified:**
```bash
✓ d798375: feat(29-01): create MetricsCollector with process + Prometheus + event loop sampling
✓ 9e6f2a2: feat(29-01): create run-profile orchestrator with cold start/steady state/teardown scenarios
```

**Dependencies verified:**
```bash
✓ No new npm packages added
✓ Uses only Node.js built-ins (perf_hooks, child_process, fs, fetch)
```

All success criteria met. Plan complete.
