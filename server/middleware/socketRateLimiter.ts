/**
 * Per-socket, per-event token-bucket rate limiting for the WebSocket layer
 * (Security: H-6). Deliberately applied to ONLY a small set of expensive /
 * abusable events (see RATE_LIMITS in websocket.ts) — high-frequency gameplay
 * events (movement, charge, jump, votes, emotes) are intentionally NOT limited
 * so real-time responsiveness is unaffected.
 */

export interface RateLimitConfig {
  /** Maximum burst size (tokens available when full). */
  capacity: number;
  /** Sustained refill rate in tokens per second. */
  refillPerSec: number;
}

/**
 * A classic token bucket. `tryRemove()` returns true if a token was available
 * (request allowed) or false if the bucket is empty (request denied). Time is
 * injectable for deterministic tests.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    now: number = Date.now(),
  ) {
    this.tokens = capacity;
    this.lastRefill = now;
  }

  tryRemove(now: number = Date.now()): boolean {
    const elapsedSec = Math.max(0, (now - this.lastRefill) / 1000);
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
    this.lastRefill = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

/**
 * Tracks per-event token buckets for a single socket. Buckets are created lazily
 * the first time an event is seen. Events without a configured limit are always
 * allowed (returns true) and never allocate a bucket.
 */
export class SocketRateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly limits: Readonly<Record<string, RateLimitConfig>>,
  ) {}

  /** Returns true if the event is allowed, false if it exceeds its limit. */
  allow(event: string, now: number = Date.now()): boolean {
    const cfg = this.limits[event];
    if (!cfg) return true; // unlimited event
    let bucket = this.buckets.get(event);
    if (!bucket) {
      bucket = new TokenBucket(cfg.capacity, cfg.refillPerSec, now);
      this.buckets.set(event, bucket);
    }
    return bucket.tryRemove(now);
  }
}
