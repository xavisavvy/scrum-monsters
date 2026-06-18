import { describe, it, expect } from 'vitest';
import { TokenBucket, SocketRateLimiter } from './socketRateLimiter';

describe('TokenBucket (Security: H-6)', () => {
  it('allows up to capacity in a burst, then denies', () => {
    const b = new TokenBucket(3, 1, 0);
    expect(b.tryRemove(0)).toBe(true);
    expect(b.tryRemove(0)).toBe(true);
    expect(b.tryRemove(0)).toBe(true);
    expect(b.tryRemove(0)).toBe(false); // empty
  });

  it('refills over time at refillPerSec', () => {
    const b = new TokenBucket(2, 1, 0); // 1 token/sec
    b.tryRemove(0);
    b.tryRemove(0);
    expect(b.tryRemove(0)).toBe(false);
    expect(b.tryRemove(1000)).toBe(true);  // +1 token after 1s
    expect(b.tryRemove(1000)).toBe(false);
  });

  it('never exceeds capacity when idle a long time', () => {
    const b = new TokenBucket(2, 1, 0);
    // idle 1 hour, then should still only allow `capacity` in a burst
    expect(b.tryRemove(3_600_000)).toBe(true);
    expect(b.tryRemove(3_600_000)).toBe(true);
    expect(b.tryRemove(3_600_000)).toBe(false);
  });
});

describe('SocketRateLimiter (Security: H-6)', () => {
  const limits = { create_lobby: { capacity: 2, refillPerSec: 0.1 } };

  it('limits configured events per-socket', () => {
    const rl = new SocketRateLimiter(limits);
    expect(rl.allow('create_lobby', 0)).toBe(true);
    expect(rl.allow('create_lobby', 0)).toBe(true);
    expect(rl.allow('create_lobby', 0)).toBe(false); // 3rd in burst denied
  });

  it('never limits unconfigured (hot-path) events', () => {
    const rl = new SocketRateLimiter(limits);
    for (let i = 0; i < 1000; i++) {
      expect(rl.allow('player_pos', 0)).toBe(true);
    }
  });

  it('tracks buckets independently per event', () => {
    const rl = new SocketRateLimiter({
      a: { capacity: 1, refillPerSec: 0 },
      b: { capacity: 1, refillPerSec: 0 },
    });
    expect(rl.allow('a', 0)).toBe(true);
    expect(rl.allow('a', 0)).toBe(false);
    expect(rl.allow('b', 0)).toBe(true); // independent of 'a'
  });
});
