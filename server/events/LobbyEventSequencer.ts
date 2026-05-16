/**
 * LobbyEventSequencer
 *
 * Manages sequence number generation and event buffering per lobby.
 * Enables clients to detect missed events and request recovery.
 *
 * Features:
 * - Per-lobby monotonic sequence numbers starting at 1
 * - Circular buffer storing last 100 events per lobby (~30s at 3 events/sec)
 * - Gap detection for missed event recovery
 * - Cleanup on lobby destruction
 */

export interface BufferedEvent {
  seq: number;
  event: string;
  data: unknown;
  timestamp: number;
}

export class LobbyEventSequencer {
  private sequences: Map<string, number> = new Map(); // lobbyId -> current sequence
  private buffers: Map<string, BufferedEvent[]> = new Map(); // lobbyId -> circular buffer
  private readonly BUFFER_SIZE = 100;

  /**
   * Generate next sequence number for a lobby
   * Sequences start at 1 and increment monotonically
   *
   * @param lobbyId - Lobby identifier
   * @returns Next sequence number
   */
  nextSeq(lobbyId: string): number {
    const current = this.sequences.get(lobbyId) ?? 0;
    const next = current + 1;
    this.sequences.set(lobbyId, next);
    return next;
  }

  /**
   * Buffer an event for recovery purposes
   * Maintains circular buffer of last BUFFER_SIZE events
   *
   * @param lobbyId - Lobby identifier
   * @param seq - Event sequence number
   * @param event - Event name
   * @param data - Event payload
   */
  bufferEvent(lobbyId: string, seq: number, event: string, data: unknown): void {
    const buffer = this.buffers.get(lobbyId) ?? [];

    buffer.push({
      seq,
      event,
      data,
      timestamp: Date.now(),
    });

    // Maintain circular buffer size
    if (buffer.length > this.BUFFER_SIZE) {
      buffer.shift();
    }

    this.buffers.set(lobbyId, buffer);
  }

  /**
   * Retrieve events missed by a client
   * Returns null if lobby not found or gap exceeds buffer capacity
   *
   * @param lobbyId - Lobby identifier
   * @param lastSeq - Last sequence number client received
   * @returns Array of missed events, or null if gap too large
   */
  getMissedEvents(lobbyId: string, lastSeq: number): BufferedEvent[] | null {
    // Check if lobby exists by checking sequences map
    if (!this.sequences.has(lobbyId)) {
      return null; // Lobby not found
    }

    const buffer = this.buffers.get(lobbyId);

    if (!buffer || buffer.length === 0) {
      return []; // No events buffered yet
    }

    const oldestSeq = buffer[0].seq;

    // Gap too large - there are missing events between lastSeq and oldest buffered event
    // Example: lastSeq=10, oldestSeq=15 means events 11-14 are missing (gap)
    // But: lastSeq=10, oldestSeq=11 is fine (no gap, just normal progression)
    if (lastSeq + 1 < oldestSeq) {
      return null;
    }

    // Filter events after lastSeq
    return buffer.filter(event => event.seq > lastSeq);
  }

  /**
   * Get current sequence number for a lobby
   * Returns 0 if lobby has no sequences yet
   *
   * @param lobbyId - Lobby identifier
   * @returns Current sequence number
   */
  getCurrentSeq(lobbyId: string): number {
    return this.sequences.get(lobbyId) ?? 0;
  }

  /**
   * Clean up all data for a lobby
   * Should be called when lobby is destroyed
   *
   * @param lobbyId - Lobby identifier
   */
  cleanup(lobbyId: string): void {
    this.sequences.delete(lobbyId);
    this.buffers.delete(lobbyId);
  }
}
