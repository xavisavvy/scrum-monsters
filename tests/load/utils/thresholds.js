/**
 * k6 threshold configurations for load testing
 *
 * Provides environment-specific threshold settings for HTTP and WebSocket tests.
 * Environments: 'ci' (lenient), 'staging', 'prod' (strict)
 */

/**
 * Get HTTP threshold configuration for the specified environment
 *
 * @param {string} environment - Target environment ('ci', 'staging', or 'prod')
 * @returns {Object} k6 threshold configuration
 */
export function getHttpThresholds(environment = 'ci') {
  const configs = {
    ci: {
      // CI environment - lenient thresholds
      http_req_duration: ['p(95)<1000'], // p95 < 1000ms
      http_req_failed: ['rate<0.05'],    // < 5% error rate
      checks: ['rate>0.95'],              // > 95% checks pass
    },
    staging: {
      // Staging environment - moderate thresholds
      http_req_duration: ['p(95)<750'],  // p95 < 750ms
      http_req_failed: ['rate<0.05'],    // < 5% error rate
      checks: ['rate>0.95'],              // > 95% checks pass
    },
    prod: {
      // Production environment - strict thresholds
      http_req_duration: ['p(95)<500'],  // p95 < 500ms
      http_req_failed: ['rate<0.05'],    // < 5% error rate
      checks: ['rate>0.95'],              // > 95% checks pass
    },
  };

  return configs[environment] || configs.ci;
}

/**
 * Get WebSocket threshold configuration for the specified environment
 *
 * WebSocket thresholds are stricter than HTTP for real-time responsiveness
 *
 * @param {string} environment - Target environment ('ci', 'staging', or 'prod')
 * @returns {Object} k6 threshold configuration
 */
export function getWebSocketThresholds(environment = 'ci') {
  const configs = {
    ci: {
      // CI environment - lenient thresholds
      ws_connecting: ['p(95)<500'],      // Connection time p95 < 500ms
      ws_msgs_received: ['count>0'],     // Must receive messages
      checks: ['rate>0.95'],              // > 95% checks pass
    },
    staging: {
      // Staging environment - moderate thresholds
      ws_connecting: ['p(95)<300'],      // Connection time p95 < 300ms
      ws_msgs_received: ['count>0'],     // Must receive messages
      checks: ['rate>0.95'],              // > 95% checks pass
    },
    prod: {
      // Production environment - strict thresholds
      ws_connecting: ['p(95)<100'],      // Connection time p95 < 100ms
      ws_msgs_received: ['count>0'],     // Must receive messages
      checks: ['rate>0.95'],              // > 95% checks pass
    },
  };

  return configs[environment] || configs.ci;
}

/**
 * Get WebSocket game flow threshold configuration for the specified environment
 *
 * Stricter thresholds for game flow tests with session duration requirements
 *
 * @param {string} environment - Target environment ('ci', 'staging', or 'prod')
 * @returns {Object} k6 threshold configuration
 */
export function getWsThresholds(environment = 'ci') {
  const base = {
    checks: ['rate>0.90'],              // > 90% checks pass (game flow may have timing variance)
    ws_session_duration: ['min>25000'], // Sessions last at least 25s of 30s test
  };

  const envSpecific = {
    ci: {
      ws_connecting: ['p(95)<200'],    // Connection time p95 < 200ms (more lenient in CI)
    },
    staging: {
      ws_connecting: ['p(95)<150'],    // Connection time p95 < 150ms
    },
    prod: {
      ws_connecting: ['p(95)<100'],    // Connection time p95 < 100ms (strictest in prod)
    },
  };

  return { ...base, ...(envSpecific[environment] || envSpecific.ci) };
}
