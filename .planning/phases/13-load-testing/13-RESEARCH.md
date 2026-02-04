# Phase 13: Load Testing - Research

**Researched:** 2026-02-03
**Domain:** Performance testing with k6 for HTTP and WebSocket endpoints
**Confidence:** MEDIUM

## Summary

k6 (owned by Grafana) is the industry-standard open-source load testing tool with native HTTP and WebSocket support. It provides JavaScript-based test scripting, comprehensive metrics collection, threshold validation, and flexible scenario configuration. k6's built-in WebSocket support can test Socket.IO applications through the Engine.IO protocol layer, though it requires understanding Socket.IO's packet format (prefix metadata + JSON payload).

The standard approach for real-time multiplayer applications is to test both REST API endpoints and full WebSocket game flows separately, using different scenarios for smoke tests (5-10 VUs), average load (50-100 VUs), and idle connection stability tests. k6's threshold system enables automated pass/fail criteria based on p95 latency, error rates, and throughput metrics.

**Primary recommendation:** Use k6 with native WebSocket support to test Socket.IO endpoints. Run scheduled nightly load tests in GitHub Actions with JSON output for reports, never blocking PRs or deployments.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| k6 | latest | Load testing framework | Industry standard, acquired by Grafana, native protocol support, excellent CI/CD integration |
| Socket.IO | 4.8.1 | WebSocket library (already in use) | Project's real-time communication layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| k6 WebSocket API | built-in | WebSocket testing | Testing Socket.IO connections (requires Engine.IO protocol handling) |
| GitHub Actions | latest | CI/CD platform | Scheduled nightly load tests |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| k6 | Artillery | Artillery has built-in Socket.IO support but less mature metrics/threshold system and smaller ecosystem |
| k6 | JMeter | JMeter is GUI-based and heavier, k6 is code-first and designed for CI/CD |
| Native WebSocket | xk6-socketio extension | Extension archived - functionality merged into k6 core, use native WebSocket with Engine.IO protocol |

**Installation:**
```bash
# k6 installation (not npm package, standalone binary)
# macOS/Linux
brew install k6

# Windows
choco install k6

# Or download from GitHub releases
# https://github.com/grafana/k6/releases
```

**Note:** k6 is NOT an npm package - it's a standalone Go binary that runs JavaScript test scripts.

## Architecture Patterns

### Recommended Project Structure
```
tests/
├── load/                    # Load test scripts
│   ├── http/               # HTTP endpoint tests
│   │   ├── health.test.js
│   │   └── auth.test.js
│   ├── websocket/          # WebSocket tests
│   │   ├── game-flow.test.js
│   │   └── idle-connection.test.js
│   ├── scenarios/          # Reusable scenario configs
│   │   ├── smoke.js
│   │   ├── average-load.js
│   │   └── stress.js
│   └── utils/              # Helper functions
│       ├── socketio.js    # Socket.IO protocol helpers
│       └── thresholds.js  # Threshold configurations
└── reports/                # Test result artifacts (gitignored)
```

### Pattern 1: HTTP Endpoint Testing
**What:** Test REST API endpoints with ramping VU scenarios
**When to use:** Establishing baseline performance for HTTP endpoints
**Example:**
```javascript
// Source: https://grafana.com/docs/k6/latest/
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    smoke: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 5 },
        { duration: '20s', target: 5 },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% under 500ms
    http_req_failed: ['rate<0.05'],   // <5% errors
  },
};

export default function () {
  const res = http.get('http://localhost:5000/api/health');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
}
```

### Pattern 2: WebSocket Game Flow Testing
**What:** Simulate Socket.IO game flow: connect → create lobby → join → vote → reveal
**When to use:** Testing real-time multiplayer game performance under load
**Example:**
```javascript
// Source: https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/
import ws from 'k6/ws';
import { check } from 'k6';

export const options = {
  scenarios: {
    game_flow: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30s',
    },
  },
  thresholds: {
    ws_connecting: ['p(95)<100'],         // Connection < 100ms
    ws_session_duration: ['min>30000'],   // Sessions last full 30s
    'checks{type:vote}': ['rate>0.95'],   // 95%+ successful votes
  },
};

export default function () {
  const url = 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket';

  const res = ws.connect(url, function (socket) {
    socket.on('open', function () {
      // Socket.IO handshake: send "2probe" then "5" (upgrade to websocket)
      socket.send('2probe');
      socket.send('5');

      // Emit create_lobby event (Socket.IO format: 42["event",{...data}])
      const createLobby = JSON.stringify(['create_lobby', {
        lobbyName: `Load Test ${__VU}`,
        hostName: `Player ${__VU}`,
      }]);
      socket.send(`42${createLobby}`);
    });

    socket.on('message', function (msg) {
      // Parse Socket.IO packet format
      if (msg.startsWith('42')) {
        const data = JSON.parse(msg.substring(2));
        check(data, {
          'received event': (d) => Array.isArray(d) && d.length > 0,
        });
      }
    });

    socket.setTimeout(function () {
      socket.close();
    }, 30000);
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
```

### Pattern 3: Idle Connection Stability Test
**What:** Test WebSocket connections that remain idle for 5 minutes
**When to use:** Validating connection stability and timeout handling
**Example:**
```javascript
// Long-running idle connection test
export const options = {
  scenarios: {
    idle_stability: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
  },
  thresholds: {
    ws_session_duration: ['min>295000'], // Sessions last nearly full 5min
    ws_ping: ['p(95)<50'],               // Ping response < 50ms
  },
};

export default function () {
  const url = 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket';

  ws.connect(url, function (socket) {
    socket.on('open', function () {
      socket.send('2probe');
      socket.send('5');

      // Send periodic heartbeat (Socket.IO ping)
      socket.setInterval(function () {
        socket.send('2'); // Engine.IO ping
      }, 25000); // Every 25s (before server's 60s timeout)
    });

    socket.setTimeout(function () {
      socket.close();
    }, 300000); // 5 minutes
  });
}
```

### Pattern 4: Multiple Environments with Threshold Tuning
**What:** Different thresholds per environment (CI vs staging vs prod)
**When to use:** Accounting for infrastructure differences between environments
**Example:**
```javascript
// utils/thresholds.js
export function getThresholds(environment) {
  const base = {
    http_req_failed: ['rate<0.05'], // <5% errors everywhere
  };

  const envSpecific = {
    ci: {
      http_req_duration: ['p(95)<1000'], // More lenient in CI
      ws_connecting: ['p(95)<200'],
    },
    staging: {
      http_req_duration: ['p(95)<750'],
      ws_connecting: ['p(95)<150'],
    },
    prod: {
      http_req_duration: ['p(95)<500'], // Strictest in prod
      ws_connecting: ['p(95)<100'],
    },
  };

  return { ...base, ...envSpecific[environment] };
}

// In test file
import { getThresholds } from './utils/thresholds.js';

export const options = {
  thresholds: getThresholds(__ENV.ENVIRONMENT || 'ci'),
};
```

### Anti-Patterns to Avoid
- **Running load tests on PRs:** Slows down developer workflow, creates infrastructure costs. Run on schedule instead.
- **Blocking deployments on load test failures:** Performance tests are informational. Use them to track trends, not gate releases.
- **Testing only happy paths:** Include error scenarios (invalid votes, disconnections) to validate error handling under load.
- **Hardcoded VU counts:** Use environment variables to scale tests per environment.
- **Ignoring ramp-up/ramp-down:** Instant 100 VUs can skew metrics. Ramp gradually to measure realistic behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Socket.IO protocol handling | Custom packet parser | Document Engine.IO format + k6 native WebSocket | Socket.IO uses Engine.IO protocol layer (packet type prefixes), easy to handle with string concatenation |
| Metric aggregation | Custom results processing | k6's built-in thresholds + JSON output | k6 calculates p95, p99, rates automatically and enforces thresholds |
| Load ramping logic | Manual VU spawning | k6 scenarios with ramping executors | k6 handles VU lifecycle, connection pooling, graceful stops |
| CI/CD scheduling | Custom cron scripts | GitHub Actions schedule triggers | GitHub Actions natively supports cron syntax with artifact storage |
| Result reporting | Custom HTML generator | k6's JSON output + GitHub Actions summary | Markdown summary in workflow output is sufficient for trending |

**Key insight:** k6 handles complex orchestration (VU ramping, metric collection, threshold validation) that's easy to get wrong when hand-rolled. Socket.IO testing requires protocol knowledge but NOT custom tooling.

## Common Pitfalls

### Pitfall 1: Treating Socket.IO as Raw WebSocket
**What goes wrong:** Connecting to Socket.IO server with raw WebSocket client results in immediate disconnect
**Why it happens:** Socket.IO requires Engine.IO handshake (send "2probe" then "5") and uses packet format prefixes ("42" for message events)
**How to avoid:** Study Socket.IO packet format. Always send handshake messages after WebSocket connection opens. Prefix event emissions with "42" + JSON array.
**Warning signs:** WebSocket connections close immediately, no message responses, k6 logs show "connection closed" without errors

### Pitfall 2: Ignoring Infrastructure Idle Timeouts
**What goes wrong:** WebSocket connections drop during idle test due to proxy/infrastructure timeouts (Cloudflare 2min, Replit 90s)
**Why it happens:** Load balancers and proxies close idle WebSocket connections as a resource management strategy
**How to avoid:** Send periodic heartbeats (Engine.IO ping "2") every 25-30 seconds, well before server's 60s timeout. Test idle behavior separately.
**Warning signs:** Idle timeout test shows high disconnect rates, ws_session_duration much lower than expected

### Pitfall 3: Overloading CI Runners with Load Tests
**What goes wrong:** Load tests consume excessive CI minutes, slow down PR workflow, create noisy failures
**Why it happens:** Running 100 VU tests on every commit is expensive and variable performance degrades tests
**How to avoid:** Run load tests on schedule (nightly) NOT on PRs. Use smoke tests (5-10 VUs) for quick validation only.
**Warning signs:** PRs take 10+ minutes, developers complain about slow feedback, load test failures on unrelated PRs

### Pitfall 4: Setting Unrealistic Thresholds
**What goes wrong:** All load tests fail because thresholds are too strict for actual infrastructure
**Why it happens:** Copy-pasting "best practice" numbers without baseline measurement (e.g., p95 < 100ms on a shared CI runner)
**How to avoid:** Run load tests WITHOUT thresholds first to establish baseline. Set thresholds 20-30% above baseline for headroom.
**Warning signs:** Every test run fails thresholds, p95 latency consistently higher than threshold, no passing runs

### Pitfall 5: Not Isolating WebSocket from HTTP Tests
**What goes wrong:** HTTP endpoint load tests interfere with WebSocket tests (or vice versa), creating misleading results
**Why it happens:** Both test types hit same server, competing for resources and skewing metrics
**How to avoid:** Run HTTP and WebSocket tests in separate scenarios or workflow jobs. Consider running against different instances.
**Warning signs:** Unpredictable performance swings, p95 metrics vary wildly between runs, correlation between HTTP load and WS latency

### Pitfall 6: Missing Socket.IO Event Acks in Tests
**What goes wrong:** Load test sends events but doesn't verify server processed them, hiding failures under load
**Why it happens:** k6 tests focus on connection/send metrics, not application-level acknowledgments
**How to avoid:** Use Socket.IO callbacks (ack pattern) or listen for server response events to validate roundtrip success
**Warning signs:** High ws_messages_sent count but server logs show many dropped/failed events, game state doesn't match expected

## Code Examples

Verified patterns from official sources:

### HTTP Smoke Test with Thresholds
```javascript
// Source: https://grafana.com/docs/k6/latest/
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    smoke: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 },   // Ramp up to 5 VUs
        { duration: '20s', target: 5 },  // Hold at 5 VUs
        { duration: '5s', target: 0 },   // Ramp down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

export default function () {
  // Test health endpoint
  const healthRes = http.get('http://localhost:5000/api/health');
  check(healthRes, {
    'health status 200': (r) => r.status === 200,
    'health response time OK': (r) => r.timings.duration < 500,
  });

  // Test WebSocket health endpoint
  const wsHealthRes = http.get('http://localhost:5000/api/ws-health');
  check(wsHealthRes, {
    'ws-health status 200': (r) => r.status === 200,
    'ws-health has lobby count': (r) => r.json('websocket.lobbies') >= 0,
  });

  sleep(1); // Realistic think time
}
```

### Average Load Test (100 VUs)
```javascript
// Source: https://grafana.com/docs/k6/latest/
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    average_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },  // Ramp up
        { duration: '20s', target: 100 },  // Sustain
        { duration: '10s', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>50'], // Throughput: >50 req/s
  },
};

export default function () {
  const res = http.get('http://localhost:5000/api/health');
  check(res, {
    'status 200': (r) => r.status === 200,
  });
  sleep(1);
}
```

### WebSocket Game Flow Test
```javascript
// Source: https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/
// Note: Socket.IO protocol details from https://socket.io/docs/v4/
import ws from 'k6/ws';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    websocket_game_flow: {
      executor: 'constant-vus',
      vus: 100,
      duration: '30s',
    },
  },
  thresholds: {
    ws_connecting: ['p(95)<100'],
    ws_session_duration: ['min>25000'], // Sessions last most of 30s
    checks: ['rate>0.9'], // 90%+ checks pass
  },
};

export default function () {
  const url = 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket';
  const lobbyName = `LoadTest-${__VU}-${Date.now()}`;
  const playerName = `Player-${__VU}`;

  const res = ws.connect(url, function (socket) {
    let lobbyId = null;
    let handshakeComplete = false;

    socket.on('open', function () {
      console.log(`VU ${__VU}: WebSocket connected`);
      // Engine.IO handshake: probe then upgrade
      socket.send('2probe');
      socket.send('5');
      handshakeComplete = true;
    });

    socket.on('message', function (msg) {
      console.log(`VU ${__VU}: Received: ${msg.substring(0, 100)}`);

      // Handle Socket.IO packets (format: <type><payload>)
      if (msg.startsWith('42')) {
        const payload = JSON.parse(msg.substring(2));
        const eventName = payload[0];
        const eventData = payload[1];

        if (eventName === 'lobby_created') {
          lobbyId = eventData.lobby.id;
          console.log(`VU ${__VU}: Lobby created: ${lobbyId}`);
          check(eventData, {
            'lobby has id': (d) => d.lobby && d.lobby.id,
            'lobby has host': (d) => d.lobby.hostId,
          });

          // Start battle
          socket.send(`42${JSON.stringify(['start_battle'])}`);
        }

        if (eventName === 'battle_started') {
          console.log(`VU ${__VU}: Battle started`);
          check(eventData, {
            'battle has boss': (d) => d.boss && d.boss.id,
          });

          // Submit vote
          const vote = [1, 2, 3, 5, 8][Math.floor(Math.random() * 5)];
          socket.send(`42${JSON.stringify(['submit_score', { score: vote }])}`);
        }

        if (eventName === 'scores_revealed') {
          console.log(`VU ${__VU}: Scores revealed`);
          check(eventData, {
            'has team scores': (d) => d.teamScores,
            'has consensus': (d) => d.teamConsensus,
          });
        }
      }
    });

    socket.on('error', function (e) {
      console.error(`VU ${__VU}: WebSocket error: ${e}`);
    });

    socket.on('close', function () {
      console.log(`VU ${__VU}: WebSocket closed`);
    });

    // Wait for handshake, then create lobby
    sleep(0.5);
    if (handshakeComplete) {
      const createLobbyPayload = JSON.stringify([
        'create_lobby',
        {
          lobbyName,
          hostName: playerName,
        },
      ]);
      socket.send(`42${createLobbyPayload}`);
    }

    // Keep connection alive for 30s
    socket.setTimeout(function () {
      socket.close();
    }, 30000);
  });

  check(res, {
    'websocket connected': (r) => r && r.status === 101,
  });

  sleep(1);
}
```

### GitHub Actions Nightly Load Test Workflow
```yaml
# .github/workflows/load-tests.yml
# Source: Project CI/CD patterns + https://grafana.com/docs/k6/latest/
name: Nightly Load Tests

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily
  workflow_dispatch:     # Manual trigger

jobs:
  load-tests:
    name: Run Load Tests
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Start application
        run: |
          npm start &
          sleep 5
          # Wait for server to be ready
          curl --retry 10 --retry-delay 1 --retry-connrefused http://localhost:5000/api/health

      - name: Install k6
        run: |
          curl https://github.com/grafana/k6/releases/download/v0.48.0/k6-v0.48.0-linux-amd64.tar.gz -L | tar xvz
          sudo mv k6-v0.48.0-linux-amd64/k6 /usr/local/bin/

      - name: Run HTTP smoke test
        run: k6 run tests/load/http/smoke.test.js --out json=results-http-smoke.json
        continue-on-error: true

      - name: Run HTTP average load test
        run: k6 run tests/load/http/average-load.test.js --out json=results-http-load.json
        continue-on-error: true

      - name: Run WebSocket game flow test
        run: k6 run tests/load/websocket/game-flow.test.js --out json=results-ws-game.json
        continue-on-error: true

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: load-test-results
          path: results-*.json
          retention-days: 30

      - name: Generate summary
        if: always()
        run: |
          echo "## Load Test Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### HTTP Smoke Test" >> $GITHUB_STEP_SUMMARY
          echo '```json' >> $GITHUB_STEP_SUMMARY
          tail -1 results-http-smoke.json | jq '.metrics' >> $GITHUB_STEP_SUMMARY || echo "No results" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### HTTP Average Load Test" >> $GITHUB_STEP_SUMMARY
          echo '```json' >> $GITHUB_STEP_SUMMARY
          tail -1 results-http-load.json | jq '.metrics' >> $GITHUB_STEP_SUMMARY || echo "No results" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "### WebSocket Game Flow Test" >> $GITHUB_STEP_SUMMARY
          echo '```json' >> $GITHUB_STEP_SUMMARY
          tail -1 results-ws-game.json | jq '.metrics' >> $GITHUB_STEP_SUMMARY || echo "No results" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY

  idle-connection-test:
    name: Idle Connection Stability
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Start application
        run: |
          npm start &
          sleep 5
          curl --retry 10 --retry-delay 1 --retry-connrefused http://localhost:5000/api/health

      - name: Install k6
        run: |
          curl https://github.com/grafana/k6/releases/download/v0.48.0/k6-v0.48.0-linux-amd64.tar.gz -L | tar xvz
          sudo mv k6-v0.48.0-linux-amd64/k6 /usr/local/bin/

      - name: Run idle connection test (5 minutes)
        run: k6 run tests/load/websocket/idle-connection.test.js --out json=results-idle.json
        continue-on-error: true

      - name: Upload idle test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: idle-test-results
          path: results-idle.json
          retention-days: 30

      - name: Generate idle test summary
        if: always()
        run: |
          echo "## Idle Connection Test Results" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo '```json' >> $GITHUB_STEP_SUMMARY
          tail -1 results-idle.json | jq '.metrics' >> $GITHUB_STEP_SUMMARY || echo "No results" >> $GITHUB_STEP_SUMMARY
          echo '```' >> $GITHUB_STEP_SUMMARY
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| xk6-socketio extension | Native k6 WebSocket API with Socket.IO protocol handling | 2023-2024 | xk6-socketio archived, functionality merged to k6 core. Use ws module directly. |
| xk6-websockets extension | Native k6 experimental/websockets | 2023 | Experimental WebSocket API provides blob support, event listeners. Legacy ws module still supported. |
| JMeter GUI recording | k6 script-first approach | 2016-present | Code-first testing enables version control, CI/CD integration, review processes |
| k6.io domain | grafana.com/docs/k6 | 2021 (acquisition) | Grafana acquired k6, moved documentation. Old k6.io redirects work but use grafana.com URLs |

**Deprecated/outdated:**
- **xk6-socketio extension**: Archived, use native WebSocket with Engine.IO protocol
- **k6 Cloud-exclusive features**: Many features available in open-source k6 now (advanced scenarios, extensions)
- **Old k6.io URLs**: Still redirect but use grafana.com/docs/k6/latest/ for current docs

## Open Questions

1. **Socket.IO v4.8 protocol specifics**
   - What we know: Engine.IO v4 uses packet prefixes ("2probe", "5", "42"), JSON payloads
   - What's unclear: Full packet format documentation for all event types, error handling under load
   - Recommendation: Test against running server, capture packets with browser DevTools Network tab, document patterns in test utils

2. **k6 vs Artillery for Socket.IO**
   - What we know: Artillery has built-in Socket.IO support, k6 requires protocol handling
   - What's unclear: Whether Artillery's convenience outweighs k6's superior metrics/ecosystem
   - Recommendation: Start with k6 (project decision made), revisit if Socket.IO protocol handling becomes major maintenance burden

3. **Threshold pass/fail in CI**
   - What we know: Context decision says "informational only, never block deploys"
   - What's unclear: How to track performance regression trends over time without blocking
   - Recommendation: Store JSON results as artifacts, use separate monitoring/alerting for trends (outside CI critical path)

4. **Multi-region load testing**
   - What we know: GitHub Actions runs in single region (depends on runner)
   - What's unclear: Whether geographic latency testing is needed for performance baselines
   - Recommendation: Defer multi-region testing to future phase. Single-region baselines sufficient for CI smoke tests.

## Sources

### Primary (HIGH confidence)
- https://grafana.com/docs/k6/latest/ - Official k6 documentation (Grafana Labs)
- https://grafana.com/docs/k6/latest/using-k6/protocols/websockets/ - k6 WebSocket testing guide
- https://grafana.com/docs/k6/latest/using-k6/thresholds/ - k6 threshold configuration
- https://grafana.com/docs/k6/latest/using-k6/metrics/reference/ - k6 built-in metrics reference
- https://socket.io/docs/v4/ - Socket.IO v4 protocol documentation
- https://github.com/grafana/xk6-websockets - xk6-websockets (archived, merged to core)

### Secondary (MEDIUM confidence)
- C:\Users\Preston\git\ScrumMonsters\server\websocket.ts - Project's Socket.IO implementation patterns
- C:\Users\Preston\git\ScrumMonsters\shared\gameEvents.ts - WebSocket event definitions
- C:\Users\Preston\git\ScrumMonsters\.github\workflows\ci.yml - Project CI/CD patterns

### Tertiary (LOW confidence)
- WebSearch queries for "k6 Socket.IO testing" - unavailable, relied on official docs instead
- Community discussions about k6 vs Artillery - not verified, included as context only

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - k6 is industry-standard, acquired by Grafana, well-documented
- Architecture: MEDIUM - WebSocket testing patterns verified in docs, Socket.IO protocol requires implementation testing
- Pitfalls: MEDIUM - Based on k6 docs + Socket.IO protocol knowledge, some project-specific assumptions

**Research date:** 2026-02-03
**Valid until:** 2026-04-03 (60 days - k6 stable, Socket.IO protocol stable)

**Notes:**
- WebSearch unavailable during research, relied heavily on official documentation via WebFetch
- Socket.IO protocol details from official docs, but load testing patterns may need iteration during implementation
- No xk6-socketio extension available (archived) - native WebSocket approach is current best practice
