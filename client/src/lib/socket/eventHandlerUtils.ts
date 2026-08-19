import type { ServerToClientEvents, Lobby } from '@shared/gameEvents';
import type { TypedClientSocket } from './eventHandlers';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';

/**
 * Module-level tracking array for all events registered via the helpers.
 * Pushed in both registerSyncedLobbyHandler and registerSyncedHandler.
 * Cleared by teardownSyncedHandlers so registration and teardown can never drift.
 */
const _registeredEvents: Array<keyof ServerToClientEvents> = [];

/**
 * Register a socket handler that:
 * 1. Routes data through the seq-guard (handleEvent)
 * 2. Reads currentLobby (null-checks it)
 * 3. Calls updater(data, currentLobby) → Partial<Lobby> | null
 * 4. Merges result into currentLobby and calls setLobby
 *
 * Use for handlers whose ONLY side effect is a scoped setLobby update.
 *
 * CRITICAL: team derivation is NOT applied here — setLobby in useGameState.tsx:129
 * already applies team derivation inside the store action.
 * Re-deriving here would cause double-derivation (Pitfall 4).
 */
export function registerSyncedLobbyHandler<E extends keyof ServerToClientEvents>(
  socket: TypedClientSocket,
  event: E,
  updater: (data: Parameters<ServerToClientEvents[E]>[0], lobby: Lobby) => Partial<Lobby> | null,
): void {
  // Cast required: TypeScript cannot narrow the generic E inside the callback body
  // when socket.on is typed against a mapped type — see RESEARCH Assumption A2.
  (socket as unknown as { on: (event: string, handler: (data: unknown) => void) => void })
    .on(event as string, (rawData) => {
      const data = rawData as Parameters<ServerToClientEvents[E]>[0];
      const { handleEvent } = useEventSync.getState();
      const processed = handleEvent(event, rawData as Record<string, unknown> & { seq: number }, socket);
      if (processed) {
        const { currentLobby, setLobby } = useGameState.getState();
        if (currentLobby) {
          const update = updater(data, currentLobby);
          if (update !== null) {
            setLobby({ ...currentLobby, ...update });
          }
        }
      }
    });
  _registeredEvents.push(event);
}

/**
 * Register a socket handler that:
 * 1. Routes data through the seq-guard (handleEvent)
 * 2. If processed, calls handler(data) — the handler is responsible for ALL store actions
 *
 * Use for handlers that update non-Lobby stores or need multiple store actions
 * (e.g. setLobby + addPendingDamage, setLobby + setPlayer, setBoss + setLobby).
 */
export function registerSyncedHandler<E extends keyof ServerToClientEvents>(
  socket: TypedClientSocket,
  event: E,
  handler: (data: Parameters<ServerToClientEvents[E]>[0]) => void,
): void {
  // Cast required: TypeScript cannot narrow the generic E inside the callback body
  // when socket.on is typed against a mapped type — see RESEARCH Assumption A2.
  (socket as unknown as { on: (event: string, handler: (data: unknown) => void) => void })
    .on(event as string, (rawData) => {
      const data = rawData as Parameters<ServerToClientEvents[E]>[0];
      const { handleEvent } = useEventSync.getState();
      const processed = handleEvent(event, rawData as Record<string, unknown> & { seq: number }, socket);
      if (processed) {
        handler(data);
      }
    });
  _registeredEvents.push(event);
}

/**
 * Tear down all handlers registered via registerSyncedLobbyHandler/registerSyncedHandler.
 * Call from teardownEventHandlers before the explicit offs for non-standard handlers.
 * Clears the internal tracking array so re-registration after teardown works cleanly.
 */
export function teardownSyncedHandlers(socket: TypedClientSocket): void {
  for (const event of _registeredEvents) {
    socket.off(event);
  }
  _registeredEvents.length = 0;
}
