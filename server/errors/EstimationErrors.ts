/**
 * Estimation Domain Errors
 *
 * Typed exception hierarchy for estimation validation and lifecycle errors.
 * All estimation errors extend EstimationError with unique error codes for client handling.
 */

/**
 * Base error class for all estimation-related errors
 */
export class EstimationError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'EstimationError';
    Object.setPrototypeOf(this, EstimationError.prototype);
  }
}

/**
 * Thrown when attempting to vote without an active estimation session
 */
export class EstimationNotActiveError extends EstimationError {
  public readonly lobbyId: string;

  constructor(lobbyId: string) {
    super('ESTIMATION_NOT_ACTIVE', `No active estimation for lobby '${lobbyId}'`);
    this.lobbyId = lobbyId;
    this.name = 'EstimationNotActiveError';
    Object.setPrototypeOf(this, EstimationNotActiveError.prototype);
  }
}

/**
 * Thrown when a player attempts to vote but is not eligible
 */
export class VoteNotEligibleError extends EstimationError {
  public readonly playerId: string;
  public readonly reason: string;

  constructor(playerId: string, reason: string) {
    super('VOTE_NOT_ELIGIBLE', `Player '${playerId}' not eligible to vote: ${reason}`);
    this.playerId = playerId;
    this.reason = reason;
    this.name = 'VoteNotEligibleError';
    Object.setPrototypeOf(this, VoteNotEligibleError.prototype);
  }
}

/**
 * Thrown when a player submits an invalid vote value
 */
export class InvalidVoteValueError extends EstimationError {
  public readonly value: unknown;

  constructor(value: unknown) {
    super(
      'INVALID_VOTE_VALUE',
      `Invalid vote value: ${value}. Must be Fibonacci (1,2,3,5,8,13,21) or '?' for abstain`
    );
    this.value = value;
    this.name = 'InvalidVoteValueError';
    Object.setPrototypeOf(this, InvalidVoteValueError.prototype);
  }
}

/**
 * Thrown when attempting to vote after consensus is already reached for a team
 */
export class ConsensusAlreadyReachedError extends EstimationError {
  public readonly lobbyId: string;
  public readonly team: string;

  constructor(lobbyId: string, team: string) {
    super(
      'CONSENSUS_ALREADY_REACHED',
      `Consensus already reached for team '${team}' in lobby '${lobbyId}'`
    );
    this.lobbyId = lobbyId;
    this.team = team;
    this.name = 'ConsensusAlreadyReachedError';
    Object.setPrototypeOf(this, ConsensusAlreadyReachedError.prototype);
  }
}

/**
 * Thrown when attempting to change vote outside of discussion phase
 */
export class NotInDiscussionPhaseError extends EstimationError {
  public readonly lobbyId: string;
  public readonly currentPhase: string;

  constructor(lobbyId: string, currentPhase: string) {
    super(
      'NOT_IN_DISCUSSION_PHASE',
      `Cannot change vote: lobby '${lobbyId}' is in '${currentPhase}' phase, not 'discussion'`
    );
    this.lobbyId = lobbyId;
    this.currentPhase = currentPhase;
    this.name = 'NotInDiscussionPhaseError';
    Object.setPrototypeOf(this, NotInDiscussionPhaseError.prototype);
  }
}

/**
 * Thrown when forcing estimate during a tie without specifying value
 */
export class ForceEstimateTieError extends EstimationError {
  public readonly tiedValues: number[];

  constructor(lobbyId: string, tiedValues: number[]) {
    super(
      'FORCE_ESTIMATE_TIE',
      `Vote is tied between [${tiedValues.join(', ')}]. Host must choose one.`
    );
    this.tiedValues = tiedValues;
    this.name = 'ForceEstimateTieError';
    Object.setPrototypeOf(this, ForceEstimateTieError.prototype);
  }
}

/**
 * Thrown when forced value is not one of the tied values
 */
export class InvalidForcedValueError extends EstimationError {
  public readonly forcedValue: number;
  public readonly validValues: number[];

  constructor(forcedValue: number, validValues: number[]) {
    super(
      'INVALID_FORCED_VALUE',
      `Forced value ${forcedValue} is not one of the tied values: [${validValues.join(', ')}]`
    );
    this.forcedValue = forcedValue;
    this.validValues = validValues;
    this.name = 'InvalidForcedValueError';
    Object.setPrototypeOf(this, InvalidForcedValueError.prototype);
  }
}
