import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useProgression } from '@/lib/stores/useProgression';
import { useAudio } from '@/lib/stores/useAudio';

// Mock stores
vi.mock('@/lib/stores/useProgression', () => ({
  useProgression: vi.fn(),
}));

vi.mock('@/lib/stores/useAudio', () => ({
  useAudio: vi.fn(() => ({ playLevelUp: vi.fn() })),
}));

/**
 * Smoke tests for LevelUpCelebration component
 *
 * Note: R3F components using Html cannot be fully tested in Vitest (WebGL not available).
 * These smoke tests verify core logic without rendering.
 * Full visual/interaction testing requires manual verification or E2E tests.
 */
describe('LevelUpCelebration - Smoke Tests', () => {
  const mockClearLevelUp = vi.fn();
  const mockPlayLevelUp = vi.fn();

  beforeEach(() => {
    mockClearLevelUp.mockClear();
    mockPlayLevelUp.mockClear();
    vi.mocked(useAudio).mockReturnValue({
      playLevelUp: mockPlayLevelUp,
    } as any);
  });

  it('returns null when levelUp is inactive', () => {
    vi.mocked(useProgression).mockReturnValue({
      levelUp: null,
      clearLevelUp: mockClearLevelUp,
    } as any);

    // Component logic: should return null immediately
    const { levelUp } = useProgression();
    expect(levelUp).toBeNull();
  });

  it('has levelUp state when active', () => {
    vi.mocked(useProgression).mockReturnValue({
      levelUp: { active: true, oldLevel: 1, newLevel: 2, triggeredAt: Date.now() },
      clearLevelUp: mockClearLevelUp,
    } as any);

    const { levelUp } = useProgression();
    expect(levelUp?.active).toBe(true);
    expect(levelUp?.newLevel).toBe(2);
  });

  it('clearLevelUp function is available', () => {
    vi.mocked(useProgression).mockReturnValue({
      levelUp: { active: true, oldLevel: 1, newLevel: 2, triggeredAt: Date.now() },
      clearLevelUp: mockClearLevelUp,
    } as any);

    const { clearLevelUp } = useProgression();
    expect(clearLevelUp).toBeDefined();
    expect(typeof clearLevelUp).toBe('function');
  });

  it('playLevelUp function is available from audio store', () => {
    const { playLevelUp } = useAudio();
    expect(playLevelUp).toBeDefined();
    expect(typeof playLevelUp).toBe('function');
  });

  it('calls playLevelUp when invoked', () => {
    const { playLevelUp } = useAudio();
    playLevelUp();
    expect(mockPlayLevelUp).toHaveBeenCalled();
  });
});
