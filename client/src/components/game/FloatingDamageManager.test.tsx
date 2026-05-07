import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useGameState } from '@/lib/stores/useGameState';
import { FloatingDamageManager } from './FloatingDamageManager';

describe('FloatingDamageManager', () => {
  beforeEach(() => {
    // Reset relevant slice between tests
    useGameState.setState({ pendingDamageEvents: [] } as any);
  });

  it('renders nothing when pendingDamageEvents is empty', () => {
    const { container } = render(<FloatingDamageManager />);
    expect(container.textContent).toBe('');
  });

  it('renders -{amount} when a damage event is added', () => {
    const { getByText } = render(<FloatingDamageManager />);
    act(() => {
      useGameState.getState().addPendingDamage({
        id: 'd1',
        playerId: 'p1',
        amount: 25,
        position: { x: 100, y: 200 },
      });
    });
    expect(getByText('-25')).toBeTruthy();
  });

  it('clears the entry from pendingDamageEvents when FloatingDamage onComplete fires', async () => {
    render(<FloatingDamageManager />);
    act(() => {
      useGameState.getState().addPendingDamage({
        id: 'd2',
        playerId: 'p1',
        amount: 10,
        position: { x: 50, y: 50 },
      });
    });

    // Wait for FloatingDamage's default 1000ms duration timeout
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    expect(useGameState.getState().pendingDamageEvents.find((e) => e.id === 'd2')).toBeUndefined();
  });
});
