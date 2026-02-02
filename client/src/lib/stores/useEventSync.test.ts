import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useEventSync } from './useEventSync';

describe('useEventSync', () => {
  beforeEach(() => {
    // Reset store state before each test
    useEventSync.getState().reset();
  });

  describe('Sequential event processing', () => {
    it('processes first event and updates lastSeq to 1', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, lastSeq: initialSeq } = useEventSync.getState();

      expect(initialSeq).toBe(0);

      const processed = handleEvent('test:event', { seq: 1, data: 'test' }, mockSocket);

      expect(processed).toBe(true);
      expect(useEventSync.getState().lastSeq).toBe(1);
    });

    it('processes consecutive events in order', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      const result1 = handleEvent('test:event1', { seq: 1 }, mockSocket);
      const result2 = handleEvent('test:event2', { seq: 2 }, mockSocket);
      const result3 = handleEvent('test:event3', { seq: 3 }, mockSocket);

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(result3).toBe(true);
      expect(useEventSync.getState().lastSeq).toBe(3);
    });

    it('updates lastSeq correctly after each event', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      expect(useEventSync.getState().lastSeq).toBe(1);

      handleEvent('test:event', { seq: 2 }, mockSocket);
      expect(useEventSync.getState().lastSeq).toBe(2);

      handleEvent('test:event', { seq: 3 }, mockSocket);
      expect(useEventSync.getState().lastSeq).toBe(3);
    });
  });

  describe('Gap detection and automatic recovery', () => {
    it('returns false when gap detected', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      // Process seq 1
      handleEvent('test:event', { seq: 1 }, mockSocket);

      // Gap: jump to seq 5
      const processed = handleEvent('test:event', { seq: 5 }, mockSocket);

      expect(processed).toBe(false);
    });

    it('stores gap event in pendingEvents', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, pendingEvents } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5, data: 'gap-event' }, mockSocket);

      const pending = useEventSync.getState().pendingEvents;
      expect(pending.size).toBe(1);
      expect(pending.get(5)).toEqual({ event: 'test:event', data: { data: 'gap-event' } });
    });

    it('automatically calls requestMissedEvents when gap detected', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledWith('request_missed_events', { lastSeq: 1 });
    });

    it('sets isRecovering to true after gap detection', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket);

      expect(useEventSync.getState().isRecovering).toBe(true);
    });

    it('does NOT call requestMissedEvents again while recovering', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      // First gap
      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket);

      expect(mockSocket.emit).toHaveBeenCalledTimes(1);

      // Second gap while recovering
      handleEvent('test:event', { seq: 10 }, mockSocket);

      // Should still be only 1 call
      expect(mockSocket.emit).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pending event queue', () => {
    it('queues out-of-order events', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket);
      handleEvent('test:event', { seq: 3 }, mockSocket);
      handleEvent('test:event', { seq: 4 }, mockSocket);

      const pending = useEventSync.getState().pendingEvents;
      expect(pending.size).toBe(3); // 3, 4, 5 are pending (waiting for 2)
    });

    it('processes queued events when gap is filled', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      // Setup: seq 1, then gap to 3, 4, 5
      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 3 }, mockSocket);
      handleEvent('test:event', { seq: 4 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket);

      expect(useEventSync.getState().lastSeq).toBe(1);
      expect(useEventSync.getState().pendingEvents.size).toBe(3);

      // Fill the gap with seq 2
      handleEvent('test:event', { seq: 2 }, mockSocket);

      // Should process 2, 3, 4, 5
      expect(useEventSync.getState().lastSeq).toBe(5);
      expect(useEventSync.getState().pendingEvents.size).toBe(0);
    });

    it('processes queue in sequence order', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      // Receive out of order: 1, 5, 3, 4, 2
      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket);
      handleEvent('test:event', { seq: 3 }, mockSocket);
      handleEvent('test:event', { seq: 4 }, mockSocket);

      // Fill gap
      handleEvent('test:event', { seq: 2 }, mockSocket);

      // All should be processed in order (1, 2, 3, 4, 5)
      expect(useEventSync.getState().lastSeq).toBe(5);
    });
  });

  describe('Duplicate handling', () => {
    it('ignores event with seq <= lastSeq', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 2 }, mockSocket);
      handleEvent('test:event', { seq: 3 }, mockSocket);

      // Try to process duplicate seq 2
      const processed = handleEvent('test:event', { seq: 2 }, mockSocket);

      expect(processed).toBe(true); // Returns true (no recovery needed)
      expect(useEventSync.getState().lastSeq).toBe(3); // lastSeq unchanged
    });

    it('returns true for duplicate (no recovery needed)', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      const duplicateResult = handleEvent('test:event', { seq: 1 }, mockSocket);

      expect(duplicateResult).toBe(true);
    });
  });

  describe('Optimistic updates', () => {
    it('setOptimistic stores value', () => {
      const { setOptimistic, pendingOptimistic } = useEventSync.getState();

      setOptimistic('vote', 5);

      const updated = useEventSync.getState().pendingOptimistic;
      expect(updated.get('vote')).toBe(5);
    });

    it('clearOptimistic removes value', () => {
      const { setOptimistic, clearOptimistic } = useEventSync.getState();

      setOptimistic('vote', 5);
      expect(useEventSync.getState().pendingOptimistic.get('vote')).toBe(5);

      clearOptimistic('vote');
      expect(useEventSync.getState().pendingOptimistic.has('vote')).toBe(false);
    });

    it('reconcile returns server value and clears optimistic', () => {
      const { setOptimistic, reconcile } = useEventSync.getState();

      setOptimistic('vote', 5);
      const serverValue = reconcile('vote', 8);

      expect(serverValue).toBe(8);
      expect(useEventSync.getState().pendingOptimistic.has('vote')).toBe(false);
    });
  });

  describe('Reset', () => {
    it('reset clears all state', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, setOptimistic, reset } = useEventSync.getState();

      // Setup some state
      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket); // Create gap
      setOptimistic('vote', 5);

      // Verify state exists
      expect(useEventSync.getState().lastSeq).toBe(1);
      expect(useEventSync.getState().pendingEvents.size).toBeGreaterThan(0);
      expect(useEventSync.getState().isRecovering).toBe(true);
      expect(useEventSync.getState().pendingOptimistic.size).toBeGreaterThan(0);

      // Reset
      reset();

      // Verify all cleared
      const state = useEventSync.getState();
      expect(state.lastSeq).toBe(0);
      expect(state.pendingEvents.size).toBe(0);
      expect(state.isRecovering).toBe(false);
      expect(state.pendingOptimistic.size).toBe(0);
    });

    it('lastSeq returns to 0 after reset', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, reset } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 2 }, mockSocket);

      reset();

      expect(useEventSync.getState().lastSeq).toBe(0);
    });

    it('pendingEvents is empty after reset', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, reset } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket);

      reset();

      expect(useEventSync.getState().pendingEvents.size).toBe(0);
    });
  });

  describe('Missed events replay', () => {
    it('processes missed events and updates lastSeq', () => {
      const { handleMissedEventsReplay } = useEventSync.getState();

      const missedEvents = [
        { event: 'test:event1', data: { seq: 1, value: 'a' } },
        { event: 'test:event2', data: { seq: 2, value: 'b' } },
        { event: 'test:event3', data: { seq: 3, value: 'c' } }
      ];

      handleMissedEventsReplay(missedEvents);

      expect(useEventSync.getState().lastSeq).toBe(3);
    });

    it('sets isRecovering to false after replay', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, handleMissedEventsReplay } = useEventSync.getState();

      // Create gap to trigger recovery
      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket);

      expect(useEventSync.getState().isRecovering).toBe(true);

      // Replay missed events
      handleMissedEventsReplay([
        { event: 'test:event', data: { seq: 2 } },
        { event: 'test:event', data: { seq: 3 } },
        { event: 'test:event', data: { seq: 4 } }
      ]);

      expect(useEventSync.getState().isRecovering).toBe(false);
    });
  });

  describe('Full state refresh', () => {
    it('resets lastSeq to provided sequence', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, handleFullStateRefresh } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 2 }, mockSocket);

      handleFullStateRefresh({}, 10);

      expect(useEventSync.getState().lastSeq).toBe(10);
    });

    it('clears pendingEvents', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, handleFullStateRefresh } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket); // Creates pending

      expect(useEventSync.getState().pendingEvents.size).toBeGreaterThan(0);

      handleFullStateRefresh({}, 10);

      expect(useEventSync.getState().pendingEvents.size).toBe(0);
    });

    it('sets isRecovering to false', () => {
      const mockSocket = { emit: vi.fn() } as any;
      const { handleEvent, handleFullStateRefresh } = useEventSync.getState();

      handleEvent('test:event', { seq: 1 }, mockSocket);
      handleEvent('test:event', { seq: 5 }, mockSocket); // Triggers recovery

      expect(useEventSync.getState().isRecovering).toBe(true);

      handleFullStateRefresh({}, 10);

      expect(useEventSync.getState().isRecovering).toBe(false);
    });
  });
});
