import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Socket } from 'socket.io-client';
import type { Lobby, ServerToClientEvents, ClientToServerEvents } from '@shared/gameEvents';

// Phase 45-05: typed socket so emit() calls type-check against ClientToServerEvents.
type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** A wire payload from any server event — narrowed by the receiving handler. */
type WirePayload = Record<string, unknown> & { seq: number };

interface EventSyncState {
  lastSeq: number;
  pendingEvents: Map<number, { event: string; data: Record<string, unknown> }>;
  isRecovering: boolean;
  pendingOptimistic: Map<string, unknown>;
  /**
   * Bridge to re-apply a recovered event by invoking its registered socket
   * handler. Registered by setupEventHandlers; null in isolation (unit tests),
   * where recovery falls back to advancing lastSeq without re-applying.
   */
  replayDispatch: ((event: string, data: Record<string, unknown>) => void) | null;
  /** Reentrancy guard so re-dispatch during a queue drain can't recurse. */
  isDraining: boolean;

  // Event processing and recovery
  handleEvent: (event: string, data: WirePayload, socket: TypedSocket) => boolean;
  processEventQueue: () => void;
  requestMissedEvents: (socket: TypedSocket, lastSeq: number) => void;
  handleMissedEventsReplay: (events: Array<{ event: string; data: { seq?: number } & Record<string, unknown> }>) => void;
  handleFullStateRefresh: (lobby: Lobby, seq: number) => void;
  setReplayDispatch: (fn: ((event: string, data: Record<string, unknown>) => void) | null) => void;

  // Optimistic updates
  setOptimistic: <T>(key: string, value: T) => void;
  clearOptimistic: (key: string) => void;
  reconcile: <T>(key: string, serverValue: T) => T;

  // Reset
  reset: () => void;
}

export const useEventSync = create<EventSyncState>()(
  subscribeWithSelector((set, get) => ({
    lastSeq: 0,
    pendingEvents: new Map(),
    isRecovering: false,
    pendingOptimistic: new Map(),
    replayDispatch: null,
    isDraining: false,

    handleEvent: (event: string, data: WirePayload, socket: TypedSocket): boolean => {
      const { lastSeq, pendingEvents } = get();
      const { seq, ...payload } = data;

      // Duplicate or old event - ignore but return true (no recovery needed)
      if (seq <= lastSeq) {
        return true;
      }

      // Gap detected - store and trigger recovery
      if (seq > lastSeq + 1) {
        // Store out-of-order event
        const newPendingEvents = new Map(pendingEvents);
        newPendingEvents.set(seq, { event, data: payload });
        set({ pendingEvents: newPendingEvents });

        // Trigger recovery internally
        get().requestMissedEvents(socket, lastSeq);

        return false; // Event not processed yet
      }

      // Expected sequence - process immediately
      set({ lastSeq: seq });

      // Check if we can now process any queued events
      get().processEventQueue();

      return true; // Event processed successfully
    },

    processEventQueue: () => {
      const { replayDispatch, isDraining } = get();

      // No dispatcher wired (isolation / unit tests): preserve legacy behavior —
      // advance lastSeq across the contiguous run without re-applying.
      if (!replayDispatch) {
        const { lastSeq, pendingEvents } = get();
        const newPendingEvents = new Map(pendingEvents);
        let currentSeq = lastSeq;
        while (newPendingEvents.has(currentSeq + 1)) {
          newPendingEvents.delete(currentSeq + 1);
          currentSeq++;
        }
        set({ lastSeq: currentSeq, pendingEvents: newPendingEvents });
        return;
      }

      // Re-dispatch below re-enters handleEvent -> processEventQueue; guard it.
      if (isDraining) return;
      set({ isDraining: true });
      try {
        // Drain the contiguous run, re-applying each event through its handler
        // so buffered state mutations (votes, phase, hp, ...) actually land —
        // previously the payload was dropped and only lastSeq advanced.
        while (true) {
          const { lastSeq, pendingEvents } = get();
          const entry = pendingEvents.get(lastSeq + 1);
          if (!entry) break;

          // Remove BEFORE re-dispatch so the handler's handleEvent sees this as
          // the next in-order event (seq === lastSeq + 1), advances, and applies.
          const newPendingEvents = new Map(pendingEvents);
          newPendingEvents.delete(lastSeq + 1);
          set({ pendingEvents: newPendingEvents });

          // Re-attach the seq stripped at buffer time (storage contract).
          replayDispatch(entry.event, { ...entry.data, seq: lastSeq + 1 });
        }
      } finally {
        set({ isDraining: false });
      }
    },

    requestMissedEvents: (socket: TypedSocket, lastSeq: number) => {
      const { isRecovering } = get();

      // Skip if already recovering
      if (isRecovering) {
        return;
      }

      set({ isRecovering: true });
      socket.emit('request_missed_events', { lastSeq });
    },

    handleMissedEventsReplay: (events) => {
      const { replayDispatch } = get();

      // Apply server-supplied missed events in seq order. With a dispatcher
      // wired, each in-order event is re-applied through its handler; without
      // one (unit tests), they buffer and the legacy drain below advances seq.
      const ordered = [...events].sort(
        (a, b) => (a.data.seq ?? 0) - (b.data.seq ?? 0)
      );

      for (const evt of ordered) {
        const seq = evt.data.seq;
        if (seq === undefined) continue;

        const { lastSeq } = get();
        if (seq <= lastSeq) continue; // already applied

        if (seq === lastSeq + 1 && replayDispatch) {
          // In order: re-apply (the wire payload already carries its seq).
          replayDispatch(evt.event, evt.data);
        } else {
          // Still gapped (or no dispatcher): buffer for the drain below. Strip
          // seq to match the storage contract used by handleEvent.
          const payload: Record<string, unknown> = { ...evt.data };
          delete payload.seq;
          const newPendingEvents = new Map(get().pendingEvents);
          newPendingEvents.set(seq, { event: evt.event, data: payload });
          set({ pendingEvents: newPendingEvents });
        }
      }

      // Recovery complete
      set({ isRecovering: false });

      // Drain anything now contiguous (re-applies with a dispatcher; legacy
      // seq-advance without one).
      get().processEventQueue();
    },

    handleFullStateRefresh: (lobby, seq: number) => {
      void lobby;
      set({
        lastSeq: seq,
        pendingEvents: new Map(),
        isRecovering: false
      });
    },

    setReplayDispatch: (fn) => {
      set({ replayDispatch: fn });
    },

    setOptimistic: <T>(key: string, value: T) => {
      const { pendingOptimistic } = get();
      const newOptimistic = new Map(pendingOptimistic);
      newOptimistic.set(key, value);
      set({ pendingOptimistic: newOptimistic });
    },

    clearOptimistic: (key: string) => {
      const { pendingOptimistic } = get();
      const newOptimistic = new Map(pendingOptimistic);
      newOptimistic.delete(key);
      set({ pendingOptimistic: newOptimistic });
    },

    reconcile: <T>(key: string, serverValue: T): T => {
      const { pendingOptimistic } = get();

      // Get optimistic value
      const optimisticValue = pendingOptimistic.get(key);

      // Clear optimistic state
      get().clearOptimistic(key);

      // Return server value (could add merge logic here if needed)
      if (optimisticValue !== undefined && optimisticValue !== serverValue) {
        if (import.meta.env.DEV && localStorage.getItem('debug')) {
          console.warn(`[EventSync] Reconciling ${key}: optimistic=${optimisticValue}, server=${serverValue}`);
        }
      }

      return serverValue;
    },

    reset: () => {
      // Note: replayDispatch is intentionally NOT cleared here — it is tied to
      // the socket lifecycle (set in setupEventHandlers, cleared in teardown),
      // so a mid-session reset must not degrade recovery to seq-advance-only.
      set({
        lastSeq: 0,
        pendingEvents: new Map(),
        pendingOptimistic: new Map(),
        isRecovering: false,
        isDraining: false
      });
    }
  }))
);
