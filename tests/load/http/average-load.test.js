/**
 * k6 HTTP Average Load Test
 *
 * Moderate load test with 100 concurrent VUs to simulate typical traffic.
 * Tests health check endpoints under sustained load.
 *
 * Usage:
 *   k6 run tests/load/http/average-load.test.js
 *   k6 run -e ENVIRONMENT=staging tests/load/http/average-load.test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { getHttpThresholds } from '../utils/thresholds.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';
const ENVIRONMENT = __ENV.ENVIRONMENT || 'ci';

export const options = {
  scenarios: {
    average_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 },  // Ramp up to 100 VUs
        { duration: '20s', target: 100 },  // Hold at 100 VUs
        { duration: '10s', target: 0 },    // Ramp down to 0
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    ...getHttpThresholds(ENVIRONMENT),
    http_reqs: ['rate>50'], // Throughput: minimum 50 requests/second
  },
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
    'results/average-load-test-results.json': JSON.stringify(data),
  };
}

function textSummary(data) {
  const { metrics } = data;
  const summary = [
    '=== HTTP Average Load Test Summary ===',
    `Duration: ${data.state.testRunDurationMs / 1000}s`,
    `VUs: ${data.metrics.vus?.values?.max || 0} peak`,
    '',
    'Metrics:',
    `  http_reqs: ${metrics.http_reqs?.values?.count || 0} total`,
    `  http_reqs (rate): ${(metrics.http_reqs?.values?.rate || 0).toFixed(2)}/s`,
    `  http_req_duration (p95): ${(metrics.http_req_duration?.values['p(95)'] || 0).toFixed(2)}ms`,
    `  http_req_failed: ${((metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  checks: ${((metrics.checks?.values?.rate || 0) * 100).toFixed(2)}% passed`,
    '',
  ];

  return summary.join('\n');
}
