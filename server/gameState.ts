import { Lobby, Player, Boss, JiraTicket, CompletedTicket, GamePhase, TeamType, AvatarClass, TeamScores, TeamConsensus, TeamCompetition, TeamStats } from '../shared/gameEvents.js';
import { TeamStatsManager } from './teamStatsManager.js';

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
  private playerPerformanceMap: Map<string, Map<string, { estimationTime: number; score: number; team: TeamType }>> = new Map();

  constructor() {
    // Start revival watchdog timer
    this.revivalWatchdog = setInterval(() => {
      this.processRevivalSessions();
    }, 100); // Check every 100ms
  }

  generateLobbyId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private processRevivalSessions(): { lobbyId: string; targetId: string; reviverId: string }[] {
    const now = Date.now();
    const completedRevivals: { lobbyId: string; targetId: string; reviverId: string }[] = [];
    
    for (const [sessionKey, session] of this.revivalSessions.entries()) {
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

      // Check if revival is complete
      if (now >= session.startedAt + 3000) {
        const completed = this.completeRevivalSession(sessionKey);
        if (completed) {
          completedRevivals.push(completed);
        }
      }
    }
    
    return completedRevivals;
  }

  private cancelRevivalSession(sessionKey: string) {
    const session = this.revivalSessions.get(sessionKey);
    if (session) {
      clearTimeout(session.timeoutHandle);
      const lobby = this.lobbies.get(session.lobbyId);
      if (lobby) {
        const targetState = lobby.playerCombatStates[session.targetId];
        if (targetState) {
          targetState.revivedBy = undefined;
          targetState.reviveEndsAt = undefined;
        }
      }
      this.revivalSessions.delete(sessionKey);
    }
  }

  private completeRevivalSession(sessionKey: string): { lobbyId: string; targetId: string; reviverId: string } | null {
    const session = this.revivalSessions.get(sessionKey);
    if (session) {
      const lobby = this.lobbies.get(session.lobbyId);
      if (lobby) {
        const targetState = lobby.playerCombatStates[session.targetId];
        if (targetState && targetState.revivedBy === session.reviverId) {
          targetState.hp = targetState.maxHp;
          targetState.isDowned = false;
          targetState.revivedBy = undefined;
          targetState.reviveEndsAt = undefined;
          
          this.cancelRevivalSession(sessionKey);
          return { lobbyId: session.lobbyId, targetId: session.targetId, reviverId: session.reviverId };
        }
      }
      this.cancelRevivalSession(sessionKey);
    }
    return null;
  }

  private initializeTeamCompetition(): TeamCompetition {
    return {
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
      currentRound: 1,
      winnerHistory: [],
      seasonStart: new Date().toISOString()
    };
  }

  createLobby(hostName: string, lobbyName: string): { lobby: Lobby; inviteLink: string } {
    const lobbyId = this.generateLobbyId();
    const hostId = this.generatePlayerId();
    
    const host: Player = {
      id: hostId,
      name: hostName,
      avatar: 'wizard',
      team: 'developers',
      isHost: true,
      hasSubmittedScore: false
    };

    const lobby: Lobby = {
      id: lobbyId,
      name: lobbyName,
      hostId,
      players: [host],
      teams: {
        developers: [host],
        qa: [],
        spectators: []
      },
      tickets: [],
      gamePhase: 'lobby',
      completedTickets: [],
      teamCompetition: this.initializeTeamCompetition(),
      playerCombatStates: {
        [hostId]: {
          maxHp: 100,
          hp: 100,
          isDowned: false
        }
      },
      playerPositions: {
        [hostId]: { x: 50, y: 50 }
      }
    };

    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(hostId, lobbyId);

    // Use Replit's public domain if available, otherwise fall back to BASE_URL or localhost
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : (process.env.BASE_URL || 'http://localhost:5000');
    const inviteLink = `${baseUrl}/join/${lobbyId}`;
    
    return { lobby, inviteLink };
  }

  joinLobby(lobbyId: string, playerName: string): { lobby: Lobby; player: Player } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) return null;

    if (lobby.players.length >= 32) {
      throw new Error('Lobby is full (32 players maximum)');
    }

    const playerId = this.generatePlayerId();
    const player: Player = {
      id: playerId,
      name: playerName,
      avatar: 'warrior',
      team: 'developers',
      isHost: false,
      hasSubmittedScore: false
    };

    lobby.players.push(player);
    lobby.teams.developers.push(player);
    this.playerToLobby.set(playerId, lobbyId);

    // Initialize combat state for new player
    lobby.playerCombatStates[playerId] = {
      maxHp: 100,
      hp: 100,
      isDowned: false
    };
    lobby.playerPositions[playerId] = { x: 50, y: 50 };

    return { lobby, player };
  }

  getLobby(lobbyId: string): Lobby | undefined {
    return this.lobbies.get(lobbyId);
  }

  getLobbyByPlayerId(playerId: string): Lobby | undefined {
    const lobbyId = this.playerToLobby.get(playerId);
    return lobbyId ? this.lobbies.get(lobbyId) : undefined;
  }

  selectAvatar(playerId: string, avatarClass: AvatarClass): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    player.avatar = avatarClass;
    return lobby;
  }

  assignTeam(playerId: string, targetPlayerId: string, team: TeamType): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    const targetPlayer = lobby.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) return null;

    // Remove from current team
    Object.keys(lobby.teams).forEach(teamKey => {
      const teamType = teamKey as TeamType;
      lobby.teams[teamType] = lobby.teams[teamType].filter(p => p.id !== targetPlayerId);
    });

    // Add to new team
    targetPlayer.team = team;
    lobby.teams[team].push(targetPlayer);

    return lobby;
  }

  // Allow players to change their own team
  changeOwnTeam(playerId: string, team: TeamType): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    // Don't allow changing team during active gameplay phases
    if (lobby.gamePhase !== 'lobby') return null;

    // Remove from current team
    Object.keys(lobby.teams).forEach(teamKey => {
      const teamType = teamKey as TeamType;
      lobby.teams[teamType] = lobby.teams[teamType].filter(p => p.id !== playerId);
    });

    // Add to new team
    player.team = team;
    lobby.teams[team].push(player);

    return lobby;
  }

  startBattle(playerId: string, tickets: JiraTicket[]): { lobby: Lobby; boss: Boss } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    lobby.tickets = tickets;
    lobby.currentTicket = tickets[0];
    lobby.gamePhase = 'battle';
    lobby.completedTickets = [];

    // Reset player scores
    lobby.players.forEach(p => {
      p.hasSubmittedScore = false;
      p.currentScore = undefined;
    });

    // Create boss based on tickets
    const boss: Boss = this.createBossFromTickets(tickets);
    lobby.boss = boss;

    return { lobby, boss };
  }

  // Allow host to abandon quest and return to lobby
  abandonQuest(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    // Reset lobby to initial state
    lobby.gamePhase = 'lobby';
    lobby.currentTicket = undefined;
    lobby.boss = undefined;
    lobby.completedTickets = [];

    // Reset all player scores and submission status
    lobby.players.forEach(p => {
      p.hasSubmittedScore = false;
      p.currentScore = undefined;
    });

    return lobby;
  }

  submitScore(playerId: string, score: number): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

    // Prevent spectators from submitting scores
    if (player.team === 'spectators') return null;

    player.currentScore = score;
    player.hasSubmittedScore = true;

    // Check if all non-spectator players have submitted
    const nonSpectatorPlayers = lobby.players.filter(p => p.team !== 'spectators');
    const allSubmitted = nonSpectatorPlayers.every(p => p.hasSubmittedScore);

    if (allSubmitted) {
      lobby.gamePhase = 'reveal';
    }

    return lobby;
  }

  revealScores(lobbyId: string): { lobby: Lobby; teamScores: TeamScores; teamConsensus: TeamConsensus } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'reveal') return null;

    const teamScores = {
      developers: {} as Record<string, number>,
      qa: {} as Record<string, number>
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

    // Check for consensus within each team
    const devScoreValues = Object.values(teamScores.developers);
    const qaScoreValues = Object.values(teamScores.qa);
    
    const devConsensus = devScoreValues.length > 0 && devScoreValues.every(score => score === devScoreValues[0]);
    const qaConsensus = qaScoreValues.length > 0 && qaScoreValues.every(score => score === qaScoreValues[0]);

    const teamConsensus = {
      developers: { 
        hasConsensus: devConsensus, 
        score: devConsensus ? devScoreValues[0] : undefined 
      },
      qa: { 
        hasConsensus: qaConsensus, 
        score: qaConsensus ? qaScoreValues[0] : undefined 
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
      // Update team competition stats
      this.updateTeamCompetitionStats(lobby);
      // Defeat current boss phase
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
            participated: devTeamExists && devConsensus, 
            consensusScore: devConsensus ? devScoreValues[0] : undefined 
          },
          qa: { 
            participated: qaTeamExists && qaConsensus, 
            consensusScore: qaConsensus ? qaScoreValues[0] : undefined 
          }
        }
      };
      lobby.completedTickets.push(completedTicket);
      
      if (lobby.completedTickets.length >= lobby.tickets.length) {
        lobby.gamePhase = 'victory';
        lobby.boss.defeated = true;
      } else {
        lobby.gamePhase = 'next_level';
        // Set boss as defeated for current phase
        lobby.boss.defeated = true;
        // Progress to next phase/ticket
        lobby.currentTicket = lobby.tickets[lobby.completedTickets.length];
        lobby.boss = this.createBossFromTickets(lobby.tickets.slice(lobby.completedTickets.length));
      }
    } else {
      // Reset for another round if no consensus or teams disagree
      lobby.gamePhase = 'battle';
      // Reset all non-spectator players' voting state
      lobby.players.forEach(p => {
        if (p.team !== 'spectators') {
          p.hasSubmittedScore = false;
          p.currentScore = undefined;
        }
      });
    }

    return { lobby, teamScores, teamConsensus };
  }

  trackPlayerPerformance(playerId: string, performanceData: {
    estimationTime: number;
    score: number;
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

  attackBoss(playerId: string, damage: number): { lobby: Lobby; bossHealth: number } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || !lobby.boss || lobby.gamePhase !== 'battle') return null;

    // Cosmetic damage during voting phase
    lobby.boss.currentHealth = Math.max(0, lobby.boss.currentHealth - damage);
    
    return { lobby, bossHealth: lobby.boss.currentHealth };
  }

  proceedNextLevel(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    if (lobby.gamePhase === 'next_level') {
      lobby.gamePhase = 'battle';
      // Reset player scores
      lobby.players.forEach(p => {
        p.hasSubmittedScore = false;
        p.currentScore = undefined;
      });
    }

    return lobby;
  }

  forceRevealScores(playerId: string): { lobby: Lobby; teamScores: TeamScores; teamConsensus: TeamConsensus } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    // Force transition to reveal phase
    lobby.gamePhase = 'reveal';
    
    // Use the same reveal logic as normal reveal
    return this.revealScores(lobby.id);
  }

  setPlayerJumping(playerId: string, isJumping: boolean): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const playerCombatState = lobby.playerCombatStates[playerId];
    if (playerCombatState) {
      playerCombatState.isJumping = isJumping;
      console.log(`🦘 Player ${playerId} jumping state: ${isJumping}`);
    }

    return lobby;
  }

  removePlayer(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    // Cancel any revival sessions involving this player
    for (const [sessionKey, session] of this.revivalSessions.entries()) {
      if (session.reviverId === playerId || session.targetId === playerId) {
        this.cancelRevivalSession(sessionKey);
      }
    }

    // Remove player from lobby
    lobby.players = lobby.players.filter(p => p.id !== playerId);
    
    // Remove from teams
    Object.keys(lobby.teams).forEach(teamKey => {
      const teamType = teamKey as TeamType;
      lobby.teams[teamType] = lobby.teams[teamType].filter(p => p.id !== playerId);
    });

    // Clean up combat state and position
    delete lobby.playerCombatStates[playerId];
    delete lobby.playerPositions[playerId];

    this.playerToLobby.delete(playerId);

    // If host left, assign new host or delete lobby
    if (lobby.hostId === playerId) {
      if (lobby.players.length > 0) {
        const newHost = lobby.players[0];
        newHost.isHost = true;
        lobby.hostId = newHost.id;
      } else {
        this.lobbies.delete(lobby.id);
        return null;
      }
    }

    return lobby;
  }

  private generatePlayerId(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  private createBossFromTickets(tickets: JiraTicket[]): Boss {
    const ticketCount = tickets.length;
    const phases = Math.min(ticketCount, 5); // Max 5 phases
    
    const bosses = [
      { name: 'Bug Hydra', sprite: 'Bug_Hydra_Boss_8b867e3e.png' },
      { name: 'Sprint Demon', sprite: 'Sprint_Demon_Boss_a43a8439.png' },
      { name: 'Deadline Dragon', sprite: 'Deadline_Dragon_Boss_4f628254.png' },
      { name: 'Technical Debt Golem', sprite: 'Technical_Debt_Golem_882e6943.png' },
      { name: 'Scope Creep Beast', sprite: 'Scope_Creep_Beast_3a9ec6b7.png' }
    ];
    
    const selectedBoss = bosses[Math.floor(Math.random() * bosses.length)];
    
    const boss: Boss = {
      id: Math.random().toString(36).substring(2, 15),
      name: selectedBoss.name,
      maxHealth: ticketCount * 100,
      currentHealth: ticketCount * 100,
      phase: 1,
      maxPhases: phases,
      sprite: selectedBoss.sprite,
      defeated: false
    };

    return boss;
  }

  // Combat system methods
  updatePlayerPosition(playerId: string, position: { x: number; y: number }): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    // Validate position bounds (0-100%)
    const x = Math.max(0, Math.min(100, position.x));
    const y = Math.max(0, Math.min(100, position.y));
    
    lobby.playerPositions[playerId] = { x, y };
    return lobby;
  }

  attackPlayer(attackerId: string, targetId: string, damage: number): { lobby: Lobby; targetHealth: number } | null {
    const lobby = this.getLobbyByPlayerId(attackerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const attacker = lobby.players.find(p => p.id === attackerId);
    const target = lobby.players.find(p => p.id === targetId);
    
    if (!attacker || !target) return null;
    
    // Validate attack rules: spectators can only attack dev/qa
    if (attacker.team === 'spectators' && target.team === 'spectators') return null;
    if (attacker.team !== 'spectators') return null; // Only spectators can attack players
    
    const targetCombatState = lobby.playerCombatStates[targetId];
    if (!targetCombatState || targetCombatState.isDowned) return null;
    
    // Check jumping invincibility
    if (targetCombatState.isJumping) {
      console.log(`🛡️ ${targetId} is jumping - invincible to damage!`);
      return null;
    }

    // Apply damage (clamp between 1-10)
    const actualDamage = Math.max(1, Math.min(10, damage));
    targetCombatState.hp = Math.max(0, targetCombatState.hp - actualDamage);
    targetCombatState.lastDamagedBy = attackerId;
    
    if (targetCombatState.hp <= 0) {
      targetCombatState.isDowned = true;
    }

    return { lobby, targetHealth: targetCombatState.hp };
  }

  findNearestTarget(spectatorId: string): string | null {
    const lobby = this.getLobbyByPlayerId(spectatorId);
    if (!lobby) return null;

    const spectatorPos = lobby.playerPositions[spectatorId];
    if (!spectatorPos) return null;

    let nearestTarget: string | null = null;
    let nearestDistance = Infinity;

    // Find nearest non-spectator, non-downed player
    lobby.players.forEach(player => {
      if (player.team === 'spectators' || player.id === spectatorId) return;
      
      const combatState = lobby.playerCombatStates[player.id];
      if (combatState?.isDowned) return;

      const playerPos = lobby.playerPositions[player.id];
      if (!playerPos) return;

      const distance = Math.sqrt(
        Math.pow(spectatorPos.x - playerPos.x, 2) + 
        Math.pow(spectatorPos.y - playerPos.y, 2)
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestTarget = player.id;
      }
    });

    return nearestTarget;
  }

  startRevive(reviverId: string, targetId: string): { lobby: Lobby; canRevive: boolean; sessionKey?: string } | null {
    const lobby = this.getLobbyByPlayerId(reviverId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const reviver = lobby.players.find(p => p.id === reviverId);
    const target = lobby.players.find(p => p.id === targetId);
    
    if (!reviver || !target) return null;
    
    const reviverState = lobby.playerCombatStates[reviverId];
    const targetState = lobby.playerCombatStates[targetId];
    
    if (!reviverState || !targetState) return null;
    if (reviverState.isDowned || !targetState.isDowned) return null;
    
    // Check distance (must be within 10% of screen)
    const reviverPos = lobby.playerPositions[reviverId];
    const targetPos = lobby.playerPositions[targetId];
    
    if (!reviverPos || !targetPos) return null;
    
    const distance = Math.sqrt(
      Math.pow(reviverPos.x - targetPos.x, 2) + 
      Math.pow(reviverPos.y - targetPos.y, 2)
    );
    
    if (distance > 10) return { lobby, canRevive: false };
    
    // Create revival session
    const sessionKey = `${reviverId}:${targetId}`;
    const now = Date.now();
    
    // Cancel any existing session for this reviver
    for (const [key, session] of this.revivalSessions.entries()) {
      if (session.reviverId === reviverId) {
        this.cancelRevivalSession(key);
      }
    }
    
    const revivalSession: RevivalSession = {
      reviverId,
      targetId,
      lobbyId: lobby.id,
      startedAt: now,
      lastTick: now,
      timeoutHandle: setTimeout(() => {
        this.cancelRevivalSession(sessionKey);
      }, 3500) // 3.5s timeout for safety
    };
    
    this.revivalSessions.set(sessionKey, revivalSession);
    
    // Start revival
    targetState.revivedBy = reviverId;
    targetState.reviveEndsAt = now + 3000; // 3 seconds
    
    return { lobby, canRevive: true, sessionKey };
  }

  cancelRevive(reviverId: string, targetId: string): Lobby | null {
    const sessionKey = `${reviverId}:${targetId}`;
    this.cancelRevivalSession(sessionKey);
    return this.getLobbyByPlayerId(reviverId);
  }

  tickRevive(reviverId: string, targetId: string): boolean {
    const sessionKey = `${reviverId}:${targetId}`;
    const session = this.revivalSessions.get(sessionKey);
    
    if (!session) return false;
    
    // Update last tick time for keep-alive
    session.lastTick = Date.now();
    
    // Validate distance and states
    const lobby = this.lobbies.get(session.lobbyId);
    if (!lobby) return false;
    
    const reviverPos = lobby.playerPositions[reviverId];
    const targetPos = lobby.playerPositions[targetId];
    const reviverState = lobby.playerCombatStates[reviverId];
    const targetState = lobby.playerCombatStates[targetId];
    
    if (!reviverPos || !targetPos || !reviverState || !targetState) {
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
    
    return true;
  }
}

export const gameState = new GameStateManager();
