import { Lobby, Player, Boss, JiraTicket, CompletedTicket, GamePhase, TeamType, AvatarClass, TeamScores, TeamConsensus, TeamCompetition, TeamStats, TimerSettings, JiraSettings, TimerState, EstimationSettings, ReconnectToken, DisconnectedPlayer, LobbySync, ReconnectResult, ReconnectResponse } from '../shared/gameEvents.js';
import { TeamStatsManager } from './teamStatsManager.js';
import { createHash, createHmac } from 'crypto';

interface RevivalSession {
  reviverId: string;
  targetId: string;
  lobbyId: string;
  startedAt: number;
  lastTick: number;
  timeoutHandle: NodeJS.Timeout;
}

class GameStateManager {
  private lobbies: Map<string, Lobby> = new Map();
  private playerToLobby: Map<string, string> = new Map();
  private revivalSessions: Map<string, RevivalSession> = new Map(); // key: `${reviverId}:${targetId}`
  private revivalWatchdog: NodeJS.Timeout;
  private playerPerformanceMap: Map<string, Map<string, { estimationTime: number; score: number | '?'; team: TeamType }>> = new Map();
  private timerIntervals = new Map<string, NodeJS.Timeout>();
  private consensusCountdownIntervals = new Map<string, NodeJS.Timeout>();
  private votingTimeouts = new Map<string, NodeJS.Timeout>(); // Store voting timeouts separately
  private modifierIntervals = new Map<string, NodeJS.Timeout>(); // Track modifier intervals per lobby
  private io?: any; // SocketIO server instance
  
  // Reconnection system
  private disconnectedPlayers: Map<string, DisconnectedPlayer> = new Map(); // key: playerId
  private reconnectTokens: Map<string, ReconnectToken> = new Map(); // key: token string
  private disconnectWatchdog: NodeJS.Timeout;
  private readonly DISCONNECT_GRACE_PERIOD = 10 * 60 * 1000; // 10 minutes
  private readonly TOKEN_EXPIRY_TIME = 15 * 60 * 1000; // 15 minutes
  private readonly TOKEN_SECRET = process.env.RECONNECT_TOKEN_SECRET || 'scrum-monsters-secret-' + Math.random();

  constructor(io?: any) {
    this.io = io;
    // Start revival watchdog timer
    this.revivalWatchdog = setInterval(() => {
      this.processRevivalSessions();
    }, 100); // Check every 100ms
    
    // Start disconnect watchdog timer
    this.disconnectWatchdog = setInterval(() => {
      this.processDisconnectedPlayers();
    }, 30000); // Check every 30 seconds
  }

  generateLobbyId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private processRevivalSessions(): { lobbyId: string; targetId: string; reviverId: string }[] {
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
        console.log(`🔌 Player ${disconnectedPlayer.playerName} (${playerId}) grace period expired - removing permanently`);
        this.disconnectedPlayers.delete(playerId);
        
        // Remove from lobby permanently
        const lobby = this.removePlayer(playerId);
        if (lobby && this.io) {
          this.io.to(disconnectedPlayer.lobbyId).emit('lobby_updated', { lobby });
        }
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
        console.log('🔑 Token not found in active tokens');
        return null;
      }

      // Check expiry
      if (Date.now() > token.expiresAt) {
        console.log('🔑 Token expired');
        this.reconnectTokens.delete(tokenString);
        return null;
      }

      // Verify signature
      const { signature, ...tokenData } = token;
      const expectedSignature = createHmac('sha256', this.TOKEN_SECRET).update(JSON.stringify(tokenData)).digest('hex');
      
      if (signature !== expectedSignature) {
        console.log('🔑 Token signature invalid');
        this.reconnectTokens.delete(tokenString);
        return null;
      }

      return token;
    } catch (error) {
      console.log('🔑 Token validation error:', error);
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

    console.log(`👑 Host transferred from ${oldHost?.name || 'unknown'} (${oldHostId}) to ${newHost.name} (${newHost.id})`);

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

    console.log(`🔌 Player ${player.name} (${playerId}) disconnected - grace period: ${this.DISCONNECT_GRACE_PERIOD / 60000} minutes`);

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

    console.log(`🔌 Player ${token.playerName} (${token.playerId}) successfully reconnected to lobby ${token.lobbyId}`);

    // Check if this player lost host status during disconnect
    let newHostName: string | undefined;
    if (!player.isHost && lobby.hostId !== token.playerId) {
      const currentHost = lobby.players.find(p => p.id === lobby.hostId);
      if (currentHost) {
        newHostName = currentHost.name;
        console.log(`ℹ️ Player ${token.playerName} reconnected but is no longer host. Current host: ${currentHost.name}`);
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
      console.log(`🔑 Cleaned up ${expiredTokens.length} expired reconnect tokens`);
    }
  }

  createLobby(hostName: string, lobbyName: string, initialSettings?: { 
    timerSettings?: TimerSettings; 
    jiraSettings?: JiraSettings; 
    estimationSettings?: EstimationSettings; 
  }): Lobby {
    const lobbyId = this.generateLobbyId();
    const hostId = Math.random().toString(36).substring(2, 15);
    
    const lobby: Lobby = {
      id: lobbyId,
      name: lobbyName,
      hostId,
      players: [{
        id: hostId,
        name: hostName,
        team: 'spectators',
        isHost: true,
        avatar: 'warrior',
        avatarClass: 'warrior',
        hasSubmittedScore: false,
        currentScore: undefined
      }],
      teams: {
        developers: [],
        qa: [],
        spectators: []
      },
      tickets: [],
      gamePhase: 'lobby',
      completedTickets: [],
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
          bestStreak: 0
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
          bestStreak: 0
        },
        currentRound: 0,
        winnerHistory: [],
        seasonStart: new Date().toISOString()
      },
      playerCombatStates: {
        [hostId]: {
          maxHp: 100,
          hp: 100,
          isDowned: false
        }
      },
      playerPositions: {
        [hostId]: {
          x: Math.random() * 80 + 10,
          y: 80
        }
      },
      consensusSettings: {
        countdownSeconds: 5
      },
      // Apply initial settings if provided
      timerSettings: initialSettings?.timerSettings,
      jiraSettings: initialSettings?.jiraSettings,
      estimationSettings: initialSettings?.estimationSettings
    };

    this.updateTeamAssignments(lobby);
    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(hostId, lobbyId);
    return lobby;
  }

  joinLobby(lobbyId: string, playerName: string): { lobby: Lobby; player: Player } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    // Create or get existing player
    let player = lobby.players.find(p => p.name === playerName);
    if (!player) {
      player = {
        id: Math.random().toString(36).substring(2, 15),
        name: playerName,
        team: 'developers',
        isHost: false,
        avatar: 'warrior',
        avatarClass: 'warrior',
        hasSubmittedScore: false,
        currentScore: undefined
      };
      lobby.players.push(player);
    }

    // Update team assignments
    this.updateTeamAssignments(lobby);
    this.playerToLobby.set(player.id, lobbyId);

    // Initialize combat state for new player
    if (!lobby.playerCombatStates[player.id]) {
      lobby.playerCombatStates[player.id] = {
        maxHp: 100,
        hp: 100,
        isDowned: false
      };
    }

    // Initialize position for new player (random position along bottom)
    if (!lobby.playerPositions[player.id]) {
      lobby.playerPositions[player.id] = {
        x: Math.random() * 80 + 10, // 10-90% from left
        y: 80 // Fixed at bottom 80% from top
      };
    }

    return { lobby, player };
  }

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

    // If no players left, remove lobby
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      return null;
    }

    // Transfer host if needed
    if (lobby.hostId === playerId && lobby.players.length > 0) {
      lobby.hostId = lobby.players[0].id;
      lobby.players[0].isHost = true;
    }

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

  getLobbyByPlayerId(playerId: string): Lobby | null {
    const lobbyId = this.playerToLobby.get(playerId);
    if (!lobbyId) return null;
    return this.lobbies.get(lobbyId) || null;
  }

  updatePlayerTeam(playerId: string, team: TeamType): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    player.team = team;
    this.updateTeamAssignments(lobby);

    return lobby;
  }

  updatePlayerAvatar(playerId: string, avatar: AvatarClass): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    player.avatar = avatar;
    player.avatarClass = avatar; // Keep both for compatibility

    return lobby;
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
    console.log(`🏠 GameState: returnToLobby called for player ${playerId}`);
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) {
      console.log('❌ No lobby found for player');
      return null;
    }

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) {
      console.log('❌ Player is not host, cannot return to lobby');
      return null;
    }

    console.log(`🏠 Current lobby phase: ${lobby.gamePhase}`);
    // Only allow return to lobby from victory phase
    if (lobby.gamePhase !== 'victory') {
      console.log('❌ Can only return to lobby from victory phase');
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

  attackPlayer(attackerId: string, targetId: string, damage: number): { lobby: Lobby; targetHealth: number; gameOver?: boolean; modifier?: number } | null {
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

    console.log(`👁️ Spectator ${attacker.name} attacked ${target.name} for ${actualDamage} damage (modifier: ${modifier})`);

    // Check for game over
    const gameOver = this.checkGameOver(lobby);
    if (gameOver) {
      lobby.gamePhase = 'game_over';
      console.log('💀 GAME OVER - All developers/QA are downed!');
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
        console.log(`✨ Cleric ${healer.name} revived ${player.name}!`);
      }

      if (playerState.hp > oldHp) {
        healedPlayers.push({ playerId: player.id, newHealth: playerState.hp });
      }
    }

    console.log(`💫 Cleric ${healer.name} healed ${healedPlayers.length} party members!`);

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
      lobby.gamePhase = 'game_over';
      console.log('💀 GAME OVER - All developers/QA are downed!');
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

  proceedToNextPhase(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    switch (lobby.gamePhase) {
      case 'avatar_selection':
        lobby.gamePhase = 'battle';
        break;
      case 'next_level':
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
    
    console.log(`🎯 Boss health scaling: ${activeParticipants} participants → ${participantScaling.toFixed(2)}x multiplier → ${scaledHealth} HP`);
    
    // Available boss types with simplified sprite names
    const availableBosses = [
      { 
        sprite: 'bug-hydra.png', 
        name: 'Bug Hydra', 
        description: 'Legendary Beast of Endless Bugs' 
      },
      { 
        sprite: 'sprint-demon.png', 
        name: 'Sprint Demon', 
        description: 'Infernal Master of Rushed Deadlines' 
      },
      { 
        sprite: 'deadline-dragon.png', 
        name: 'Deadline Dragon', 
        description: 'Ancient Terror of Time Constraints' 
      },
      { 
        sprite: 'technical-debt-golem.png', 
        name: 'Technical Debt Golem', 
        description: 'Crushing Burden of Legacy Code' 
      },
      { 
        sprite: 'scope-creep-beast.png', 
        name: 'Scope Creep Beast', 
        description: 'Ever-Expanding Horror of Feature Bloat' 
      }
    ];
    
    // Randomly select a boss type
    const selectedBoss = availableBosses[Math.floor(Math.random() * availableBosses.length)];
    
    const bossName = activeParticipants > 1 
      ? `${selectedBoss.name} of ${tickets.length} Challenge${tickets.length > 1 ? 's' : ''} (${activeParticipants} Warriors)`
      : `${selectedBoss.name} of ${tickets.length} Challenge${tickets.length > 1 ? 's' : ''}`;
    
    return {
      id: Math.random().toString(36).substring(2, 15),
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
      console.log(`✅ All ${nonSpectatorPlayers.length} players voted - advancing to reveal`);
      return true;
    }

    // Strategy 2: All connected players submitted (exclude disconnected)
    if (connectedPlayers.length > 0 && submittedPlayers.length === connectedPlayers.length) {
      const disconnectedCount = nonSpectatorPlayers.length - connectedPlayers.length;
      console.log(`✅ All ${connectedPlayers.length} connected players voted (${disconnectedCount} disconnected) - advancing to reveal`);
      return true;
    }

    // Strategy 3: Majority threshold (75%) with minimum time elapsed
    const votingStartTime = lobby.votingStartedAt || 0;
    const minVotingTime = 30000; // 30 seconds minimum voting time
    const timeElapsed = Date.now() - votingStartTime;
    
    if (timeElapsed >= minVotingTime && connectedPlayers.length >= 2) {
      const votePercentage = submittedPlayers.length / connectedPlayers.length;
      if (votePercentage >= 0.75) { // 75% threshold
        console.log(`✅ Majority vote reached: ${submittedPlayers.length}/${connectedPlayers.length} (${Math.round(votePercentage * 100)}%) after ${Math.round(timeElapsed/1000)}s`);
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

    console.log(`⏱️ Voting timeout started for lobby ${lobbyId} - 3 minutes until auto-advance`);
  }

  // Handle voting timeout - force progression with available votes
  private handleVotingTimeout(lobbyId: string): void {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'battle') return;

    const nonSpectatorPlayers = lobby.players.filter(p => p.team !== 'spectators');
    const submittedPlayers = nonSpectatorPlayers.filter(p => p.hasSubmittedScore);
    const connectedPlayers = nonSpectatorPlayers.filter(p => !this.isPlayerDisconnected(p.id));

    console.log(`⏰ Voting timeout reached for lobby ${lobbyId}: ${submittedPlayers.length}/${connectedPlayers.length} voted`);

    // Force advancement if at least one person voted
    if (submittedPlayers.length > 0) {
      lobby.gamePhase = 'reveal';
      this.votingTimeouts.delete(lobbyId);
      
      // Emit update via IO
      if (this.io) {
        this.io.to(lobbyId).emit('voting_timeout', {
          submittedCount: submittedPlayers.length,
          totalCount: connectedPlayers.length,
          message: `Voting time expired. Proceeding with ${submittedPlayers.length} votes.`
        });
        this.io.to(lobbyId).emit('lobby_updated', { lobby });
      }

      console.log(`✅ Auto-advanced to reveal phase with ${submittedPlayers.length} votes`);
    } else {
      console.log(`❌ No votes submitted - keeping in battle phase`);
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
    console.log(`🚀 ${message} in lobby ${lobby.id}`);

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

    // Handle cases where one or both teams are empty - check actual team membership
    const devTeamExists = lobby.teams.developers.length > 0;
    const qaTeamExists = lobby.teams.qa.length > 0;
    
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

    if (teamsAgree && lobby.boss && lobby.currentTicket) {
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
        
        // Emit countdown started event
        this.emitConsensusCountdownUpdate(lobby.id, lobby.consensusCountdown);
        
        return { lobby, teamScores, teamConsensus };
      }
      
      // If countdown is active, don't process again until countdown finishes
      return { lobby, teamScores, teamConsensus };
    }
    
    // Clear countdown if consensus is lost
    if (lobby.consensusCountdown?.isActive && !teamsAgree) {
      lobby.consensusCountdown = undefined;
      this.clearConsensusCountdown(lobby.id);
      // Emit countdown cancelled event
      this.emitConsensusCountdownUpdate(lobby.id, null);
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
      } else {
        // Emit countdown update
        this.emitConsensusCountdownUpdate(lobbyId, lobby.consensusCountdown);
      }
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
  }

  private emitConsensusCountdownUpdate(lobbyId: string, countdown: { isActive: boolean; remainingSeconds: number; startedAt: number } | null): void {
    if (this.io) {
      this.io.to(lobbyId).emit('consensus_countdown_update', { countdown });
    }
  }

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

  attackBoss(playerId: string, damage: number): { lobby: Lobby; bossHealth: number; ringAttack?: any; healedBoss?: boolean; modifier?: number } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || !lobby.boss || lobby.gamePhase !== 'battle') return null;

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
      const healAmount = 1 + modifier;
      lobby.boss.currentHealth = Math.min(lobby.boss.maxHealth, lobby.boss.currentHealth + healAmount);
      healedBoss = true;
      console.log(`👁️ Spectator ${player.name} healed boss for ${healAmount} (modifier: ${modifier})`);
    } else if (player.team === 'developers' || player.team === 'qa') {
      // Developers and QA deal 15 - modifier damage (minimum 1)
      actualDamage = Math.max(1, 15 - modifier);
      lobby.boss.currentHealth = Math.max(0, lobby.boss.currentHealth - actualDamage);
      console.log(`⚔️ ${player.team} ${player.name} dealt ${actualDamage} damage (modifier: ${modifier})`);
    }

    // Check if boss is defeated when health reaches 0
    if (lobby.boss.currentHealth <= 0) {
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

  private createRingAttack(lobby: Lobby): any {
    // Get all active (non-downed) non-spectator players
    const targets = lobby.players
      .filter(p => p.team !== 'spectators' && !lobby.playerCombatStates[p.id]?.isDowned)
      .map(p => ({
        playerId: p.id,
        position: lobby.playerPositions[p.id] || { x: 50, y: 80 }
      }));

    if (targets.length === 0) return null;

    // Create 6 projectiles in a ring pattern around each player
    const projectiles: Array<{
      id: string;
      startX: number;
      startY: number;
      targetX: number;
      targetY: number;
      progress: number;
      emoji: string;
    }> = [];
    const projectileCount = 6;

    targets.forEach(target => {
      for (let i = 0; i < projectileCount; i++) {
        const angle = (i / projectileCount) * 2 * Math.PI;
        const radius = 5 + Math.random() * 3; // 5-8% radius
        
        const targetX = target.position.x + Math.cos(angle) * radius;
        const targetY = target.position.y + Math.sin(angle) * radius;
        
        projectiles.push({
          id: Math.random().toString(36).substring(2, 15),
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

  // Timer management methods
  updateTimerSettings(playerId: string, timerSettings: TimerSettings): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    lobby.timerSettings = timerSettings;
    return lobby;
  }

  updateJiraSettings(playerId: string, jiraSettings: JiraSettings): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    lobby.jiraSettings = jiraSettings;
    return lobby;
  }

  updateEstimationSettings(playerId: string, estimationSettings: EstimationSettings): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    lobby.estimationSettings = estimationSettings;
    return lobby;
  }

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
export function setGameStateIO(io: any) {
  (gameState as any).io = io;
}