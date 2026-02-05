/**
 * Combat Domain Errors
 *
 * Typed exception hierarchy for combat validation and lifecycle errors.
 * All combat errors extend CombatError with unique error codes for client handling.
 */

/**
 * Base error class for all combat-related errors
 */
export class CombatError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CombatError';
    Object.setPrototypeOf(this, CombatError.prototype);
  }
}

/**
 * Thrown when attempting combat operations without active combat for the lobby
 */
export class CombatNotActiveError extends CombatError {
  public readonly lobbyId: string;

  constructor(lobbyId: string) {
    super('COMBAT_NOT_ACTIVE', `No active combat for lobby '${lobbyId}'`);
    this.lobbyId = lobbyId;
    this.name = 'CombatNotActiveError';
    Object.setPrototypeOf(this, CombatNotActiveError.prototype);
  }
}

/**
 * Thrown when a player attempts combat action but is not in fighting state
 */
export class PlayerNotInCombatError extends CombatError {
  public readonly playerId: string;

  constructor(playerId: string) {
    super('PLAYER_NOT_IN_COMBAT', `Player '${playerId}' is not in combat (may be downed or ghost)`);
    this.playerId = playerId;
    this.name = 'PlayerNotInCombatError';
    Object.setPrototypeOf(this, PlayerNotInCombatError.prototype);
  }
}

/**
 * Thrown when revival attempt is not allowed
 */
export class RevivalNotAllowedError extends CombatError {
  public readonly reason: string;

  constructor(reason: string) {
    super('REVIVAL_NOT_ALLOWED', `Revival not allowed: ${reason}`);
    this.reason = reason;
    this.name = 'RevivalNotAllowedError';
    Object.setPrototypeOf(this, RevivalNotAllowedError.prototype);
  }
}

/**
 * Thrown when a player attempts an invalid attack (downed or ghost state)
 */
export class InvalidAttackError extends CombatError {
  public readonly playerId: string;
  public readonly reason: string;

  constructor(playerId: string, reason: string) {
    super('INVALID_ATTACK', `Player '${playerId}' cannot attack: ${reason}`);
    this.playerId = playerId;
    this.reason = reason;
    this.name = 'InvalidAttackError';
    Object.setPrototypeOf(this, InvalidAttackError.prototype);
  }
}

/**
 * Thrown when a non-healer class attempts to revive another player
 */
export class NotHealerClassError extends CombatError {
  public readonly playerId: string;
  public readonly playerClass: string;

  constructor(playerId: string, playerClass: string) {
    super('NOT_HEALER_CLASS', `Player '${playerId}' (${playerClass}) is not a healer class and cannot revive`);
    this.playerId = playerId;
    this.playerClass = playerClass;
    this.name = 'NotHealerClassError';
    Object.setPrototypeOf(this, NotHealerClassError.prototype);
  }
}
