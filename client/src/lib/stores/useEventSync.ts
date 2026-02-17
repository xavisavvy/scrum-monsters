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
        if (import.meta.env.DEV && localStorage.getItem('debug')) {
          console.log(`[EventSync] Ignoring duplicate/old event ${event} seq=${seq}, lastSeq=${lastSeq}`);
        }
        return true;
      }

      // Gap detected - store and trigger recovery
      if (seq > lastSeq + 1) {
        if (import.meta.env.DEV && localStorage.getItem('debug')) {
          console.warn(`[EventSync] Gap detected: expected ${lastSeq + 1}, got ${seq}. Storing event and triggering recovery.`);
        }

        // Store out-of-order event
        const newPendingEvents = new Map(pendingEvents);
        newPendingEvents.set(seq, { event, data: payload });
        set({ pendingEvents: newPendingEvents });

        // Trigger recovery internally
        get().requestMissedEvents(socket, lastSeq);

        return false; // Event not processed yet
      }

      // Expected sequence - process immediately
      if (import.meta.env.DEV && localStorage.getItem('debug')) {
        console.log(`[EventSync] Processing event ${event} seq=${seq}`);
      }
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

        if (import.meta.env.DEV && localStorage.getItem('debug')) {
          console.log(`[EventSync] Processing queued event ${nextEvent.event} seq=${currentSeq + 1}`);
        }

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
        if (import.meta.env.DEV && localStorage.getItem('debug')) {
          console.log('[EventSync] Already recovering, skipping redundant request');
        }
        return;
      }

      if (import.meta.env.DEV && localStorage.getItem('debug')) {
        console.log(`[EventSync] Requesting missed events from seq=${lastSeq}`);
      }
      set({ isRecovering: true });
      socket.emit('request_missed_events' as any, { lastSeq });
    },

    handleMissedEventsReplay: (events: Array<{ event: string; data: any }>) => {
      if (import.meta.env.DEV && localStorage.getItem('debug')) {
        console.log(`[EventSync] Replaying ${events.length} missed events`);
      }

      // Process each event in order
      events.forEach((evt) => {
        const { seq, ...payload } = evt.data;
        if (seq) {
          if (import.meta.env.DEV && localStorage.getItem('debug')) {
            console.log(`[EventSync] Replaying event ${evt.event} seq=${seq}`);
          }
          set({ lastSeq: seq });
        }
      });

      // Recovery complete
      set({ isRecovering: false });

      // Process any remaining queued events
      get().processEventQueue();
    },

    handleFullStateRefresh: (lobby: any, seq: number) => {
      if (import.meta.env.DEV && localStorage.getItem('debug')) {
        console.log(`[EventSync] Full state refresh at seq=${seq}`);
      }

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
      if (import.meta.env.DEV && localStorage.getItem('debug')) {
        console.log('[EventSync] Resetting state');
      }
      set({
        lastSeq: 0,
        pendingEvents: new Map(),
        pendingOptimistic: new Map(),
        isRecovering: false
      });
    }
  }))
);
