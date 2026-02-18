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

  it('renders progress bar with correct values', () => {
    render(<XPBar />);
    const progressbar = document.querySelector('[role="progressbar"]');
    expect(progressbar).toBeInTheDocument();
    expect(progressbar).toHaveAttribute('aria-valuenow', '50');
    expect(progressbar).toHaveAttribute('aria-valuemax', '100');
  });
});
