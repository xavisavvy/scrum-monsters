import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { XPBar } from './XPBar';
import { useProgression } from '@/lib/stores/useProgression';

// Mock the store
vi.mock('@/lib/stores/useProgression', () => ({
  useProgression: vi.fn(),
}));

describe('XPBar', () => {
  beforeEach(() => {
    vi.mocked(useProgression).mockReturnValue({
      currentXP: 50,
      currentLevel: 1,
      pendingXPGains: [],
      getProgressToNextLevel: () => ({ current: 50, needed: 100, percentage: 50 }),
    } as any);
  });

  it('displays current level', () => {
    render(<XPBar />);
    expect(screen.getByText('Lv 1')).toBeInTheDocument();
  });

  it('shows XP details on hover', () => {
    render(<XPBar />);
    const container = document.querySelector('.xp-bar-container');
    fireEvent.mouseEnter(container!);
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('100 XP')).toBeInTheDocument();
  });

  it('hides XP details on mouse leave', () => {
    render(<XPBar />);
    const container = document.querySelector('.xp-bar-container');
    fireEvent.mouseEnter(container!);
    fireEvent.mouseLeave(container!);
    expect(screen.queryByText('100 XP')).not.toBeInTheDocument();
  });

  it('sets fill width based on progress percentage', () => {
    render(<XPBar />);
    const fill = document.querySelector('.xp-bar-fill');
    expect(fill).toHaveStyle({ width: '50%' });
  });
});
