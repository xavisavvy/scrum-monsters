import { EventBus } from './EventBus';
import { DomainEventMap, DomainEventName } from './eventTypes';

/**
 * Tracked listener entry for scope cleanup
 */
interface TrackedListener {
  event: DomainEventName;
  listener: Function;
}

/**
 * EventBus extension with scoped subscription management.
 *
 * MEMORY LEAK PREVENTION CONTRACT:
 *
 * 1. When a lobby is created, domain managers register listeners using subscribeScoped(lobbyId, ...)
 * 2. When a lobby is destroyed, call cleanupScope(lobbyId) to remove ALL listeners for that lobby
 * 3. This prevents listeners from accumulating and causing memory leaks
 *
 * WARNING: If you use regular on() instead of subscribeScoped(), YOU are responsible
 * for calling off() when the lobby is destroyed. Prefer subscribeScoped() for lobby-specific listeners.
 *
 * @example
 * ```typescript
 * const eventBus = new ScopedEventBus();
 *
 * // When creating a lobby's domain managers:
 * eventBus.subscribeScoped(lobbyId, 'estimation:vote_cast', (payload) => {
 *   // Handle vote
 * });
 *
 * // When destroying a lobby:
 * eventBus.cleanupScope(lobbyId);  // Removes all listeners for this lobby
 * ```
 */
export class ScopedEventBus extends EventBus {
  private scopedListeners = new Map<string, TrackedListener[]>();

  /**
   * Subscribe to an event with scope tracking for automatic cleanup.
   *
   * Use this instead of on() for lobby-specific listeners to prevent memory leaks.
   *
   * @param scope - The scope identifier (typically lobbyId)
   * @param event - The event name to listen to
   * @param listener - The callback function
   */
  subscribeScoped<K extends DomainEventName>(
    scope: string,
    event: K,
    listener: (payload: DomainEventMap[K]) => void | Promise<void>
  ): this {
    // Register with base EventEmitter
    this.on(event, listener);

    // Track for cleanup
    if (!this.scopedListeners.has(scope)) {
      this.scopedListeners.set(scope, []);
    }
    this.scopedListeners.get(scope)!.push({ event, listener });

    return this;
  }

  /**
   * Clean up ALL listeners registered for a given scope.
   *
   * MUST be called when a lobby is destroyed to prevent memory leaks.
   *
   * @param scope - The scope identifier (typically lobbyId)
   * @returns Number of listeners removed
   */
  cleanupScope(scope: string): number {
    const listeners = this.scopedListeners.get(scope);
    if (!listeners || listeners.length === 0) {
      return 0;
    }

    let removed = 0;
    for (const { event, listener } of listeners) {
      this.off(event, listener as any);
      removed++;
    }

    this.scopedListeners.delete(scope);
    return removed;
  }

  /**
   * Get the number of listeners registered for a scope (for debugging/monitoring).
   *
   * @param scope - The scope identifier
   * @returns Number of tracked listeners for this scope
   */
  getScopeListenerCount(scope: string): number {
    return this.scopedListeners.get(scope)?.length ?? 0;
  }

  /**
   * Get all active scopes (for debugging/monitoring).
   *
   * @returns Array of scope identifiers that have registered listeners
   */
  getActiveScopes(): string[] {
    return Array.from(this.scopedListeners.keys());
  }

  /**
   * Get total number of scoped listeners across all scopes (for monitoring).
   */
  getTotalScopedListenerCount(): number {
    let total = 0;
    for (const listeners of this.scopedListeners.values()) {
      total += listeners.length;
    }
    return total;
  }
}
