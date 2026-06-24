import { describe, it, expect } from 'vitest';
import { worldToPercent, percentToWorld } from './useViewport';

describe('worldToPercent', () => {
  it('converts center of 1920x1080 world to 50%', () => {
    const result = worldToPercent(960, 540, 1920, 1080);
    expect(result.x).toBe(50);
    expect(result.y).toBe(50);
  });

  it('clamps values exceeding 100%', () => {
    const result = worldToPercent(2000, 540, 1920, 1080);
    expect(result.x).toBe(100);
  });

  it('clamps values below 0%', () => {
    const result = worldToPercent(-100, 540, 1920, 1080);
    expect(result.x).toBe(0);
  });

  it('returns exact boundary values without clamping at 0', () => {
    const result = worldToPercent(0, 0, 1920, 1080);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('returns exact boundary values without clamping at 100', () => {
    const result = worldToPercent(1920, 1080, 1920, 1080);
    expect(result.x).toBe(100);
    expect(result.y).toBe(100);
  });
});

describe('percentToWorld', () => {
  it('converts 50% to center of 1920x1080 world', () => {
    const result = percentToWorld(50, 50, 1920, 1080);
    expect(result.x).toBe(960);
    expect(result.y).toBe(540);
  });

  it('does NOT clamp values exceeding 100%', () => {
    const result = percentToWorld(110, 50, 1920, 1080);
    expect(result.x).toBeCloseTo(2112); // 1920 * 1.1
  });

  it('does NOT clamp negative values', () => {
    const result = percentToWorld(-10, 50, 1920, 1080);
    expect(result.x).toBeCloseTo(-192); // 1920 * -0.1
  });

  it('converts 0% to world origin', () => {
    const result = percentToWorld(0, 0, 1920, 1080);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });
});

describe('round-trip (worldToPercent -> percentToWorld)', () => {
  it('round-trips in-bounds world coord back to original within float tolerance', () => {
    const worldX = 800;
    const worldY = 400;
    const pct = worldToPercent(worldX, worldY, 1920, 1080);
    const back = percentToWorld(pct.x, pct.y, 1920, 1080);
    expect(back.x).toBeCloseTo(worldX, 5);
    expect(back.y).toBeCloseTo(worldY, 5);
  });

  it('out-of-bounds world coord clamps to [0,100] percent — the intentional behavior change for sites 2 and 4', () => {
    // A coord beyond the right edge
    const pct = worldToPercent(2500, 540, 1920, 1080);
    expect(pct.x).toBe(100); // clamped
    expect(pct.y).toBe(50);  // in-range, un-clamped

    // A coord beyond the left edge
    const pctLeft = worldToPercent(-200, 540, 1920, 1080);
    expect(pctLeft.x).toBe(0); // clamped
  });
});
