/**
 * EstimationState - Estimation Domain State
 *
 * Represents the voting/estimation domain, separate from Session and Combat
 * domains. This type manages:
 * - Current ticket being estimated (by ID reference)
 * - Player votes (playerId to vote value mapping)
 * - Voting timing
 * - Consensus detection and value
 *
 * Uses ID-based references to maintain domain isolation. Session and player
 * details are stored separately and looked up by ID when needed.
 *
 * Note: Uses Map types for runtime state. These will be converted to Record
 * types for serialization in later phases.
 */

export interface EstimationState {
  /** Reference to session by ID */
  lobbyId: string;

  /** ID of ticket being estimated (optional when no ticket selected) */
  currentTicketId?: string;

  /** Player ID to vote value mapping */
  votes: Map<string, number | '?'>;

  /** Unix timestamp when voting started (optional when voting not active) */
  votingStartedAt?: number;

  /** Whether consensus has been achieved among voters */
  consensusReached: boolean;

  /** The agreed-upon value when consensus reached (optional) */
  consensusValue?: number;
}
