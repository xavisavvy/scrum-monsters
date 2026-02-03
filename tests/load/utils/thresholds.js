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
