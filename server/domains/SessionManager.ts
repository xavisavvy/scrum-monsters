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

import { createHmac, randomBytes, randomInt } from 'crypto';
import { ScopedEventBus } from '../events';
import { gameLogger } from '../logger.js';
import {
  Lobby,
  Player,
  TeamType,
  DisconnectedPlayer,
  ReconnectToken,
  TimerSettings,
  JiraSettings,
  EstimationSettings,
  AvatarClass,
} from '../../shared/gameEvents';
import {
  LobbyNotFoundError,
  PlayerNotFoundError,
  PlayerNotHostError,
} from '../errors/SessionErrors';

const LOBBY_CODE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function generateSecureLobbyCode(): string {
  // Uniform sampling via crypto.randomInt (avoids the modulo-bias that
  // randomBytes(6).map(b => charset[b % 36]) introduces — 256 % 36 = 4,
  // so bytes 252-255 give A-D one extra mapping each). CodeQL
  // js/biased-cryptographic-random.
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += LOBBY_CODE_CHARSET[randomInt(LOBBY_CODE_CHARSET.length)];
  }
  return code;
}

function generateSecureId(): string {
  return randomBytes(8).toString('hex').substring(0, 13);
}

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
  // Aligned with DISCONNECT_GRACE_PERIOD so a player in the grace window cannot hold a structurally expired token. Trade-off: wider replay window — acceptable given HMAC signature + per-player binding. (Phase 41)
  private readonly TOKEN_EXPIRY_TIME = 10 * 60 * 1000; // 10 minutes
  private readonly TOKEN_SECRET: string;

  // Dependencies
  private readonly eventBus: ScopedEventBus;

  constructor(deps: SessionManagerDeps) {
    this.eventBus = deps.eventBus;

    // Initialize token secret from environment or generate random fallback
    this.TOKEN_SECRET =
      process.env.SESSION_SECRET || randomBytes(32).toString('hex');

    if (!process.env.SESSION_SECRET) {
      gameLogger.warn(
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
      generateSecureLobbyCode();

    // Create host player
    const hostId = generateSecureId();
    const hostPlayer: Player = {
      id: hostId,
      name: hostName,
      avatar: 'warrior',
      avatarClass: 'warrior',
      team: 'spectators',
      isHost: true,
      hasSubmittedScore: false,
      level: 1,
      // avatar_selection -> lobby UX gate. Host sees AvatarSelection screen on
      // create_lobby and flips this true via select_avatar.
      hasSelectedAvatar: false,
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

    // Emit domain event. team + avatar must be included so other clients'
    // incremental session:player_joined handler can place this player on the
    // right Battle Teams panel — without them, the player is added to the
    // local lobby with team=undefined and never appears in any team group
    // (host's view bug 2026-05-08, post-Phase 42-02b).
    this.eventBus.emit('session:player_joined', {
      lobbyId,
      playerId: hostId,
      playerName: hostName,
      team: hostPlayer.team,
      avatar: hostPlayer.avatar,
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

    // Phase 41 defense: a connected player with this exact name already in the
    // lobby means a duplicate join_lobby (e.g. GamePage auto-join racing a
    // just-created lobby). Return the existing record instead of minting a
    // phantom player.
    const existingConnected = lobby.players.find(
      (p) => p.name === playerName && !this.disconnectedPlayers.has(p.id)
    );
    if (existingConnected) {
      gameLogger.info(
        { lobbyId, playerName, playerId: existingConnected.id },
        'join_lobby called for already-present connected player; returning existing'
      );
      return { lobby, player: existingConnected };
    }

    // Check for any existing disconnected players with the same name
    // This handles the case where reconnect token expired but player is still in lobby
    const stalePlayersToRemove = lobby.players.filter(
      (p) => p.name === playerName && this.disconnectedPlayers.has(p.id)
    );

    // Preserve avatar and team from stale player if exists
    let preservedAvatar: AvatarClass | undefined;
    let preservedTeam: TeamType | undefined;
    for (const stalePlayer of stalePlayersToRemove) {
      gameLogger.info({ playerName: stalePlayer.name, playerId: stalePlayer.id }, 'Removing stale disconnected player before rejoin');
      // Preserve avatar and team selection from the old player
      if (stalePlayer.avatarClass && stalePlayer.avatarClass !== 'warrior') {
        preservedAvatar = stalePlayer.avatarClass;
        gameLogger.debug({ preservedAvatar }, 'Preserving avatar');
      }
      if (stalePlayer.team) {
        preservedTeam = stalePlayer.team;
        gameLogger.debug({ preservedTeam }, 'Preserving team');
      }
      // Clean up the old player
      this.disconnectedPlayers.delete(stalePlayer.id);
      // Remove any reconnect tokens for this player
      for (const [tokenString, token] of this.reconnectTokens.entries()) {
        if (token.playerId === stalePlayer.id) {
          this.reconnectTokens.delete(tokenString);
        }
      }
      // Remove from lobby
      this.removePlayer(stalePlayer.id);
    }

    // Re-fetch lobby in case it was modified by removePlayer
    const updatedLobby = this.lobbies.get(lobbyId);
    if (!updatedLobby) {
      throw new LobbyNotFoundError(lobbyId);
    }

    // Check if there's an active host (not disconnected)
    const currentHost = updatedLobby.players.find(p => p.id === updatedLobby.hostId);
    const hostIsDisconnected = currentHost ? this.disconnectedPlayers.has(currentHost.id) : false;
    const noActiveHost = !currentHost || hostIsDisconnected;

    // Create new player - make them host if no active host exists
    // Use preserved avatar/team from stale player if available
    const playerId = generateSecureId();
    const player: Player = {
      id: playerId,
      name: playerName,
      avatar: preservedAvatar || 'warrior',
      avatarClass: preservedAvatar || 'warrior',
      team: preservedTeam || 'developers',
      isHost: noActiveHost,
      hasSubmittedScore: false,
      level: 1,
      // Preserve avatar-selection state across stale-player rejoins: if we
      // restored a non-default avatar from the disconnected player, the user
      // already made their choice and should skip the AvatarSelection screen.
      // Fresh joiners (no preservedAvatar) start with the gate closed.
      hasSelectedAvatar: preservedAvatar !== undefined,
    };

    // If becoming host, update lobby.hostId and demote old host
    if (noActiveHost) {
      if (currentHost) {
        currentHost.isHost = false;
      }
      updatedLobby.hostId = playerId;
    }

    // Add to lobby
    updatedLobby.players.push(player);

    // Initialize combat state and position
    updatedLobby.playerCombatStates[playerId] = {
      maxHp: 100,
      hp: 100,
      isDowned: false,
    };

    updatedLobby.playerPositions[playerId] = {
      x: Math.random() * 80 + 10,
      y: 80,
    };

    // Update team assignments
    this.updateTeamAssignments(updatedLobby);

    // Store player -> lobby mapping
    this.playerToLobby.set(playerId, lobbyId);
    this.playerActivity.set(playerId, Date.now());

    // Emit domain event. team + avatar must be included so the host's
    // incremental session:player_joined handler can place this new player
    // on the right Battle Teams panel — see comment above for the bug
    // this prevents.
    this.eventBus.emit('session:player_joined', {
      lobbyId,
      playerId,
      playerName,
      team: player.team,
      avatar: player.avatar,
    });

    return { lobby: updatedLobby, player };
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
   * Promotes a new host using activity-based selection
   * Selects most recently active connected player (excluding old host)
   * Returns new host info or null if no eligible players
   */
  promoteNewHost(
    lobbyId: string,
    oldHostId: string
  ): { newHostId: string; newHostName: string } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    // Get connected players excluding old host
    const connectedPlayers = lobby.players.filter(
      (p) => p.id !== oldHostId && !this.disconnectedPlayers.has(p.id)
    );

    if (connectedPlayers.length === 0) return null;

    // Sort by most recent activity (descending)
    const sortedByActivity = connectedPlayers.sort((a, b) => {
      const aActivity = this.playerActivity.get(a.id) ?? 0;
      const bActivity = this.playerActivity.get(b.id) ?? 0;
      return bActivity - aActivity;
    });

    const newHost = sortedByActivity[0];

    // Update flags
    const oldHost = lobby.players.find((p) => p.id === oldHostId);
    if (oldHost) oldHost.isHost = false;
    newHost.isHost = true;
    lobby.hostId = newHost.id;

    // Emit event
    this.eventBus.emit('session:host_changed', {
      lobbyId,
      oldHostId,
      newHostId: newHost.id,
    });

    return { newHostId: newHost.id, newHostName: newHost.name };
  }

  /**
   * Updates a player's team and refreshes team assignments
   */
  private updatePlayerTeam(playerId: string, team: TeamType): Lobby {
    const lobby = this.getPlayerLobby(playerId);
    if (!lobby) {
      throw new PlayerNotFoundError(playerId);
    }

    const player = lobby.players.find((p) => p.id === playerId);
    if (!player) {
      throw new PlayerNotFoundError(playerId);
    }

    // Save old team for event
    const oldTeam = player.team;

    // Update player team
    player.team = team;

    // Update team assignments
    this.updateTeamAssignments(lobby);

    // Emit team changed event
    if (oldTeam !== team) {
      this.eventBus.emit('session:team_changed', {
        lobbyId: lobby.id,
        playerId,
        oldTeam,
        newTeam: team,
      });
    }

    return lobby;
  }

  /**
   * Changes a player's own team (self-service)
   */
  changeOwnTeam(playerId: string, team: TeamType): Lobby {
    return this.updatePlayerTeam(playerId, team);
  }

  /**
   * Assigns a target player to a team (requires host privileges)
   */
  assignTeam(
    assignerId: string,
    targetPlayerId: string,
    team: TeamType
  ): Lobby {
    const lobby = this.getPlayerLobby(assignerId);
    if (!lobby) {
      throw new PlayerNotFoundError(assignerId);
    }

    const assigner = lobby.players.find((p) => p.id === assignerId);
    if (!assigner) {
      throw new PlayerNotFoundError(assignerId);
    }

    // Check host privileges
    if (!assigner.isHost) {
      throw new PlayerNotHostError(assignerId);
    }

    // Find target player
    const targetPlayer = lobby.players.find((p) => p.id === targetPlayerId);
    if (!targetPlayer) {
      throw new PlayerNotFoundError(targetPlayerId);
    }

    // Update target player's team
    targetPlayer.team = team;

    // Update team assignments
    this.updateTeamAssignments(lobby);

    return lobby;
  }

  /**
   * Manually transfers host privileges (host can transfer to any player)
   */
  manualHostTransfer(
    currentHostId: string,
    newHostId: string
  ): Lobby {
    const lobby = this.getPlayerLobby(currentHostId);
    if (!lobby) {
      throw new PlayerNotFoundError(currentHostId);
    }

    const currentHost = lobby.players.find((p) => p.id === currentHostId);
    if (!currentHost) {
      throw new PlayerNotFoundError(currentHostId);
    }

    // Validate current host is actually host
    if (!currentHost.isHost) {
      throw new PlayerNotHostError(currentHostId);
    }

    // Find new host player
    const newHost = lobby.players.find((p) => p.id === newHostId);
    if (!newHost) {
      throw new PlayerNotFoundError(newHostId);
    }

    // Update host flags
    currentHost.isHost = false;
    newHost.isHost = true;
    lobby.hostId = newHost.id;

    // Emit event
    this.eventBus.emit('session:host_changed', {
      lobbyId: lobby.id,
      oldHostId: currentHostId,
      newHostId: newHost.id,
    });

    return lobby;
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

  /**
   * Generates a signed reconnect token for a player
   */
  generateReconnectToken(
    playerId: string,
    lobbyId: string,
    playerName: string
  ): string {
    const now = Date.now();
    const tokenData = {
      playerId,
      lobbyId,
      playerName,
      issuedAt: now,
      expiresAt: now + this.TOKEN_EXPIRY_TIME,
    };

    // Create signature
    const tokenPayload = JSON.stringify(tokenData);
    const signature = createHmac('sha256', this.TOKEN_SECRET)
      .update(tokenPayload)
      .digest('hex');

    // Encode token
    const tokenString = Buffer.from(
      JSON.stringify({ ...tokenData, signature })
    ).toString('base64');

    // Store in reconnectTokens Map
    this.reconnectTokens.set(tokenString, {
      ...tokenData,
      signature,
    });

    return tokenString;
  }

  /**
   * Validates a reconnect token and returns the token data if valid
   */
  validateReconnectToken(tokenString: string): ReconnectToken | null {
    try {
      // Decode token
      const decoded = JSON.parse(
        Buffer.from(tokenString, 'base64').toString()
      );

      // Check if token exists in Map
      const storedToken = this.reconnectTokens.get(tokenString);
      if (!storedToken) {
        return null;
      }

      // Check expiry
      if (decoded.expiresAt < Date.now()) {
        this.reconnectTokens.delete(tokenString);
        return null;
      }

      // Verify signature
      const { signature, ...tokenData } = decoded;
      const expectedSignature = createHmac('sha256', this.TOKEN_SECRET)
        .update(JSON.stringify(tokenData))
        .digest('hex');

      if (signature !== expectedSignature) {
        this.reconnectTokens.delete(tokenString);
        return null;
      }

      return storedToken;
    } catch (error) {
      return null;
    }
  }

  /**
   * Handles player disconnection, creating a DisconnectedPlayer record
   * and generating a reconnect token
   */
  handlePlayerDisconnect(playerId: string): {
    disconnectedPlayer: DisconnectedPlayer;
    reconnectToken: string;
    hostTransfer?: { newHostId: string; newHostName: string; oldHostId: string };
  } | null {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) {
      return null;
    }

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      return null;
    }

    const player = lobby.players.find((p) => p.id === playerId);
    if (!player) {
      return null;
    }

    // Create DisconnectedPlayer record
    const now = Date.now();
    const disconnectedPlayer: DisconnectedPlayer = {
      playerId,
      lobbyId,
      playerName: player.name,
      disconnectedAt: now,
      graceExpiresAt: now + this.DISCONNECT_GRACE_PERIOD,
      lastKnownPosition: lobby.playerPositions[playerId],
      lastKnownCombatState: lobby.playerCombatStates[playerId],
    };

    // Store in disconnectedPlayers Map
    this.disconnectedPlayers.set(playerId, disconnectedPlayer);

    // Generate reconnect token
    const reconnectToken = this.generateReconnectToken(
      playerId,
      lobbyId,
      player.name
    );

    // Phase 41-02: Defer host transfer until grace expiry. Mark wasHost on the
    // DisconnectedPlayer record; if the host reconnects within the grace
    // window, attemptPlayerReconnect restores host. If grace expires,
    // processDisconnectedPlayers performs the actual transfer.
    const hostTransfer: { oldHostId: string; newHostId: string; newHostName: string } | undefined = undefined;
    if (lobby.hostId === playerId) {
      disconnectedPlayer.wasHost = true;
    }

    // Emit player_disconnected event
    this.eventBus.emit('session:player_disconnected', {
      lobbyId,
      playerId,
      disconnectedAt: now,
      graceExpiresAt: now + this.DISCONNECT_GRACE_PERIOD,
    });

    return {
      disconnectedPlayer,
      reconnectToken,
      hostTransfer,
    };
  }

  /**
   * Attempts to reconnect a player using a reconnect token
   */
  attemptPlayerReconnect(
    tokenString: string
  ): import('../../shared/gameEvents').ReconnectResponse {
    // Validate token
    const token = this.validateReconnectToken(tokenString);
    if (!token) {
      return {
        result: 'invalid_token',
        message: 'Invalid or expired reconnection token',
      };
    }

    // Check lobby still exists
    const lobby = this.lobbies.get(token.lobbyId);
    if (!lobby) {
      return {
        result: 'lobby_closed',
        message: 'Lobby no longer exists',
      };
    }

    // Check disconnectedPlayer record exists and not expired
    const disconnectedPlayer = this.disconnectedPlayers.get(token.playerId);
    if (!disconnectedPlayer) {
      // Player was never disconnected — check if they're still in the lobby
      // This happens when the host creates a lobby and GamePage auto-reconnects
      // before any disconnect occurred (race between lobby_created and GamePage mount)
      const stillInLobby = lobby.players.find((p) => p.id === token.playerId);
      if (stillInLobby) {
        // Re-sync: generate new token and return success without restoring state
        const newReconnectToken = this.generateReconnectToken(
          token.playerId,
          token.lobbyId,
          token.playerName
        );
        this.reconnectTokens.delete(tokenString);
        this.recordPlayerActivity(token.playerId);
        return {
          result: 'success',
          lobbySync: {
            lobby,
            yourPlayer: stillInLobby,
            reconnectToken: newReconnectToken,
            stateChanges: {},
            pendingActions: {},
          },
        };
      }
      return {
        result: 'grace_expired',
        message: 'Reconnection grace period expired',
      };
    }

    if (disconnectedPlayer.graceExpiresAt < Date.now()) {
      this.disconnectedPlayers.delete(token.playerId);
      this.reconnectTokens.delete(tokenString);
      return {
        result: 'grace_expired',
        message: 'Reconnection grace period expired',
      };
    }

    // Find player in lobby
    const player = lobby.players.find((p) => p.id === token.playerId);
    if (!player) {
      return {
        result: 'lobby_closed',
        message: 'Player no longer in lobby',
      };
    }

    // Restore lastKnownPosition and lastKnownCombatState
    if (disconnectedPlayer.lastKnownPosition) {
      lobby.playerPositions[token.playerId] =
        disconnectedPlayer.lastKnownPosition;
    }
    if (disconnectedPlayer.lastKnownCombatState) {
      lobby.playerCombatStates[token.playerId] =
        disconnectedPlayer.lastKnownCombatState;
    }

    // Phase 41-02: Restore host status if this player was host at disconnect
    // time. Defense in depth: if any external code path during the grace
    // window promoted another player, demote them so there is at most one host.
    if (disconnectedPlayer.wasHost) {
      for (const p of lobby.players) {
        if (p.id !== token.playerId && p.isHost) {
          p.isHost = false;
        }
      }
      player.isHost = true;
      lobby.hostId = token.playerId;
      this.eventBus.emit('session:host_changed', {
        lobbyId: token.lobbyId,
        oldHostId: token.playerId, // logically self-restoration
        newHostId: token.playerId,
      });
    }

    // Generate new reconnect token
    const newReconnectToken = this.generateReconnectToken(
      token.playerId,
      token.lobbyId,
      token.playerName
    );

    // Clean up old token and disconnectedPlayer record
    this.reconnectTokens.delete(tokenString);
    this.disconnectedPlayers.delete(token.playerId);

    // Update player activity
    this.recordPlayerActivity(token.playerId);

    // Return success with LobbySync
    return {
      result: 'success',
      lobbySync: {
        lobby,
        yourPlayer: player,
        reconnectToken: newReconnectToken,
        stateChanges: {
          phaseChanged: true,
        },
      },
      message: 'Successfully reconnected',
    };
  }

  /**
   * Processes disconnected players, removing those whose grace period has expired.
   *
   * Phase 41-02: When a host whose grace period has expired had `wasHost: true`,
   * performs the deferred host transfer that used to live in
   * `handlePlayerDisconnect`. Returns an array of host-transfer events the
   * caller (websocket.ts) should broadcast as `host_transferred`.
   */
  processDisconnectedPlayers(): Array<{
    lobbyId: string;
    oldHostId: string;
    newHostId: string;
    newHostName: string;
  }> {
    const now = Date.now();
    const hostTransfers: Array<{
      lobbyId: string;
      oldHostId: string;
      newHostId: string;
      newHostName: string;
    }> = [];

    // Iterate disconnectedPlayers Map
    for (const [playerId, disconnectedPlayer] of this.disconnectedPlayers.entries()) {
      // Check if grace period expired
      if (disconnectedPlayer.graceExpiresAt < now) {
        // Phase 41-02: deferred host transfer. If this player was host AND the
        // lobby still exists with at least one connected player, transfer host
        // BEFORE we remove the disconnected player (so removePlayer's existing
        // host-on-leave path doesn't double-fire on a stale hostId).
        if (disconnectedPlayer.wasHost) {
          const lobby = this.lobbies.get(disconnectedPlayer.lobbyId);
          if (lobby && lobby.hostId === playerId) {
            const connectedPlayers = lobby.players.filter(
              (p) => p.id !== playerId && !this.disconnectedPlayers.has(p.id)
            );
            if (connectedPlayers.length > 0) {
              const newHost = connectedPlayers[0];
              const oldHostId = lobby.hostId;
              lobby.hostId = newHost.id;
              newHost.isHost = true;

              hostTransfers.push({
                lobbyId: lobby.id,
                oldHostId,
                newHostId: newHost.id,
                newHostName: newHost.name,
              });

              this.eventBus.emit('session:host_changed', {
                lobbyId: lobby.id,
                oldHostId,
                newHostId: newHost.id,
              });

              gameLogger.info({
                lobbyId: lobby.id,
                oldHostId,
                newHostId: newHost.id,
                newHostName: newHost.name,
              }, 'Deferred host transfer on grace expiry (Phase 41-02)');
            }
          }
        }

        // Remove player from lobby
        this.removePlayer(playerId);

        // Clean up disconnectedPlayer record
        this.disconnectedPlayers.delete(playerId);

        // Clean up any reconnect tokens for this player
        for (const [tokenString, token] of this.reconnectTokens.entries()) {
          if (token.playerId === playerId) {
            this.reconnectTokens.delete(tokenString);
          }
        }
      }
    }

    return hostTransfers;
  }
}
