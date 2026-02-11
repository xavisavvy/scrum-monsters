/**
 * Stats Type Definitions
 *
 * Session-scoped stats (accumulated during a game session) and payloads for stats events.
 */

// =============================================================================
// Session Summary Types
// =============================================================================

/**
 * Per-player stats accumulated during a single game session.
 * These stats are ephemeral and cleared when the lobby is destroyed.
 */
export interface SessionSummary {
  /** Total number of votes cast during the session */
  totalVotes: number;
  /** Number of votes that were in consensus */
  consensusCount: number;
  /** Average time from voting start to vote cast (milliseconds) */
  averageVotingSpeedMs: number;
  /** Total damage dealt to bosses */
  totalDamageDealt: number;
  /** Number of bosses defeated */
  bossesDefeated: number;
  /** Number of times this player revived teammates */
  revives: number;
  /** Number of times this player died */
  deaths: number;
  /** Number of items used */
  itemsUsed: number;
}

/**
 * Helper to create an empty session summary (all zeros)
 */
export function createEmptySessionSummary(): SessionSummary {
  return {
    totalVotes: 0,
    consensusCount: 0,
    averageVotingSpeedMs: 0,
    totalDamageDealt: 0,
    bossesDefeated: 0,
    revives: 0,
    deaths: 0,
    itemsUsed: 0,
  };
}

// =============================================================================
// Event Payloads
// =============================================================================

/**
 * Payload for session summary data (sent at game over)
 */
export interface SessionSummaryPayload {
  lobbyId: string;
  /** Map of playerId -> SessionSummary */
  summaries: Record<string, SessionSummary>;
}

/**
 * Payload emitted when session stats are complete (game over or victory)
 */
export interface StatsSessionCompletePayload {
  lobbyId: string;
  /** Map of playerId -> SessionSummary */
  summaries: Record<string, SessionSummary>;
}
