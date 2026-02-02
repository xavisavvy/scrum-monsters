/**
 * SessionState - Session Domain State
 *
 * Represents the session/lobby lifecycle domain, separate from Estimation
 * and Combat domains. This type manages:
 * - Lobby identity and naming
 * - Host management
 * - Player membership (by ID, not embedded objects)
 * - Game phase transitions
 * - Session timestamps
 *
 * Uses ID-based references to maintain domain isolation. Player details
 * are stored separately and looked up by ID when needed.
 */

import type { GamePhase } from '../gameEvents';

export interface SessionState {
  /** Unique identifier for the session */
  lobbyId: string;

  /** Display name for the lobby */
  name: string;

  /** ID of the current host player */
  hostId: string;

  /** Array of player IDs in this session (not embedded Player objects) */
  playerIds: string[];

  /** Current game phase */
  currentPhase: GamePhase;

  /** Unix timestamp in milliseconds when session was created */
  createdAt: number;

  /** Unix timestamp in milliseconds when session was last modified */
  updatedAt: number;
}
