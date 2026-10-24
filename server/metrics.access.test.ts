import { describe, it, expect } from 'vitest';
import { isMetricsRequestAllowed } from './metrics';

describe('isMetricsRequestAllowed', () => {
  it('allows direct scrapes with no X-Forwarded-For (Prometheus on the Docker network)', () => {
    expect(isMetricsRequestAllowed(undefined, '172.18.0.9', undefined)).toBe(true);
  });

  it('refuses proxied requests when no allowlist is configured', () => {
    expect(isMetricsRequestAllowed('203.0.113.7', '203.0.113.7', undefined)).toBe(false);
    expect(isMetricsRequestAllowed('203.0.113.7', '203.0.113.7', '')).toBe(false);
  });

  it('allows proxied requests from an allowlisted IP', () => {
    expect(isMetricsRequestAllowed('198.51.100.4', '198.51.100.4', '203.0.113.7, 198.51.100.4')).toBe(true);
  });

  it('refuses proxied requests from other IPs', () => {
    expect(isMetricsRequestAllowed('203.0.113.99', '203.0.113.99', '198.51.100.4')).toBe(false);
  });

  it('decides on req.ip, not on a client-supplied X-Forwarded-For entry', () => {
    // Client sends "X-Forwarded-For: <allowlisted ip>"; NPM appends the real address,
    // and with trust proxy = 1 req.ip is that real address.
    expect(isMetricsRequestAllowed('198.51.100.4, 203.0.113.99', '203.0.113.99', '198.51.100.4')).toBe(false);
  });

  it('matches IPv4-mapped IPv6 addresses', () => {
    expect(isMetricsRequestAllowed('198.51.100.4', '::ffff:198.51.100.4', '198.51.100.4')).toBe(true);
  });
});
