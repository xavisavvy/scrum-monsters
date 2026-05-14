import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RATE_LIMIT_EXEMPT_PATHS, shouldSkipApiRateLimit } from './rateLimiter.js';

describe('shouldSkipApiRateLimit', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('exempts /health from rate limiting', () => {
    expect(shouldSkipApiRateLimit({ path: '/health' })).toBe(true);
  });

  it('exempts /health/livez and /health/readyz', () => {
    expect(shouldSkipApiRateLimit({ path: '/health/livez' })).toBe(true);
    expect(shouldSkipApiRateLimit({ path: '/health/readyz' })).toBe(true);
  });

  it('exempts /ws-health (used by deploy smoke job)', () => {
    expect(shouldSkipApiRateLimit({ path: '/ws-health' })).toBe(true);
  });

  it('exempts /version (used by client to detect stale chunks)', () => {
    expect(shouldSkipApiRateLimit({ path: '/version' })).toBe(true);
  });

  it('does NOT exempt mutating endpoints — they keep the 200/15min limit', () => {
    expect(shouldSkipApiRateLimit({ path: '/lobbies' })).toBe(false);
    expect(shouldSkipApiRateLimit({ path: '/csrf-token' })).toBe(false);
  });

  it('skips /auth/* and /user/* in the mount-level limiter — their routers apply their own', () => {
    expect(shouldSkipApiRateLimit({ path: '/auth/me' })).toBe(true);
    expect(shouldSkipApiRateLimit({ path: '/auth/login' })).toBe(true);
    expect(shouldSkipApiRateLimit({ path: '/auth/providers' })).toBe(true);
    expect(shouldSkipApiRateLimit({ path: '/user/profile' })).toBe(true);
  });

  it('always skips in NODE_ENV=test (preserves existing test isolation)', () => {
    process.env.NODE_ENV = 'test';
    expect(shouldSkipApiRateLimit({ path: '/lobbies' })).toBe(true);
    expect(shouldSkipApiRateLimit({ path: '/health' })).toBe(true);
  });

  it('exempt list contains exactly the paths the deploy + monitoring stack uses', () => {
    expect(RATE_LIMIT_EXEMPT_PATHS.size).toBe(5);
    expect(RATE_LIMIT_EXEMPT_PATHS.has('/health')).toBe(true);
    expect(RATE_LIMIT_EXEMPT_PATHS.has('/health/livez')).toBe(true);
    expect(RATE_LIMIT_EXEMPT_PATHS.has('/health/readyz')).toBe(true);
    expect(RATE_LIMIT_EXEMPT_PATHS.has('/ws-health')).toBe(true);
    expect(RATE_LIMIT_EXEMPT_PATHS.has('/version')).toBe(true);
  });
});
