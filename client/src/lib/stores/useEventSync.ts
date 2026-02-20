import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { Socket } from 'socket.io-client';

interface EventSyncState {
  lastSeq: number;
  pendingEvents: Map<number, { event: string; data: any }>;
  isRecovering: boolean;
  pendingOptimistic: Map<string, any>;

  // Event processing and recovery
  handleEvent: (event: string, data: any & { seq: number }, socket: Socket) => boolean;
  processEventQueue: () => void;
  requestMissedEvents: (socket: Socket, lastSeq: number) => void;
  handleMissedEventsReplay: (events: Array<{ event: string; data: any }>) => void;
  handleFullStateRefresh: (lobby: any, seq: number) => void;

  // Optimistic updates
  setOptimistic: (key: string, value: any) => void;
  clearOptimistic: (key: string) => void;
  reconcile: (key: string, serverValue: any) => any;

  // Reset
  reset: () => void;
}

export const useEventSync = create<EventSyncState>()(
  subscribeWithSelector((set, get) => ({
    lastSeq: 0,
    pendingEvents: new Map(),
    isRecovering: false,
    pendingOptimistic: new Map(),

    handleEvent: (event: string, data: any & { seq: number }, socket: Socket): boolean => {
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
      const { lastSeq, pendingEvents } = get();
      let currentSeq = lastSeq;
      const newPendingEvents = new Map(pendingEvents);

      // Process consecutive events from the queue
      while (newPendingEvents.has(currentSeq + 1)) {
        const nextEvent = newPendingEvents.get(currentSeq + 1);
        if (!nextEvent) break;

        // Remove from pending
        newPendingEvents.delete(currentSeq + 1);
        currentSeq++;

        // Update state
        set({
          lastSeq: currentSeq,
          pendingEvents: newPendingEvents
        });
      }
    },

    requestMissedEvents: (socket: Socket, lastSeq: number) => {
      const { isRecovering } = get();

      // Skip if already recovering
      if (isRecovering) {
        return;
      }

      set({ isRecovering: true });
      socket.emit('request_missed_events' as any, { lastSeq });
    },

    handleMissedEventsReplay: (events: Array<{ event: string; data: any }>) => {
      // Process each event in order
      events.forEach((evt) => {
        const { seq, ...payload } = evt.data;
        if (seq) {
          set({ lastSeq: seq });
        }
      });

      // Recovery complete
      set({ isRecovering: false });

      // Process any remaining queued events
      get().processEventQueue();
    },

    handleFullStateRefresh: (lobby: any, seq: number) => {
      set({
        lastSeq: seq,
        pendingEvents: new Map(),
        isRecovering: false
      });
    },

    setOptimistic: (key: string, value: any) => {
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

    reconcile: (key: string, serverValue: any): any => {
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
      set({
        lastSeq: 0,
        pendingEvents: new Map(),
        pendingOptimistic: new Map(),
        isRecovering: false
      });
    }
  }))
);
