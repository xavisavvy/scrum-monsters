/**
 * Strongly-typed EventBus for server-side domain coordination.
 *
 * This EventBus is for INTERNAL server events only, NOT for client communication.
 * Socket.IO handles client-server events separately.
 *
 * Listeners can be async but are NOT awaited (fire-and-forget pattern).
 * Each listener handles its own timing and error handling.
 *
 * Usage:
 *   const eventBus = new EventBus();
 *
 *   // Subscribe to events with full type safety
 *   eventBus.on('estimation:vote_cast', (payload) => {
 *     // payload is typed as EstimationVoteCastPayload
 *     console.log(payload.playerId, payload.vote);
 *   });
 *
 *   // Emit events with compile-time checking
 *   eventBus.emit('estimation:vote_cast', {
 *     lobbyId: 'lobby-123',
 *     playerId: 'player-456',
 *     vote: 5,
 *     team: 'developers'
 *   });
 */

import { EventEmitter } from 'events';
import { DomainEventMap, DomainEventName } from './eventTypes';

/**
 * Listener function type for domain events.
 * Supports both sync and async handlers (async handlers run fire-and-forget).
 */
export type DomainEventListener<K extends DomainEventName> = (
  payload: DomainEventMap[K]
) => void | Promise<void>;

/**
 * Strongly-typed EventBus extending Node.js EventEmitter.
 *
 * Provides compile-time type checking for:
 * - Event names (only valid DomainEventName values allowed)
 * - Event payloads (must match the event's defined payload type)
 * - Listener signatures (receive correctly typed payload)
 */
export class EventBus extends EventEmitter {
  /**
   * Emit a domain event with a typed payload.
   *
   * @param event - The domain event name (e.g., 'estimation:vote_cast')
   * @param payload - The event payload matching the event's type definition
   * @returns true if listeners exist, false otherwise
   */
  emit<K extends DomainEventName>(event: K, payload: DomainEventMap[K]): boolean {
    return super.emit(event, payload);
  }

  /**
   * Subscribe to a domain event with a typed listener.
   *
   * Listeners can be async - they run fire-and-forget (emit() does not await).
   * Each listener is responsible for its own error handling.
   *
   * @param event - The domain event name to subscribe to
   * @param listener - Handler function receiving the typed payload
   * @returns this (for chaining)
   */
  on<K extends DomainEventName>(
    event: K,
    listener: DomainEventListener<K>
  ): this {
    return super.on(event, listener);
  }

  /**
   * Subscribe to a domain event for a single occurrence.
   *
   * The listener is automatically removed after the first event.
   *
   * @param event - The domain event name to subscribe to
   * @param listener - Handler function receiving the typed payload
   * @returns this (for chaining)
   */
  once<K extends DomainEventName>(
    event: K,
    listener: DomainEventListener<K>
  ): this {
    return super.once(event, listener);
  }

  /**
   * Unsubscribe a listener from a domain event.
   *
   * @param event - The domain event name
   * @param listener - The exact listener function to remove
   * @returns this (for chaining)
   */
  off<K extends DomainEventName>(
    event: K,
    listener: DomainEventListener<K>
  ): this {
    return super.off(event, listener);
  }

  /**
   * Get all registered event names (for debugging).
   *
   * @returns Array of currently registered domain event names
   */
  getRegisteredEvents(): DomainEventName[] {
    return this.eventNames() as DomainEventName[];
  }

  /**
   * Get the count of listeners for a specific event (for debugging).
   *
   * @param event - The domain event name
   * @returns Number of listeners registered for this event
   */
  getListenerCount<K extends DomainEventName>(event: K): number {
    return this.listenerCount(event);
  }
}

export default EventBus;
