/**
 * k6 HTTP Smoke Test
 *
 * Light load test with minimal VUs to verify basic functionality.
 * Tests health check endpoints with low concurrency.
 *
 * Usage:
 *   k6 run tests/load/http/smoke.test.js
 *   k6 run -e ENVIRONMENT=staging tests/load/http/smoke.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { getHttpThresholds } from '../utils/thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ENVIRONMENT = __ENV.ENVIRONMENT || 'ci';

export const options = {
  scenarios: {
    smoke: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s', target: 5 },   // Ramp up to 5 VUs
        { duration: '20s', target: 5 },  // Hold at 5 VUs
        { duration: '5s', target: 0 },   // Ramp down to 0
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: getHttpThresholds(ENVIRONMENT),
};

export default function () {
  // Test basic health endpoint
  const healthResponse = http.get(`${BASE_URL}/api/health`);
  check(healthResponse, {
    '/api/health status is 200': (r) => r.status === 200,
    '/api/health response time < 500ms': (r) => r.timings.duration < 500,
  });

  // Test WebSocket health endpoint
  const wsHealthResponse = http.get(`${BASE_URL}/api/ws-health`);
  check(wsHealthResponse, {
    '/api/ws-health status is 200': (r) => r.status === 200,
    '/api/ws-health response time < 500ms': (r) => r.timings.duration < 500,
    '/api/ws-health includes websocket.lobbies': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.websocket && typeof body.websocket.lobbies === 'number';
      } catch (e) {
        return false;
      }
    },
  });

  // Think time between iterations
  sleep(1);
}

export function handleSummary(data) {
  return {
    'stdout': textSummary(data),
    'results/smoke-test-results.json': JSON.stringify(data),
  };
}

function textSummary(data) {
  const { metrics } = data;
  const summary = [
    '=== HTTP Smoke Test Summary ===',
    `Duration: ${data.state.testRunDurationMs / 1000}s`,
    `VUs: ${data.metrics.vus?.values?.max || 0} peak`,
    '',
    'Metrics:',
    `  http_reqs: ${metrics.http_reqs?.values?.count || 0} total`,
    `  http_req_duration (p95): ${(metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms`,
    `  http_req_failed: ${((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  checks: ${((metrics.checks?.values?.rate || 0) * 100).toFixed(2)}% passed`,
    '',
  ];

  return summary.join('\n');
}
