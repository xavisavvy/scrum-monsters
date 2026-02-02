/**
 * Session Domain Errors
 *
 * Typed exception hierarchy for session validation and lifecycle errors.
 * All session errors extend SessionError with unique error codes for client handling.
 */

/**
 * Base error class for all session-related errors
 */
export class SessionError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SessionError';
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

/**
 * Thrown when attempting to access a lobby that doesn't exist
 */
export class LobbyNotFoundError extends SessionError {
  public readonly lobbyId: string;

  constructor(lobbyId: string) {
    super('LOBBY_NOT_FOUND', `Lobby "${lobbyId}" not found`);
    this.lobbyId = lobbyId;
    this.name = 'LobbyNotFoundError';
    Object.setPrototypeOf(this, LobbyNotFoundError.prototype);
  }
}

/**
 * Thrown when attempting to join a lobby that has reached max capacity
 */
export class LobbyFullError extends SessionError {
  public readonly lobbyId: string;
  public readonly maxPlayers: number;

  constructor(lobbyId: string, maxPlayers: number) {
    super(
      'LOBBY_FULL',
      `Lobby "${lobbyId}" is full (max ${maxPlayers} players)`
    );
    this.lobbyId = lobbyId;
    this.maxPlayers = maxPlayers;
    this.name = 'LobbyFullError';
    Object.setPrototypeOf(this, LobbyFullError.prototype);
  }
}

/**
 * Thrown when attempting to access a player that doesn't exist in the system
 */
export class PlayerNotFoundError extends SessionError {
  public readonly playerId: string;

  constructor(playerId: string) {
    super('PLAYER_NOT_FOUND', `Player "${playerId}" not found`);
    this.playerId = playerId;
    this.name = 'PlayerNotFoundError';
    Object.setPrototypeOf(this, PlayerNotFoundError.prototype);
  }
}

/**
 * Thrown when a non-host player attempts a host-only action
 */
export class PlayerNotHostError extends SessionError {
  public readonly playerId: string;

  constructor(playerId: string) {
    super(
      'NOT_HOST',
      `Player "${playerId}" is not the host and cannot perform this action`
    );
    this.playerId = playerId;
    this.name = 'PlayerNotHostError';
    Object.setPrototypeOf(this, PlayerNotHostError.prototype);
  }
}

/**
 * Thrown when a reconnection attempt fails
 */
export class ReconnectionFailedError extends SessionError {
  public readonly reason: 'invalid_token' | 'lobby_closed' | 'grace_expired';

  constructor(reason: 'invalid_token' | 'lobby_closed' | 'grace_expired') {
    const messages = {
      invalid_token: 'Reconnection token is invalid or tampered',
      lobby_closed: 'Lobby has been closed',
      grace_expired: 'Grace period has expired',
    };

    super('RECONNECTION_FAILED', messages[reason]);
    this.reason = reason;
    this.name = 'ReconnectionFailedError';
    Object.setPrototypeOf(this, ReconnectionFailedError.prototype);
  }
}
