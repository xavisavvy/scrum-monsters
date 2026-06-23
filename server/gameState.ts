import { Lobby, Player, Boss, JiraTicket, CompletedTicket, TeamType, AvatarClass, TeamScores, TeamConsensus, TimerState, ReconnectToken, DisconnectedPlayer, LobbySync, ReconnectResponse, RingAttack, RingAttackProjectile, isValidEstimationScore } from '../shared/gameEvents.js';
import { TeamStatsManager } from './teamStatsManager.js';
import { createHmac, randomBytes, randomInt } from 'crypto';
import { cacheLobby, deleteCachedLobby, deletePlayerSession, isRedisConnected } from './redis.js';
import { gameLogger } from './logger.js';
import type { Server as SocketIOServer } from 'socket.io';

// Phase 42-02b: emit fine-grained session:phase_changed via the shared eventBus
// when the voting timeout safety net auto-advances battle->reveal. Avoids the
// retired lobby_updated full-state push.
import { eventBus, getClientEventEmitter, BOSS_BEHAVIORS, combatManager } from './domains/index.js';

interface RevivalSession {
  reviverId: string;
  targetId: string;
  lobbyId: string;
  startedAt: number;
  lastTick: number;
  timeoutHandle: NodeJS.Timeout;
}

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

export class GameStateManager {
  private lobbies: Map<string, Lobby> = new Map();
  private playerToLobby: Map<string, string> = new Map();
  private revivalSessions: Map<string, RevivalSession> = new Map(); // key: `${reviverId}:${targetId}`
  private playerPerformanceMap: Map<string, Map<string, { estimationTime: number; score: number | '?'; team: TeamType }>> = new Map();
  private timerIntervals = new Map<string, NodeJS.Timeout>();
  private consensusCountdownIntervals = new Map<string, NodeJS.Timeout>();
  private votingTimeouts = new Map<string, NodeJS.Timeout>(); // Store voting timeouts separately
  private modifierIntervals = new Map<string, NodeJS.Timeout>(); // Track modifier intervals per lobby
  private io?: SocketIOServer;
  
  // Reconnection system
  private disconnectedPlayers: Map<string, DisconnectedPlayer> = new Map(); // key: playerId
  private reconnectTokens: Map<string, ReconnectToken> = new Map(); // key: token string
  private disconnectWatchdog!: NodeJS.Timeout;
  private readonly DISCONNECT_GRACE_PERIOD = 10 * 60 * 1000; // 10 minutes
  private readonly TOKEN_EXPIRY_TIME = 15 * 60 * 1000; // 15 minutes
  private readonly TOKEN_SECRET = process.env.RECONNECT_TOKEN_SECRET || 'scrum-monsters-secret-' + randomBytes(16).toString('hex');

  constructor(io?: SocketIOServer, opts?: { startWatchdogs?: boolean }) {
    this.io = io;
    const startWatchdogs = opts?.startWatchdogs ?? true;
    if (startWatchdogs) {
      // Phase 50-02: The revival watchdog was removed from here.
      // CombatManager owns the revival lifecycle via self-managed per-session intervals.
      // Start disconnect watchdog timer (RETAINED — drives processDisconnectedPlayers/removePlayer)
      this.disconnectWatchdog = setInterval(() => {
        this.processDisconnectedPlayers();
      }, 30000); // Check every 30 seconds
    }
  }

  private syncLobbyToCache(lobby: Lobby): void {
    if (isRedisConnected()) {
      cacheLobby(lobby.id, lobby).catch(() => {});
    }
  }

  private removeLobbyFromCache(lobbyId: string): void {
    if (isRedisConnected()) {
      deleteCachedLobby(lobbyId).catch(() => {});
    }
  }

  private removePlayerSessionFromCache(playerId: string): void {
    if (isRedisConnected()) {
      deletePlayerSession(playerId).catch(() => {});
    }
  }

  generateLobbyId(customId?: string): string {
    // If a custom ID is provided, validate and use it
    if (customId) {
      const normalized = customId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      // Check if lobby already exists
      if (this.lobbies.has(normalized.toUpperCase())) {
        // Return existing lobby ID if it exists
        return normalized.toUpperCase();
      }
      return normalized.toUpperCase();
    }
    // Otherwise, generate random 6-character ID
    return generateSecureLobbyCode();
  }

  // Phase 45-05B: promoted from private — the websocket.ts watchdog drove
  // the eventBus emit off the completion list. Phase 50-02: both external
  // watchdogs removed; this method is retained until the GameState revival
  // methods are deleted in Task 5.
  public processRevivalSessions(): { lobbyId: string; targetId: string; reviverId: string }[] {
    const now = Date.now();
    const completedRevivals: { lobbyId: string; targetId: string; reviverId: string }[] = [];
    
    for (const [sessionKey, session] of this.revivalSessions) {
      const lobby = this.lobbies.get(session.lobbyId);
      if (!lobby) {
        this.cancelRevivalSession(sessionKey);
        continue;
      }

      // Check if revive timed out (no keep-alive)
      if (now - session.lastTick > 400) {
        this.cancelRevivalSession(sessionKey);
        continue;
      }

      // Check if enough time has passed for completion (3 seconds)
      if (now - session.startedAt >= 3000) {
        this.completeRevival(sessionKey);
        completedRevivals.push({
          lobbyId: session.lobbyId,
          targetId: session.targetId,
          reviverId: session.reviverId
        });
      }
    }
    
    return completedRevivals;
  }

  private cancelRevivalSession(sessionKey: string): void {
    const session = this.revivalSessions.get(sessionKey);
    if (session) {
      clearTimeout(session.timeoutHandle);
      this.revivalSessions.delete(sessionKey);
    }
  }

  private completeRevival(sessionKey: string): void {
    const session = this.revivalSessions.get(sessionKey);
    if (!session) return;

    const lobby = this.lobbies.get(session.lobbyId);
    if (!lobby) {
      this.cancelRevivalSession(sessionKey);
      return;
    }

    // Find target player and revive them
    const targetState = lobby.playerCombatStates[session.targetId];
    if (targetState && targetState.isDowned) {
      targetState.isDowned = false;
      targetState.hp = Math.min(targetState.maxHp, targetState.hp + 50); // Heal on revive
      targetState.revivedBy = session.reviverId;
    }

    this.cancelRevivalSession(sessionKey);
  }

  // Reconnection Management Methods
  private processDisconnectedPlayers(): void {
    const now = Date.now();
    const expiredPlayers: string[] = [];

    for (const [playerId, disconnectedPlayer] of this.disconnectedPlayers) {
      if (now > disconnectedPlayer.graceExpiresAt) {
        expiredPlayers.push(playerId);
      }
    }

    // Remove expired players permanently
    for (const playerId of expiredPlayers) {
      const disconnectedPlayer = this.disconnectedPlayers.get(playerId);
      if (disconnectedPlayer) {
        gameLogger.info({ playerId, playerName: disconnectedPlayer.playerName }, 'Player grace period expired - removing permanently');
        this.disconnectedPlayers.delete(playerId);

        // Remove from lobby permanently
        // Phase 42-02b row #25: lobby_updated removed; SessionManager emits the
        // appropriate session:player_left / player_disconnected event; no
        // additional broadcast needed here.
        this.removePlayer(playerId);
      }
    }

    // Clean up expired tokens
    this.cleanupExpiredTokens();
  }

  private generateReconnectToken(playerId: string, lobbyId: string, playerName: string): string {
    const now = Date.now();
    const tokenData = {
      playerId,
      lobbyId,
      playerName,
      issuedAt: now,
      expiresAt: now + this.TOKEN_EXPIRY_TIME
    };

    // Create signature for token integrity
    const tokenPayload = JSON.stringify(tokenData);
    const signature = createHmac('sha256', this.TOKEN_SECRET).update(tokenPayload).digest('hex');
    
    const token: ReconnectToken = {
      ...tokenData,
      signature
    };

    const tokenString = Buffer.from(JSON.stringify(token)).toString('base64');
    this.reconnectTokens.set(tokenString, token);
    
    return tokenString;
  }

  private validateReconnectToken(tokenString: string): ReconnectToken | null {
    try {
      const token = this.reconnectTokens.get(tokenString);
      if (!token) {
        gameLogger.debug('Token not found in active tokens');
        return null;
      }

      // Check expiry
      if (Date.now() > token.expiresAt) {
        gameLogger.debug('Token expired');
        this.reconnectTokens.delete(tokenString);
        return null;
      }

      // Verify signature
      const { signature, ...tokenData } = token;
      const expectedSignature = createHmac('sha256', this.TOKEN_SECRET).update(JSON.stringify(tokenData)).digest('hex');
      
      if (signature !== expectedSignature) {
        gameLogger.debug('Token signature invalid');
        this.reconnectTokens.delete(tokenString);
        return null;
      }

      return token;
    } catch (error) {
      gameLogger.debug({ err: error }, 'Token validation error');
      return null;
    }
  }

  private promoteNewHost(lobby: Lobby, oldHostId: string): { newHostId: string; newHostName: string } | null {
    // Get all connected players (excluding the disconnecting host and any other disconnected players)
    const connectedPlayers = lobby.players.filter(
      p => p.id !== oldHostId && !this.disconnectedPlayers.has(p.id)
    );

    if (connectedPlayers.length === 0) {
      return null; // No eligible replacement
    }

    // Priority order: spectators → developers → qa
    const spectators = connectedPlayers.filter(p => p.team === 'spectators');
    const developers = connectedPlayers.filter(p => p.team === 'developers');
    const qa = connectedPlayers.filter(p => p.team === 'qa');

    let newHost: Player | undefined;
    
    if (spectators.length > 0) {
      newHost = spectators[0];
    } else if (developers.length > 0) {
      newHost = developers[0];
    } else if (qa.length > 0) {
      newHost = qa[0];
    }

    if (!newHost) {
      return null;
    }

    // Update host status
    lobby.hostId = newHost.id;
    
    // Remove host flag from old host (if they're still in lobby during grace period)
    const oldHost = lobby.players.find(p => p.id === oldHostId);
    if (oldHost) {
      oldHost.isHost = false;
    }
    
    // Set new host flag
    newHost.isHost = true;

    gameLogger.info({ oldHostId, oldHostName: oldHost?.name, newHostId: newHost.id, newHostName: newHost.name }, 'Host transferred');

    return {
      newHostId: newHost.id,
      newHostName: newHost.name
    };
  }

  // Battle Modifier System
  private getCurrentModifier(lobby: Lobby): number {
    if (!lobby.battleStartTime || lobby.gamePhase !== 'battle') {
      return 0;
    }
    const elapsedSeconds = Math.floor((Date.now() - lobby.battleStartTime) / 1000);
    return Math.floor(elapsedSeconds / 10); // Increases every 10 seconds
  }

  private checkGameOver(lobby: Lobby): boolean {
    // Game over if all developers and QA are downed
    const activePlayers = lobby.players.filter(p => p.team === 'developers' || p.team === 'qa');
    if (activePlayers.length === 0) return false;
    
    const allDowned = activePlayers.every(p => {
      const combatState = lobby.playerCombatStates[p.id];
      return combatState && combatState.isDowned;
    });
    
    return allDowned;
  }

  handlePlayerDisconnect(playerId: string): { disconnectedPlayer: DisconnectedPlayer; reconnectToken: string; hostTransfer?: { oldHostId: string; newHostId: string; newHostName: string } } | null {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    const now = Date.now();
    
    // Create disconnected player record
    const disconnectedPlayer: DisconnectedPlayer = {
      playerId,
      lobbyId,
      playerName: player.name,
      disconnectedAt: now,
      graceExpiresAt: now + this.DISCONNECT_GRACE_PERIOD,
      lastKnownPosition: lobby.playerPositions[playerId],
      lastKnownCombatState: lobby.playerCombatStates[playerId]
    };

    // Generate reconnect token
    const reconnectToken = this.generateReconnectToken(playerId, lobbyId, player.name);

    // Store disconnected player but keep them in the lobby temporarily
    this.disconnectedPlayers.set(playerId, disconnectedPlayer);

    gameLogger.info({ playerId, playerName: player.name, gracePeriodMinutes: this.DISCONNECT_GRACE_PERIOD / 60000 }, 'Player disconnected with grace period');

    // If this was the host, immediately transfer host privileges
    let hostTransfer: { oldHostId: string; newHostId: string; newHostName: string } | undefined;
    if (lobby.hostId === playerId) {
      const transfer = this.promoteNewHost(lobby, playerId);
      if (transfer) {
        hostTransfer = {
          oldHostId: playerId,
          newHostId: transfer.newHostId,
          newHostName: transfer.newHostName
        };
      }
    }

    return { disconnectedPlayer, reconnectToken, hostTransfer };
  }

  attemptPlayerReconnect(tokenString: string): ReconnectResponse {
    // Validate token
    const token = this.validateReconnectToken(tokenString);
    if (!token) {
      return { result: 'invalid_token', message: 'Invalid or expired reconnection token' };
    }

    // Check if lobby still exists
    const lobby = this.lobbies.get(token.lobbyId);
    if (!lobby) {
      this.disconnectedPlayers.delete(token.playerId);
      this.reconnectTokens.delete(tokenString);
      return { result: 'lobby_closed', message: 'Lobby no longer exists' };
    }

    // Check if player was disconnected
    const disconnectedPlayer = this.disconnectedPlayers.get(token.playerId);
    if (!disconnectedPlayer) {
      return { result: 'grace_expired', message: 'Reconnection grace period has expired' };
    }

    // Check if grace period expired
    if (Date.now() > disconnectedPlayer.graceExpiresAt) {
      this.disconnectedPlayers.delete(token.playerId);
      this.reconnectTokens.delete(tokenString);
      return { result: 'grace_expired', message: 'Reconnection grace period has expired' };
    }

    // Find player in lobby
    const player = lobby.players.find(p => p.id === token.playerId);
    if (!player) {
      return { result: 'server_error', message: 'Player not found in lobby' };
    }

    // Restore player state
    if (disconnectedPlayer.lastKnownPosition) {
      lobby.playerPositions[token.playerId] = disconnectedPlayer.lastKnownPosition;
    }
    if (disconnectedPlayer.lastKnownCombatState) {
      lobby.playerCombatStates[token.playerId] = disconnectedPlayer.lastKnownCombatState;
    }

    // Generate new token for next potential disconnect
    const newReconnectToken = this.generateReconnectToken(token.playerId, token.lobbyId, token.playerName);

    // Clean up old disconnect record and token
    this.disconnectedPlayers.delete(token.playerId);
    this.reconnectTokens.delete(tokenString);

    // Create lobby sync response
    const lobbySync: LobbySync = {
      lobby,
      yourPlayer: player,
      reconnectToken: newReconnectToken,
      pendingActions: {
        timers: lobby.currentTimer,
        consensus: lobby.consensusCountdown,
        battleState: lobby.boss
      },
      stateChanges: {
        phaseChanged: true, // Always assume phase might have changed
        playersJoined: [], // TODO: Track players who joined during disconnect
        playersLeft: [], // TODO: Track players who left during disconnect  
        ticketsChanged: true // Always assume tickets might have changed
      }
    };

    gameLogger.info({ playerId: token.playerId, playerName: token.playerName, lobbyId: token.lobbyId }, 'Player successfully reconnected');

    // Check if this player lost host status during disconnect
    let newHostName: string | undefined;
    if (!player.isHost && lobby.hostId !== token.playerId) {
      const currentHost = lobby.players.find(p => p.id === lobby.hostId);
      if (currentHost) {
        newHostName = currentHost.name;
        gameLogger.info({ playerName: token.playerName, currentHostName: currentHost.name }, 'Player reconnected but is no longer host');
      }
    }

    return { 
      result: 'success', 
      lobbySync,
      message: 'Successfully reconnected to lobby',
      newHost: newHostName
    };
  }

  private cleanupExpiredTokens(): void {
    const now = Date.now();
    const expiredTokens: string[] = [];

    for (const [tokenString, token] of this.reconnectTokens) {
      if (now > token.expiresAt) {
        expiredTokens.push(tokenString);
      }
    }

    for (const tokenString of expiredTokens) {
      this.reconnectTokens.delete(tokenString);
    }

    if (expiredTokens.length > 0) {
      gameLogger.debug({ expiredTokenCount: expiredTokens.length }, 'Cleaned up expired reconnect tokens');
    }
  }

  // NOTE: GameStateManager.removePlayer is INTENTIONALLY RETAINED.
  // processDisconnectedPlayers (the 30s disconnectWatchdog at gameState.ts:193)
  // still calls this.removePlayer(playerId) internally. Deletion is deferred to a
  // future GameState-decommission phase that removes processDisconnectedPlayers and
  // the disconnectWatchdog together. Do not treat its presence as an oversight.
  removePlayer(playerId: string): Lobby | null {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    // Remove player from lobby
    lobby.players = lobby.players.filter(p => p.id !== playerId);
    
    // Update team assignments
    this.updateTeamAssignments(lobby);
    
    // Remove from player mapping
    this.playerToLobby.delete(playerId);

    // Clean up combat state and position
    delete lobby.playerCombatStates[playerId];
    delete lobby.playerPositions[playerId];
    
    this.removePlayerSessionFromCache(playerId);

    // If no players left, remove lobby
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      this.removeLobbyFromCache(lobbyId);
      return null;
    }

    // Transfer host if needed
    if (lobby.hostId === playerId && lobby.players.length > 0) {
      lobby.hostId = lobby.players[0].id;
      lobby.players[0].isHost = true;
    }

    this.syncLobbyToCache(lobby);
    
    return lobby;
  }

  private updateTeamAssignments(lobby: Lobby): void {
    lobby.teams = {
      developers: lobby.players.filter(p => p.team === 'developers'),
      qa: lobby.players.filter(p => p.team === 'qa'),
      spectators: lobby.players.filter(p => p.team === 'spectators')
    };
  }

  getLobby(lobbyId: string): Lobby | null {
    return this.lobbies.get(lobbyId) || null;
  }

  /**
   * Phase 45-05B: typed read-only view of in-progress revival sessions for
   * the websocket.ts watchdog's throttled combat:revival_progress emit.
   * Replaces a `(gameState as any).revivalSessions` cast.
   */
  public getActiveRevivalSessions(): Iterable<{ lobbyId: string; targetId: string; reviverId: string; startedAt: number }> {
    return this.revivalSessions.values();
  }

  getLobbyByPlayerId(playerId: string): Lobby | null {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) return null;
    return this.lobbies.get(lobbyId) || null;
  }

  /**
   * Sync player-lobby mapping from sessionManager
   * Call this after sessionManager.joinLobby() or sessionManager.createLobby()
   */
  syncPlayerToLobby(playerId: string, lobby: Lobby): void {
    // Always update reference (not conditional — covers reconnect-staleness)
    this.lobbies.set(lobby.id, lobby);
    // Register alias for the triggering player
    this.playerToLobby.set(playerId, lobby.id);
    // Register aliases for ALL other players in the lobby (covers reconnect-staleness)
    for (const player of lobby.players) {
      if (!this.playerToLobby.has(player.id)) {
        this.playerToLobby.set(player.id, lobby.id);
      }
    }
  }

  selectAvatar(playerId: string, avatarClass: AvatarClass): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    player.avatar = avatarClass;
    player.avatarClass = avatarClass; // Keep both for compatibility

    return lobby;
  }

  assignTeam(assignerId: string, targetPlayerId: string, team: TeamType): Lobby | null {
    const lobby = this.getLobbyByPlayerId(assignerId);
    if (!lobby) return null;

    const assigner = lobby.players.find(p => p.id === assignerId);
    if (!assigner || !assigner.isHost) return null; // Only host can assign teams

    const targetPlayer = lobby.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) return null;

    targetPlayer.team = team;
    this.updateTeamAssignments(lobby);

    return lobby;
  }

  changeOwnTeam(playerId: string, team: TeamType): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    player.team = team;
    this.updateTeamAssignments(lobby);

    return lobby;
  }

  addTicketsToLobby(playerId: string, tickets: JiraTicket[]): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null; // Only host can add tickets

    lobby.tickets.push(...tickets);
    return lobby;
  }

  removeTicketFromLobby(playerId: string, ticketId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null; // Only host can remove tickets

    lobby.tickets = lobby.tickets.filter(t => t.id !== ticketId);
    return lobby;
  }

  updateDiscussionVote(playerId: string, score: number | '?'): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || lobby.gamePhase !== 'discussion') return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player || player.team === 'spectators') return null;

    // Validate score is from allowed values
    const validScores = [1, 2, 3, 5, 8, 13, 21, '?'];
    if (!validScores.includes(score)) return null;

    // Check if score is actually changing (idempotency)
    if (player.currentScore === score) return null;

    player.currentScore = score;
    player.hasSubmittedScore = true;

    return lobby;
  }

  startBattle(playerId: string, tickets: JiraTicket[]): { lobby: Lobby; boss: Boss } | { error: string } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    if (tickets.length === 0) return null;

    // Check if there's at least one developer OR one QA team member
    const hasActivePlayers = lobby.players.some(p => p.team === 'developers') || 
                           lobby.players.some(p => p.team === 'qa');
    if (!hasActivePlayers) {
      return { error: 'Cannot start battle: At least one Developer or QA team member is required to participate in estimation battles. Please assign players to active teams first.' };
    }

    // Count active participants for health scaling
    const activeParticipants = lobby.players.filter(p => p.team === 'developers' || p.team === 'qa').length;

    // Initialize game state
    lobby.gamePhase = 'battle';
    lobby.currentTicket = tickets[0];
    lobby.boss = this.createBossFromTickets(tickets, activeParticipants);
    
    // Initialize battle modifier system
    lobby.battleModifier = 0;
    lobby.battleStartTime = Date.now();

    // Reset player states for battle
    lobby.players.forEach(p => {
      if (p.team !== 'spectators') {
        p.hasSubmittedScore = false;
        p.currentScore = undefined;
      }
      // Reset combat states
      if (lobby.playerCombatStates[p.id]) {
        lobby.playerCombatStates[p.id].hp = lobby.playerCombatStates[p.id].maxHp;
        lobby.playerCombatStates[p.id].isDowned = false;
      }
    });

    // Start voting timeout for this battle
    this.startVotingPhase(lobby.id);

    return { lobby, boss: lobby.boss };
  }

  proceedNextLevel(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    if (lobby.gamePhase !== 'next_level') return null;

    // Move to next ticket
    const nextTicketIndex = lobby.completedTickets.length;
    if (nextTicketIndex < lobby.tickets.length) {
      // Count active participants for consistent health scaling
      const activeParticipants = lobby.players.filter(p => p.team === 'developers' || p.team === 'qa').length;
      
      lobby.currentTicket = lobby.tickets[nextTicketIndex];
      lobby.boss = this.createBossFromTickets(lobby.tickets.slice(nextTicketIndex), activeParticipants);
      lobby.gamePhase = 'battle';
      
      // Reset battle modifier for new battle
      lobby.battleModifier = 0;
      lobby.battleStartTime = Date.now();
      
      // Reset player states for new battle
      lobby.players.forEach(p => {
        if (p.team !== 'spectators') {
          p.hasSubmittedScore = false;
          p.currentScore = undefined;
        }
        // Reset combat states
        if (lobby.playerCombatStates[p.id]) {
          lobby.playerCombatStates[p.id].hp = lobby.playerCombatStates[p.id].maxHp;
          lobby.playerCombatStates[p.id].isDowned = false;
        }
      });
    } else {
      lobby.gamePhase = 'victory';
    }

    return lobby;
  }

  abandonQuest(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    // Reset to lobby state
    lobby.gamePhase = 'lobby';
    lobby.currentTicket = undefined;
    lobby.boss = undefined;
    lobby.completedTickets = [];

    // Reset all player states
    lobby.players.forEach(p => {
      p.hasSubmittedScore = false;
      p.currentScore = undefined;
      if (lobby.playerCombatStates[p.id]) {
        lobby.playerCombatStates[p.id].hp = lobby.playerCombatStates[p.id].maxHp;
        lobby.playerCombatStates[p.id].isDowned = false;
      }
    });

    return lobby;
  }

  returnToLobby(playerId: string): Lobby | null {
    gameLogger.debug({ playerId }, 'returnToLobby called');
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) {
      gameLogger.debug('No lobby found for player');
      return null;
    }

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) {
      gameLogger.debug('Player is not host, cannot return to lobby');
      return null;
    }

    gameLogger.debug({ gamePhase: lobby.gamePhase }, 'Current lobby phase');
    // Only allow return to lobby from victory or game_over phase
    if (lobby.gamePhase !== 'victory' && lobby.gamePhase !== 'game_over') {
      gameLogger.debug('Can only return to lobby from victory or game_over phase');
      return null;
    }

    // Return to lobby state but preserve completed objectives
    lobby.gamePhase = 'lobby';
    lobby.currentTicket = undefined;
    lobby.boss = undefined;
    // Note: Keep completedTickets to preserve victory progress

    // Reset player states for next session
    lobby.players.forEach(p => {
      p.hasSubmittedScore = false;
      p.currentScore = undefined;
      if (lobby.playerCombatStates[p.id]) {
        lobby.playerCombatStates[p.id].hp = lobby.playerCombatStates[p.id].maxHp;
        lobby.playerCombatStates[p.id].isDowned = false;
      }
    });

    return lobby;
  }

  forceRevealScores(playerId: string): { lobby: Lobby; teamScores: TeamScores; teamConsensus: TeamConsensus } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    // Force reveal by changing phase to reveal
    lobby.gamePhase = 'reveal';
    return this.revealScores(lobby.id);
  }

  attackPlayer(attackerId: string, targetId: string, _damage: number): { lobby: Lobby; targetHealth: number; gameOver?: boolean; modifier?: number } | null {
    const lobby = this.getLobbyByPlayerId(attackerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const attacker = lobby.players.find(p => p.id === attackerId);
    const target = lobby.players.find(p => p.id === targetId);
    if (!attacker || !target) return null;

    // Only spectators can attack players (boss role)
    if (attacker.team !== 'spectators') return null;
    
    // Spectators can only attack developers/QA
    if (target.team === 'spectators') return null;

    const targetState = lobby.playerCombatStates[targetId];
    if (!targetState || targetState.isDowned) return null;

    // Get current modifier and calculate damage
    const modifier = this.getCurrentModifier(lobby);
    const actualDamage = 1 + modifier; // Spectator damage is 1 + modifier

    targetState.hp = Math.max(0, targetState.hp - actualDamage);
    targetState.lastDamagedBy = attackerId;

    if (targetState.hp <= 0) {
      targetState.isDowned = true;
    }

    gameLogger.debug({ attackerName: attacker.name, targetName: target.name, damage: actualDamage, modifier }, 'Spectator attacked player');

    // Check for game over
    const gameOver = this.checkGameOver(lobby);
    if (gameOver) {
      const oldPhase = lobby.gamePhase;
      lobby.gamePhase = 'game_over';
      gameLogger.info('Game over - all developers/QA are downed');
      // Phase 45-03: replaces the legacy `game_over` socket emit at websocket.ts.
      // Client renders GameOverPhase off session:phase_changed.
      eventBus.emit('session:phase_changed', {
        lobbyId: lobby.id,
        oldPhase,
        newPhase: 'game_over',
      });
    }

    return { lobby, targetHealth: targetState.hp, gameOver, modifier };
  }

  healParty(healerId: string): { lobby: Lobby; healedPlayers: Array<{ playerId: string; newHealth: number }> } | null {
    const lobby = this.getLobbyByPlayerId(healerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const healer = lobby.players.find(p => p.id === healerId);
    if (!healer || healer.avatar !== 'cleric') return null; // Only clerics can heal party

    const healedPlayers: Array<{ playerId: string; newHealth: number }> = [];

    // Heal all players (developers and QA) for 50% of max HP
    for (const player of lobby.players) {
      if (player.team !== 'developers' && player.team !== 'qa') continue;

      const playerState = lobby.playerCombatStates[player.id];
      if (!playerState) continue;

      // Heal for 50% of max HP
      const healAmount = Math.floor(playerState.maxHp * 0.5);
      const oldHp = playerState.hp;
      playerState.hp = Math.min(playerState.maxHp, playerState.hp + healAmount);

      // If player was downed and healed, revive them
      if (playerState.isDowned && playerState.hp > 0) {
        playerState.isDowned = false;
        gameLogger.info({ healerName: healer.name, playerName: player.name }, 'Cleric revived player');
      }

      if (playerState.hp > oldHp) {
        healedPlayers.push({ playerId: player.id, newHealth: playerState.hp });
        // Phase 45-04: emit combat:player_healed per healed player so each
        // client can render a floating +N popup. Mirrors the per-player
        // shape of combat:player_damaged on the damage side.
        eventBus.emit('combat:player_healed', {
          lobbyId: lobby.id,
          playerId: player.id,
          healerId,
          healAmount: playerState.hp - oldHp,
          newHealth: playerState.hp,
        });
      }
    }

    gameLogger.info({ healerName: healer.name, healedCount: healedPlayers.length }, 'Cleric healed party');

    return { lobby, healedPlayers };
  }

  findNearestTarget(playerId: string): string | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const attackerPos = lobby.playerPositions[playerId];
    if (!attackerPos) return null;

    let nearestTarget: string | null = null;
    let nearestDistance = Infinity;

    // Find nearest non-spectator, non-downed player
    for (const player of lobby.players) {
      if (player.id === playerId || player.team === 'spectators') continue;
      
      const playerState = lobby.playerCombatStates[player.id];
      if (playerState?.isDowned) continue;

      const playerPos = lobby.playerPositions[player.id];
      if (!playerPos) continue;

      const distance = Math.sqrt(
        Math.pow(attackerPos.x - playerPos.x, 2) + 
        Math.pow(attackerPos.y - playerPos.y, 2)
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestTarget = player.id;
      }
    }

    return nearestTarget;
  }

  bossDamagePlayer(playerId: string, damage: number): { lobby: Lobby; targetHealth: number; gameOver?: boolean } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const targetState = lobby.playerCombatStates[playerId];
    if (!targetState || targetState.isDowned) return null;

    targetState.hp = Math.max(0, targetState.hp - damage);
    targetState.lastDamagedBy = 'boss';

    if (targetState.hp <= 0) {
      targetState.isDowned = true;
    }

    // Check for game over
    const gameOver = this.checkGameOver(lobby);
    if (gameOver) {
      const oldPhase = lobby.gamePhase;
      lobby.gamePhase = 'game_over';
      gameLogger.info('Game over - all developers/QA are downed');
      // Phase 45-03: replaces the legacy `game_over` socket emit at websocket.ts.
      // Client renders GameOverPhase off session:phase_changed.
      eventBus.emit('session:phase_changed', {
        lobbyId: lobby.id,
        oldPhase,
        newPhase: 'game_over',
      });
    }

    return { lobby, targetHealth: targetState.hp, gameOver };
  }

  addTickets(playerId: string, tickets: JiraTicket[]): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    lobby.tickets.push(...tickets);
    return lobby;
  }

  removeTicket(playerId: string, ticketId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    lobby.tickets = lobby.tickets.filter(t => t.id !== ticketId);
    return lobby;
  }

  /**
   * @deprecated Dead code as of 2026-05-15. The `avatar_selection` server
   * phase was retired in favor of per-player client-side gating via
   * `Player.hasSelectedAvatar`. `startBattle` is the live host-start path.
   * This method (and `proceedToNextPhase`) is no longer wired to any socket
   * event. Kept temporarily to avoid breaking any external callers; remove
   * after Phase 43 ships.
   * See .planning/debug/resolved/avatar-selection-skipped.md.
   */
  startGame(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    if (lobby.tickets.length === 0) return null;

    // Initialize game state
    lobby.gamePhase = 'avatar_selection';
    lobby.currentTicket = lobby.tickets[0];
    
    // Count active participants for health scaling (even in avatar selection phase)
    const activeParticipants = lobby.players.filter(p => p.team === 'developers' || p.team === 'qa').length;
    lobby.boss = this.createBossFromTickets(lobby.tickets, activeParticipants);

    return lobby;
  }

  /**
   * @deprecated Dead code as of 2026-05-15. Counterpart to the deprecated
   * `startGame`. The avatar_selection -> battle transition no longer flows
   * through this method. Use `startBattle` / `proceedNextLevel` instead.
   * See .planning/debug/resolved/avatar-selection-skipped.md.
   */
  proceedToNextPhase(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    switch (lobby.gamePhase) {
      case 'avatar_selection':
        lobby.gamePhase = 'battle';
        break;
      case 'next_level': {
        // Move to next ticket
        const nextTicketIndex = lobby.completedTickets.length;
        if (nextTicketIndex < lobby.tickets.length) {
          // Count active participants for consistent health scaling
          const activeParticipants = lobby.players.filter(p => p.team === 'developers' || p.team === 'qa').length;
          
          lobby.currentTicket = lobby.tickets[nextTicketIndex];
          lobby.boss = this.createBossFromTickets(lobby.tickets.slice(nextTicketIndex), activeParticipants);
          lobby.gamePhase = 'battle';
          
          // Reset player states for new battle
          lobby.players.forEach(p => {
            if (p.team !== 'spectators') {
              p.hasSubmittedScore = false;
              p.currentScore = undefined;
            }
            // Reset combat states
            if (lobby.playerCombatStates[p.id]) {
              lobby.playerCombatStates[p.id].hp = lobby.playerCombatStates[p.id].maxHp;
              lobby.playerCombatStates[p.id].isDowned = false;
            }
          });
        } else {
          lobby.gamePhase = 'victory';
        }
        break;
      }
    }

    return lobby;
  }

  private createBossFromTickets(tickets: JiraTicket[], activeParticipants: number = 1): Boss {
    // Base health: 100 points per ticket
    const baseHealthPerTicket = 100;
    const baseHealth = tickets.length * baseHealthPerTicket;
    
    // Player scaling: Square root of participant count for balanced scaling
    // 1 player: 1x, 4 players: 2x, 9 players: 3x, 16 players: 4x
    const participantScaling = Math.sqrt(Math.max(1, activeParticipants));
    
    // Final scaled health (minimum 1x base health)
    const scaledHealth = Math.round(baseHealth * participantScaling);
    
    gameLogger.debug({ activeParticipants, participantScaling, scaledHealth }, 'Boss health scaling calculated');
    
    // Available boss types derived from the single behavior registry —
    // sprite, name, and description are now authoritative on each BossBehavior.
    const availableBosses = Object.values(BOSS_BEHAVIORS);
    
    // Randomly select a boss type
    const selectedBoss = availableBosses[Math.floor(Math.random() * availableBosses.length)];
    
    const bossName = activeParticipants > 1 
      ? `${selectedBoss.name} of ${tickets.length} Challenge${tickets.length > 1 ? 's' : ''} (${activeParticipants} Warriors)`
      : `${selectedBoss.name} of ${tickets.length} Challenge${tickets.length > 1 ? 's' : ''}`;
    
    return {
      id: generateSecureId(),
      name: bossName,
      maxHealth: scaledHealth,
      currentHealth: scaledHealth,
      phase: 1,
      maxPhases: tickets.length,
      sprite: selectedBoss.sprite,
      defeated: false
    };
  }

  updatePlayerPosition(playerId: string, position: { x: number; y: number }): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    // Store position as percentages (0-100)
    lobby.playerPositions[playerId] = {
      x: Math.max(0, Math.min(100, position.x)),
      y: Math.max(0, Math.min(100, position.y))
    };

    return lobby;
  }

  setPlayerJumping(playerId: string, isJumping: boolean): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const combatState = lobby.playerCombatStates[playerId];
    if (combatState) {
      combatState.isJumping = isJumping;
    }

    return lobby;
  }

  submitScore(playerId: string, score: number | '?'): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player || player.team === 'spectators') return null;

    // Reject values outside the configured estimation scale (abstain '?' is
    // always allowed). Without this, a client could submit arbitrary/huge/NaN
    // values that corrupt consensus math and the reveal grid. (Security: M-1)
    if (!isValidEstimationScore(score, lobby.estimationSettings)) {
      gameLogger.warn({ playerId, lobbyId: lobby.id, score }, 'Rejected out-of-scale submit_score');
      return null;
    }

    player.currentScore = score;
    player.hasSubmittedScore = true;

    // Enhanced voting logic with deadlock prevention
    const shouldAdvanceToReveal = this.checkVotingCompletion(lobby);
    if (shouldAdvanceToReveal) {
      lobby.gamePhase = 'reveal';
      // Clear any existing voting timeout
      const existingTimeout = this.votingTimeouts.get(lobby.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        this.votingTimeouts.delete(lobby.id);
      }
    }

    return lobby;
  }

  // Enhanced voting completion check with multiple strategies
  private checkVotingCompletion(lobby: Lobby): boolean {
    const nonSpectatorPlayers = lobby.players.filter(p => p.team !== 'spectators');
    const connectedPlayers = nonSpectatorPlayers.filter(p => !this.isPlayerDisconnected(p.id));
    const submittedPlayers = nonSpectatorPlayers.filter(p => p.hasSubmittedScore);

    // Strategy 1: All players submitted (original logic)
    if (submittedPlayers.length === nonSpectatorPlayers.length && nonSpectatorPlayers.length > 0) {
      gameLogger.info({ playerCount: nonSpectatorPlayers.length }, 'All players voted - advancing to reveal');
      return true;
    }

    // Strategy 2: All connected players submitted (exclude disconnected)
    if (connectedPlayers.length > 0 && submittedPlayers.length === connectedPlayers.length) {
      const disconnectedCount = nonSpectatorPlayers.length - connectedPlayers.length;
      gameLogger.info({ connectedCount: connectedPlayers.length, disconnectedCount }, 'All connected players voted - advancing to reveal');
      return true;
    }

    // Strategy 3: Majority threshold (75%) with minimum time elapsed
    const votingStartTime = lobby.votingStartedAt || 0;
    const minVotingTime = 30000; // 30 seconds minimum voting time
    const timeElapsed = Date.now() - votingStartTime;
    
    if (timeElapsed >= minVotingTime && connectedPlayers.length >= 2) {
      const votePercentage = submittedPlayers.length / connectedPlayers.length;
      if (votePercentage >= 0.75) { // 75% threshold
        gameLogger.info({ voted: submittedPlayers.length, total: connectedPlayers.length, percentage: Math.round(votePercentage * 100), seconds: Math.round(timeElapsed/1000) }, 'Majority vote reached');
        return true;
      }
    }

    return false;
  }

  // Helper to check if a player is currently disconnected (using reconnection grace period)
  private isPlayerDisconnected(playerId: string): boolean {
    const disconnectedPlayer = this.disconnectedPlayers.get(playerId);
    return !!disconnectedPlayer && disconnectedPlayer.graceExpiresAt > Date.now();
  }

  // Start voting timeout when battle begins
  startVotingPhase(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return;

    // Set voting start time
    lobby.votingStartedAt = Date.now();

    // Clear any existing timeout
    const existingTimeout = this.votingTimeouts.get(lobbyId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set voting timeout (3 minutes)
    const votingTimeoutMs = 3 * 60 * 1000; // 3 minutes
    const timeout = setTimeout(() => {
      this.handleVotingTimeout(lobbyId);
    }, votingTimeoutMs);
    this.votingTimeouts.set(lobbyId, timeout);

    gameLogger.debug({ lobbyId }, 'Voting timeout started - 3 minutes until auto-advance');
  }

  /**
   * Shared reveal cascade for the auto-advance paths (3-minute voting timeout
   * and host-timer expiry). Caller must have set lobby.gamePhase = 'reveal'
   * first. Emits per-team estimation:votes_revealed (so the client populates
   * the Discussion vote grid) then a SINGLE battle->discussion phase change —
   * matching the submit_score / force_reveal paths, which avoids a transient
   * 'reveal' interstitial flashing over the result screen. No-ops without IO.
   */
  private emitRevealCascade(lobbyId: string): void {
    if (!this.io) return;
    const revealResult = this.revealScores(lobbyId);
    if (!revealResult) return;
    const { lobby: revealedLobby, teamScores } = revealResult;
    const emitter = getClientEventEmitter();
    if (revealedLobby.teams.developers.length > 0) {
      emitter.emitFineGrained(lobbyId, 'estimation:votes_revealed', {
        votes: teamScores.developers,
        team: 'developers',
      });
    }
    if (revealedLobby.teams.qa.length > 0) {
      emitter.emitFineGrained(lobbyId, 'estimation:votes_revealed', {
        votes: teamScores.qa,
        team: 'qa',
      });
    }
    // Single battle->discussion transition (revealScores already advanced the
    // phase to 'discussion'); the normal submit_score path emits the same.
    eventBus.emit('session:phase_changed', {
      lobbyId,
      oldPhase: 'battle',
      newPhase: 'discussion',
    });
  }

  // Handle voting timeout - force progression with available votes
  public handleVotingTimeout(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'battle') return;

    const nonSpectatorPlayers = lobby.players.filter(p => p.team !== 'spectators');
    const submittedPlayers = nonSpectatorPlayers.filter(p => p.hasSubmittedScore);
    const connectedPlayers = nonSpectatorPlayers.filter(p => !this.isPlayerDisconnected(p.id));

    gameLogger.info({ lobbyId, voted: submittedPlayers.length, total: connectedPlayers.length }, 'Voting timeout reached');

    // Force advancement if at least one person voted
    if (submittedPlayers.length > 0) {
      lobby.gamePhase = 'reveal';
      this.votingTimeouts.delete(lobbyId);
      // Phase 45-03: legacy `voting_timeout` toast emit removed (no client
      // listener). The reveal cascade below is the canonical signal.
      this.emitRevealCascade(lobbyId);
      gameLogger.info({ voteCount: submittedPlayers.length }, 'Auto-advanced to reveal phase');
    } else {
      gameLogger.info('No votes submitted - keeping in battle phase');
    }
  }

  // Host override to force voting progression
  forceVotingProgression(playerId: string): { lobby: Lobby; message: string } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) {
      return null; // Only hosts can force progression
    }

    if (lobby.gamePhase !== 'battle') {
      return { lobby, message: 'Can only force progression during voting phase' };
    }

    const nonSpectatorPlayers = lobby.players.filter(p => p.team !== 'spectators');
    const submittedPlayers = nonSpectatorPlayers.filter(p => p.hasSubmittedScore);
    const connectedPlayers = nonSpectatorPlayers.filter(p => !this.isPlayerDisconnected(p.id));

    if (submittedPlayers.length === 0) {
      return { lobby, message: 'Cannot advance - no votes submitted yet' };
    }

    // Clear voting timeout
    const existingTimeout = this.votingTimeouts.get(lobby.id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.votingTimeouts.delete(lobby.id);
    }

    // Force advancement to reveal phase
    lobby.gamePhase = 'reveal';

    const message = `Host forced voting progression with ${submittedPlayers.length}/${connectedPlayers.length} votes`;
    gameLogger.info({ lobbyId: lobby.id, message }, 'Voting progression forced');

    return { lobby, message };
  }

  revealScores(lobbyId: string): { lobby: Lobby; teamScores: TeamScores; teamConsensus: TeamConsensus } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'reveal') return null;

    const teamScores = {
      developers: {} as Record<string, number | '?'>,
      qa: {} as Record<string, number | '?'>
    };

    // Separate scores by team
    const developerPlayers = lobby.players.filter(p => p.team === 'developers' && p.currentScore !== undefined);
    const qaPlayers = lobby.players.filter(p => p.team === 'qa' && p.currentScore !== undefined);
    
    developerPlayers.forEach(p => {
      if (p.currentScore !== undefined) {
        teamScores.developers[p.id] = p.currentScore;
      }
    });

    qaPlayers.forEach(p => {
      if (p.currentScore !== undefined) {
        teamScores.qa[p.id] = p.currentScore;
      }
    });

    // Check for consensus within each team (excluding "?" votes)
    const devScoreValues = Object.values(teamScores.developers).filter(score => typeof score === 'number');
    const qaScoreValues = Object.values(teamScores.qa).filter(score => typeof score === 'number');
    
    const devConsensus = devScoreValues.length > 0 && devScoreValues.every(score => score === devScoreValues[0]);
    const qaConsensus = qaScoreValues.length > 0 && qaScoreValues.every(score => score === qaScoreValues[0]);

    const teamConsensus = {
      developers: { 
        hasConsensus: devConsensus, 
        score: devConsensus ? (devScoreValues[0] as number) : undefined 
      },
      qa: { 
        hasConsensus: qaConsensus, 
        score: qaConsensus ? (qaScoreValues[0] as number) : undefined 
      }
    };

    // Transition to discussion phase to allow players to see individual votes and update them
    lobby.gamePhase = 'discussion';

    return { lobby, teamScores, teamConsensus };
  }

  // New method to check consensus and advance from discussion phase
  checkDiscussionConsensus(lobbyId: string): { lobby: Lobby; teamScores: TeamScores; teamConsensus: TeamConsensus } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'discussion') return null;

    const teamScores = {
      developers: {} as Record<string, number | '?'>,
      qa: {} as Record<string, number | '?'>
    };

    // Separate scores by team
    const developerPlayers = lobby.players.filter(p => p.team === 'developers' && p.currentScore !== undefined);
    const qaPlayers = lobby.players.filter(p => p.team === 'qa' && p.currentScore !== undefined);
    
    developerPlayers.forEach(p => {
      if (p.currentScore !== undefined) {
        teamScores.developers[p.id] = p.currentScore;
      }
    });

    qaPlayers.forEach(p => {
      if (p.currentScore !== undefined) {
        teamScores.qa[p.id] = p.currentScore;
      }
    });

    // Check for consensus within each team (excluding "?" votes)
    const devScoreValues = Object.values(teamScores.developers).filter(score => typeof score === 'number');
    const qaScoreValues = Object.values(teamScores.qa).filter(score => typeof score === 'number');
    
    const devConsensus = devScoreValues.length > 0 && devScoreValues.every(score => score === devScoreValues[0]);
    const qaConsensus = qaScoreValues.length > 0 && qaScoreValues.every(score => score === qaScoreValues[0]);

    const teamConsensus = {
      developers: { 
        hasConsensus: devConsensus, 
        score: devConsensus ? (devScoreValues[0] as number) : undefined 
      },
      qa: { 
        hasConsensus: qaConsensus, 
        score: qaConsensus ? (qaScoreValues[0] as number) : undefined 
      }
    };

    // Handle cases where one or both teams are empty - check actual team membership
    const devTeamExists = lobby.teams.developers.length > 0;
    const qaTeamExists = lobby.teams.qa.length > 0;
    
    // Check if teams have consensus and agree on the same score
    let teamsAgree = false;
    
    if (devTeamExists && qaTeamExists) {
      // Both teams exist - require both to have consensus and agree
      const bothTeamsHaveConsensus = devConsensus && qaConsensus;
      teamsAgree = bothTeamsHaveConsensus && devScoreValues[0] === qaScoreValues[0];
    } else if (devTeamExists && !qaTeamExists) {
      // Only developers exist - just need dev consensus
      teamsAgree = devConsensus;
    } else if (!devTeamExists && qaTeamExists) {
      // Only QA exists - just need QA consensus
      teamsAgree = qaConsensus;
    } else {
      // No teams exist - no consensus possible
      teamsAgree = false;
    }

    // Phase 42-02a / FIX-05: gate consensus auto-advance on the host-only Lobby toggle.
    // 3-min voting timeout (handleVotingTimeout) is intentionally NOT gated — safety net stays.
    if (teamsAgree && lobby.boss && lobby.currentTicket && lobby.estimationSettings?.autoAdvance) {
      // Check if countdown is already active
      if (!lobby.consensusCountdown?.isActive) {
        // Start consensus countdown
        const countdownSeconds = lobby.consensusSettings?.countdownSeconds || 5;
        lobby.consensusCountdown = {
          isActive: true,
          remainingSeconds: countdownSeconds,
          startedAt: Date.now()
        };
        
        // Set up countdown timer
        this.startConsensusCountdown(lobby.id);

        // Phase 45-03: emitConsensusCountdownUpdate call removed (no client listener).

        return { lobby, teamScores, teamConsensus };
      }
      
      // If countdown is active, don't process again until countdown finishes
      return { lobby, teamScores, teamConsensus };
    }
    
    // Clear countdown if consensus is lost
    if (lobby.consensusCountdown?.isActive && !teamsAgree) {
      lobby.consensusCountdown = undefined;
      this.clearConsensusCountdown(lobby.id);
      // Phase 45-03: emitConsensusCountdownUpdate call removed (no client listener).
    }

    return { lobby, teamScores, teamConsensus };
  }

  private startConsensusCountdown(lobbyId: string): void {
    // Clear any existing countdown
    this.clearConsensusCountdown(lobbyId);
    
    const countdownInterval = setInterval(() => {
      const lobby = this.lobbies.get(lobbyId);
      if (!lobby || !lobby.consensusCountdown?.isActive) {
        this.clearConsensusCountdown(lobbyId);
        return;
      }
      
      const elapsed = Date.now() - lobby.consensusCountdown.startedAt;
      const remainingMs = (lobby.consensusSettings?.countdownSeconds || 5) * 1000 - elapsed;
      lobby.consensusCountdown.remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      
      if (remainingMs <= 0) {
        // Countdown finished - complete consensus
        this.completeConsensus(lobbyId);
        this.clearConsensusCountdown(lobbyId);
      }
      // Phase 45-03: emitConsensusCountdownUpdate call removed (no client listener).
    }, 100); // Update every 100ms
    
    this.consensusCountdownIntervals.set(lobbyId, countdownInterval);
  }

  manualAdvancePhase(lobbyId: string): { lobby: Lobby } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'discussion') return null;

    // Check if consensus is actually reached
    const result = this.checkDiscussionConsensus(lobbyId);
    if (!result) return null;

    // Clear any existing countdown
    this.clearConsensusCountdown(lobbyId);
    
    // Immediately complete consensus (skip countdown)
    this.completeConsensus(lobbyId);

    return { lobby };
  }

  private clearConsensusCountdown(lobbyId: string): void {
    const interval = this.consensusCountdownIntervals.get(lobbyId);
    if (interval) {
      clearInterval(interval);
      this.consensusCountdownIntervals.delete(lobbyId);
    }
  }

  private completeConsensus(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.boss || !lobby.currentTicket) return;
    
    // Re-calculate consensus to get current scores
    const result = this.checkDiscussionConsensus(lobbyId);
    if (!result) return;
    
    const { teamScores } = result;
    const devScoreValues = Object.values(teamScores.developers).filter(score => typeof score === 'number');
    const qaScoreValues = Object.values(teamScores.qa).filter(score => typeof score === 'number');
    const devTeamExists = lobby.teams.developers.length > 0;
    const qaTeamExists = lobby.teams.qa.length > 0;
    
    // Clear countdown
    lobby.consensusCountdown = undefined;
    
    // Complete the consensus process
    this.updateTeamCompetitionStats(lobby);
    lobby.boss.currentHealth = 0;
    
    // Store completed ticket with agreed story points
    const storyPoints = devTeamExists ? devScoreValues[0] : qaScoreValues[0];
    const completedTicket: CompletedTicket = {
      id: lobby.currentTicket.id,
      title: lobby.currentTicket.title,
      description: lobby.currentTicket.description,
      storyPoints,
      completedAt: new Date().toISOString(),
      teamBreakdown: {
        developers: { 
          participated: devTeamExists && devScoreValues.length > 0, 
          consensusScore: devScoreValues.length > 0 ? devScoreValues[0] : undefined 
        },
        qa: { 
          participated: qaTeamExists && qaScoreValues.length > 0, 
          consensusScore: qaScoreValues.length > 0 ? qaScoreValues[0] : undefined 
        }
      }
    };
    lobby.completedTickets.push(completedTicket);
    
    if (lobby.completedTickets.length >= lobby.tickets.length) {
      lobby.gamePhase = 'victory';
      lobby.boss.defeated = true;
    } else {
      lobby.gamePhase = 'next_level';
      lobby.boss.defeated = true;
      // Progress to next phase/ticket
      // Count active participants for consistent health scaling
      const activeParticipants = lobby.players.filter(p => p.team === 'developers' || p.team === 'qa').length;

      lobby.currentTicket = lobby.tickets[lobby.completedTickets.length];
      lobby.boss = this.createBossFromTickets(lobby.tickets.slice(lobby.completedTickets.length), activeParticipants);
    }

    // Broadcast the phase change and the updated completedTickets so clients
    // can display accurate story-point totals on the victory/next_level screen.
    eventBus.emit('session:phase_changed', {
      lobbyId,
      oldPhase: 'discussion',
      newPhase: lobby.gamePhase,
      completedTickets: lobby.completedTickets,
    });
  }

  // Phase 45-03: emitConsensusCountdownUpdate removed. The legacy
  // 'consensus_countdown_update' wire emit had no client listener and no
  // schema declaration. lobby.consensusCountdown is still tracked
  // server-side for the auto-advance timer, but is not surfaced to clients.
  // If a "X seconds until auto-advance" UI is desired, add a dedicated
  // fine-grained event in a future phase.

  trackPlayerPerformance(playerId: string, performanceData: {
    estimationTime: number;
    score: number | '?';
    team: TeamType;
    ticketId?: string;
  }): void {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) return;

    if (!this.playerPerformanceMap.has(lobbyId)) {
      this.playerPerformanceMap.set(lobbyId, new Map());
    }

    const lobbyPerformance = this.playerPerformanceMap.get(lobbyId)!;
    lobbyPerformance.set(playerId, performanceData);
  }

  private updateTeamCompetitionStats(lobby: Lobby): void {
    const lobbyPerformance = this.playerPerformanceMap.get(lobby.id);
    if (!lobbyPerformance || !lobby.teamCompetition) return;

    const performanceData = TeamStatsManager.calculatePerformanceData(lobby, lobbyPerformance);
    TeamStatsManager.updateTeamCompetitionStats(lobby, performanceData);

    // Clear performance data for this round
    this.playerPerformanceMap.delete(lobby.id);
  }

  attackBoss(playerId: string, _damage: number): { lobby: Lobby; bossHealth: number; ringAttack?: RingAttack | null; healedBoss?: boolean; modifier?: number } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || !lobby.boss || lobby.gamePhase !== 'battle') return null;

    // Boss is already dead — no more attacks
    if (lobby.boss.defeated || lobby.boss.currentHealth <= 0) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    // Get current modifier
    const modifier = this.getCurrentModifier(lobby);
    lobby.battleModifier = modifier;

    // Calculate actual damage/heal based on team and modifier
    let actualDamage = 0;
    let healedBoss = false;

    if (player.team === 'spectators') {
      // Spectators heal the boss for 1 + modifier
      // TODO MAINT-05+: spectator-heal should also delegate to CombatManager
      const healAmount = 1 + modifier;
      lobby.boss.currentHealth = Math.min(lobby.boss.maxHealth, lobby.boss.currentHealth + healAmount);
      healedBoss = true;
      gameLogger.debug({ playerName: player.name, healAmount, modifier }, 'Spectator healed boss');
    } else if (player.team === 'developers' || player.team === 'qa') {
      // Delegate to CombatManager — single boss-HP truth (MAINT-05).
      // CombatManager.applyBasicDamageToBoss owns the HP drain, the combat:boss_damaged emit,
      // and the checkPhaseTransition call. lobby.boss.currentHealth is a projection only.
      const { damage: actualDmg, newHp } = combatManager.applyBasicDamageToBoss(lobby.id, playerId);
      actualDamage = actualDmg;
      lobby.boss.currentHealth = newHp;  // projection only — CombatManager owns HP
      if (newHp <= 0) {
        lobby.boss.defeated = true;
      }
      gameLogger.debug({ team: player.team, playerName: player.name, damage: actualDamage, modifier }, 'Player dealt damage to boss');
    }

    // Note: boss defeat for dev/qa path is now handled above (newHp <= 0 guard).
    // Spectator path still uses currentHealth guard below for its (un-delegated) heal+defeat edge case.
    if (player.team === 'spectators' && lobby.boss.currentHealth <= 0) {
      lobby.boss.defeated = true;
    }

    // Check if boss should perform ring attack (every ~10 attacks or when health is low)
    const shouldRingAttack = Math.random() < 0.15 || lobby.boss.currentHealth < lobby.boss.maxHealth * 0.3;
    let ringAttack = null;

    if (shouldRingAttack && lobby.boss.currentHealth > 0) {
      const now = Date.now();
      // Rate limit ring attacks to every 2 seconds
      if (!lobby.boss.lastRingAttack || now - lobby.boss.lastRingAttack > 2000) {
        lobby.boss.lastRingAttack = now;
        ringAttack = this.createRingAttack(lobby);
      }
    }

    return {
      lobby,
      bossHealth: lobby.boss.currentHealth,
      ringAttack,
      healedBoss,
      modifier
    };
  }

  private createRingAttack(lobby: Lobby): RingAttack | null {
    // Get all active (non-downed) non-spectator players
    const targets = lobby.players
      .filter(p => p.team !== 'spectators' && !lobby.playerCombatStates[p.id]?.isDowned)
      .map(p => ({
        playerId: p.id,
        position: lobby.playerPositions[p.id] || { x: 50, y: 80 }
      }));

    if (targets.length === 0) return null;

    // Create 6 projectiles in a ring pattern around each player
    const projectiles: RingAttackProjectile[] = [];
    const projectileCount = 6;

    targets.forEach(target => {
      for (let i = 0; i < projectileCount; i++) {
        const angle = (i / projectileCount) * 2 * Math.PI;
        const radius = 5 + Math.random() * 3; // 5-8% radius
        
        const targetX = target.position.x + Math.cos(angle) * radius;
        const targetY = target.position.y + Math.sin(angle) * radius;
        
        projectiles.push({
          id: generateSecureId(),
          startX: 50, // Boss center
          startY: 40, // Boss center
          targetX: Math.max(5, Math.min(95, targetX)), // Keep within bounds
          targetY: Math.max(5, Math.min(95, targetY)), // Keep within bounds
          progress: 0,
          emoji: '💥'
        });
      }
    });

    return {
      type: 'ring',
      projectiles,
      targetCount: targets.length
    };
  }

  // Player revival system
  startRevive(reviverId: string, targetId: string): boolean {
    const lobby = this.getLobbyByPlayerId(reviverId);
    if (!lobby) return false;

    const reviverState = lobby.playerCombatStates[reviverId];
    const targetState = lobby.playerCombatStates[targetId];
    const reviverPos = lobby.playerPositions[reviverId];
    const targetPos = lobby.playerPositions[targetId];

    if (!reviverState || !targetState || !reviverPos || !targetPos) return false;
    if (reviverState.isDowned || !targetState.isDowned) return false;

    // Check distance
    const distance = Math.sqrt(
      Math.pow(reviverPos.x - targetPos.x, 2) + 
      Math.pow(reviverPos.y - targetPos.y, 2)
    );

    if (distance > 10) return false; // Must be within 10% distance

    const sessionKey = `${reviverId}:${targetId}`;
    
    // Cancel any existing session for this reviver
    for (const [key, session] of this.revivalSessions) {
      if (session.reviverId === reviverId) {
        this.cancelRevivalSession(key);
      }
    }

    const now = Date.now();
    const timeoutHandle = setTimeout(() => {
      // Auto-complete after 3 seconds if no cancellation
      this.completeRevival(sessionKey);
    }, 3000);

    this.revivalSessions.set(sessionKey, {
      reviverId,
      targetId,
      lobbyId: lobby.id,
      startedAt: now,
      lastTick: now,
      timeoutHandle
    });

    return true;
  }

  cancelRevive(reviverId: string, targetId: string): boolean {
    const sessionKey = `${reviverId}:${targetId}`;
    this.cancelRevivalSession(sessionKey);
    return true;
  }

  tickRevive(reviverId: string, targetId: string): boolean {
    const sessionKey = `${reviverId}:${targetId}`;
    const session = this.revivalSessions.get(sessionKey);
    
    if (!session) return false;

    const lobby = this.lobbies.get(session.lobbyId);
    if (!lobby) {
      this.cancelRevivalSession(sessionKey);
      return false;
    }

    const reviverState = lobby.playerCombatStates[reviverId];
    const targetState = lobby.playerCombatStates[targetId];
    const reviverPos = lobby.playerPositions[reviverId];
    const targetPos = lobby.playerPositions[targetId];

    if (!reviverState || !targetState || !reviverPos || !targetPos) {
      this.cancelRevivalSession(sessionKey);
      return false;
    }
    
    if (reviverState.isDowned || !targetState.isDowned) {
      this.cancelRevivalSession(sessionKey);
      return false;
    }
    
    const distance = Math.sqrt(
      Math.pow(reviverPos.x - targetPos.x, 2) + 
      Math.pow(reviverPos.y - targetPos.y, 2)
    );
    
    if (distance > 10) {
      this.cancelRevivalSession(sessionKey);
      return false;
    }
    
    // Update last tick
    session.lastTick = Date.now();
    return true;
  }

  // Timer management methods (updateTimerSettings/updateJiraSettings/updateEstimationSettings
  // deleted in Phase 50-01 — now owned by SessionManager with host guard)
  startTimer(lobbyId: string): { lobby: Lobby; timerState: TimerState } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || !lobby.timerSettings?.enabled) return null;

    // Clear any existing timer
    this.clearTimer(lobbyId);

    const durationMs = lobby.timerSettings.durationMinutes * 60 * 1000;
    const timerState: TimerState = {
      startedAt: Date.now(),
      durationMs,
      isActive: true
    };

    lobby.currentTimer = timerState;

    // Set up auto-reveal timer
    const timeoutId = setTimeout(() => {
      this.autoRevealOnTimerExpiry(lobbyId);
    }, durationMs);

    this.timerIntervals.set(lobbyId, timeoutId);

    return { lobby, timerState };
  }

  clearTimer(lobbyId: string): void {
    const timeoutId = this.timerIntervals.get(lobbyId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.timerIntervals.delete(lobbyId);
    }

    const lobby = this.lobbies.get(lobbyId);
    if (lobby) {
      lobby.currentTimer = undefined;
    }
  }

  private autoRevealOnTimerExpiry(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'battle') return;

    // Force reveal phase if timer expires
    lobby.gamePhase = 'reveal';
    lobby.currentTimer = undefined;
    this.timerIntervals.delete(lobbyId);
    this.emitRevealCascade(lobbyId);
  }

  forceReveal(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    // Clear any active timer
    this.clearTimer(lobby.id);

    // Force transition to reveal phase
    lobby.gamePhase = 'reveal';
    return lobby;
  }

  handlePlayerDamage(playerId: string, damage: number, attackerId?: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const playerState = lobby.playerCombatStates[playerId];
    if (!playerState || playerState.isDowned) return null;

    playerState.hp = Math.max(0, playerState.hp - damage);
    playerState.lastDamagedBy = attackerId;

    if (playerState.hp <= 0) {
      playerState.isDowned = true;
    }

    return lobby;
  }
}

export const gameState = new GameStateManager();

// Method to set the io instance after it's created
export function setGameStateIO(io: SocketIOServer) {
  (gameState as unknown as { io: SocketIOServer }).io = io;
}