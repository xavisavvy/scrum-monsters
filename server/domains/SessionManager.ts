/**
 * SessionManager Domain
 *
 * Manages player sessions, lobbies, and reconnection state.
 * Owns the lifecycle of lobbies and player membership.
 *
 * Responsibilities:
 * - Create and destroy lobbies
 * - Add/remove players from lobbies
 * - Track disconnected players and reconnection tokens
 * - Host transfer on disconnection
 * - Emit session:* events for cross-domain coordination
 */

import { createHmac, randomBytes } from 'crypto';
import { ScopedEventBus } from '../events';
import {
  Lobby,
  Player,
  TeamType,
  GamePhase,
  DisconnectedPlayer,
  ReconnectToken,
  TimerSettings,
  JiraSettings,
  EstimationSettings,
} from '../../shared/gameEvents';
import {
  SessionError,
  LobbyNotFoundError,
  LobbyFullError,
  PlayerNotFoundError,
  PlayerNotHostError,
  ReconnectionFailedError,
} from '../errors/SessionErrors';

/**
 * Dependencies required by SessionManager
 */
export interface SessionManagerDeps {
  eventBus: ScopedEventBus;
}

/**
 * Optional parameters for lobby creation
 */
export interface CreateLobbyOptions {
  customLobbyId?: string;
  timerSettings?: TimerSettings;
  jiraSettings?: JiraSettings;
  estimationSettings?: EstimationSettings;
}

/**
 * SessionManager manages player sessions, lobbies, and reconnection state
 */
export class SessionManager {
  // State Maps
  private lobbies = new Map<string, Lobby>();
  private playerToLobby = new Map<string, string>();
  private disconnectedPlayers = new Map<string, DisconnectedPlayer>();
  private reconnectTokens = new Map<string, ReconnectToken>();
  private playerActivity = new Map<string, number>();

  // Constants
  private readonly DISCONNECT_GRACE_PERIOD = 10 * 60 * 1000; // 10 minutes
  private readonly TOKEN_EXPIRY_TIME = 5 * 60 * 1000; // 5 minutes per CONTEXT.md
  private readonly TOKEN_SECRET: string;

  // Dependencies
  private readonly eventBus: ScopedEventBus;

  constructor(deps: SessionManagerDeps) {
    this.eventBus = deps.eventBus;

    // Initialize token secret from environment or generate random fallback
    this.TOKEN_SECRET =
      process.env.SESSION_SECRET || randomBytes(32).toString('hex');

    if (!process.env.SESSION_SECRET) {
      console.warn(
        'SESSION_SECRET not set in environment. Using random secret (not suitable for production with multiple instances).'
      );
    }
  }

  /**
   * Creates a new lobby with the host player
   */
  createLobby(
    hostName: string,
    lobbyName: string,
    options?: CreateLobbyOptions
  ): Lobby {
    // Generate lobby ID
    const lobbyId =
      options?.customLobbyId ||
      Math.random().toString(36).substring(2, 8).toUpperCase();

    // Create host player
    const hostId = Math.random().toString(36).substring(2, 15);
    const hostPlayer: Player = {
      id: hostId,
      name: hostName,
      avatar: 'warrior',
      avatarClass: 'warrior',
      team: 'spectators',
      isHost: true,
      hasSubmittedScore: false,
    };

    // Initialize lobby
    const lobby: Lobby = {
      id: lobbyId,
      name: lobbyName,
      hostId: hostId,
      players: [hostPlayer],
      teams: {
        developers: [],
        qa: [],
        spectators: [hostPlayer],
      },
      tickets: [],
      completedTickets: [],
      gamePhase: 'lobby',
      playerCombatStates: {
        [hostId]: {
          maxHp: 100,
          hp: 100,
          isDowned: false,
        },
      },
      playerPositions: {
        [hostId]: {
          x: Math.random() * 80 + 10,
          y: 80,
        },
      },
      teamCompetition: {
        developers: {
          totalStoryPoints: 0,
          ticketsCompleted: 0,
          averageEstimationTime: 0,
          consensusRate: 0,
          accuracyScore: 0,
          participationRate: 0,
          achievements: [],
          currentStreak: 0,
          bestStreak: 0,
        },
        qa: {
          totalStoryPoints: 0,
          ticketsCompleted: 0,
          averageEstimationTime: 0,
          consensusRate: 0,
          accuracyScore: 0,
          participationRate: 0,
          achievements: [],
          currentStreak: 0,
          bestStreak: 0,
        },
        currentRound: 1,
        winnerHistory: [],
        seasonStart: new Date().toISOString(),
      },
      timerSettings: options?.timerSettings,
      jiraSettings: options?.jiraSettings,
      estimationSettings: options?.estimationSettings,
    };

    // Store in state Maps
    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(hostId, lobbyId);
    this.playerActivity.set(hostId, Date.now());

    // Emit domain event
    this.eventBus.emit('session:player_joined', {
      lobbyId,
      playerId: hostId,
      playerName: hostName,
    });

    return lobby;
  }

  /**
   * Adds a player to an existing lobby
   */
  joinLobby(
    lobbyId: string,
    playerName: string
  ): { lobby: Lobby; player: Player } {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      throw new LobbyNotFoundError(lobbyId);
    }

    // Create new player
    const playerId = Math.random().toString(36).substring(2, 15);
    const player: Player = {
      id: playerId,
      name: playerName,
      avatar: 'warrior',
      avatarClass: 'warrior',
      team: 'developers',
      isHost: false,
      hasSubmittedScore: false,
    };

    // Add to lobby
    lobby.players.push(player);

    // Initialize combat state and position
    lobby.playerCombatStates[playerId] = {
      maxHp: 100,
      hp: 100,
      isDowned: false,
    };

    lobby.playerPositions[playerId] = {
      x: Math.random() * 80 + 10,
      y: 80,
    };

    // Update team assignments
    this.updateTeamAssignments(lobby);

    // Store player -> lobby mapping
    this.playerToLobby.set(playerId, lobbyId);
    this.playerActivity.set(playerId, Date.now());

    // Emit domain event
    this.eventBus.emit('session:player_joined', {
      lobbyId,
      playerId,
      playerName,
    });

    return { lobby, player };
  }

  /**
   * Retrieves a lobby by ID, or null if not found
   */
  getLobby(lobbyId: string): Lobby | null {
    return this.lobbies.get(lobbyId) || null;
  }

  /**
   * Gets the lobby a player is currently in
   */
  getPlayerLobby(playerId: string): Lobby | null {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) {
      return null;
    }
    return this.getLobby(lobbyId);
  }

  /**
   * Removes a player from their lobby
   * Returns the updated lobby, or null if lobby was destroyed
   */
  removePlayer(playerId: string): Lobby | null {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) {
      return null;
    }

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return null;
    }

    // Remove player from lobby
    const playerIndex = lobby.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) {
      return null;
    }

    lobby.players.splice(playerIndex, 1);

    // Clean up state
    delete lobby.playerCombatStates[playerId];
    delete lobby.playerPositions[playerId];
    this.playerToLobby.delete(playerId);
    this.playerActivity.delete(playerId);

    // Emit player_left event
    this.eventBus.emit('session:player_left', {
      lobbyId,
      playerId,
    });

    // Check if lobby is empty
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      this.eventBus.emit('session:lobby_destroyed', {
        lobbyId,
      });
      this.eventBus.cleanupScope(lobbyId);
      return null;
    }

    // Check if host left - transfer to next player
    if (lobby.hostId === playerId) {
      const newHost = lobby.players[0];
      const oldHostId = lobby.hostId;
      lobby.hostId = newHost.id;
      newHost.isHost = true;

      this.eventBus.emit('session:host_changed', {
        lobbyId,
        oldHostId,
        newHostId: newHost.id,
      });
    }

    // Update team assignments
    this.updateTeamAssignments(lobby);

    return lobby;
  }

  /**
   * Records player activity timestamp for host transfer logic
   */
  recordPlayerActivity(playerId: string): void {
    this.playerActivity.set(playerId, Date.now());
  }

  /**
   * Updates team assignments based on current player team values
   */
  private updateTeamAssignments(lobby: Lobby): void {
    lobby.teams = {
      developers: lobby.players.filter((p) => p.team === 'developers'),
      qa: lobby.players.filter((p) => p.team === 'qa'),
      spectators: lobby.players.filter((p) => p.team === 'spectators'),
    };
  }
}
