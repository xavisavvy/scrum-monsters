import { Lobby, Player, Boss, JiraTicket, CompletedTicket, GamePhase, TeamType, AvatarClass, TeamScores, TeamConsensus, TeamCompetition, TeamStats, TimerSettings, JiraSettings, TimerState } from '../shared/gameEvents.js';
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
  private playerPerformanceMap: Map<string, Map<string, { estimationTime: number; score: number | '?'; team: TeamType }>> = new Map();
  private timerIntervals = new Map<string, NodeJS.Timeout>();

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

  createLobby(hostName: string, lobbyName: string): Lobby {
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
      }
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

    // Initialize game state
    lobby.gamePhase = 'battle';
    lobby.currentTicket = tickets[0];
    lobby.boss = this.createBossFromTickets(tickets);

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
      lobby.currentTicket = lobby.tickets[nextTicketIndex];
      lobby.boss = this.createBossFromTickets(lobby.tickets.slice(nextTicketIndex));
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

  forceRevealScores(playerId: string): { lobby: Lobby; teamScores: TeamScores; teamConsensus: TeamConsensus } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player?.isHost) return null;

    // Force reveal by changing phase to reveal
    lobby.gamePhase = 'reveal';
    return this.revealScores(lobby.id);
  }

  attackPlayer(attackerId: string, targetId: string, damage: number): { lobby: Lobby; targetHealth: number } | null {
    const lobby = this.getLobbyByPlayerId(attackerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const attacker = lobby.players.find(p => p.id === attackerId);
    const target = lobby.players.find(p => p.id === targetId);
    if (!attacker || !target) return null;

    // Only spectators can attack players (boss role)
    if (attacker.team !== 'spectators') return null;

    const targetState = lobby.playerCombatStates[targetId];
    if (!targetState || targetState.isDowned) return null;

    targetState.hp = Math.max(0, targetState.hp - damage);
    targetState.lastDamagedBy = attackerId;

    if (targetState.hp <= 0) {
      targetState.isDowned = true;
    }

    return { lobby, targetHealth: targetState.hp };
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

  bossDamagePlayer(playerId: string, damage: number): { lobby: Lobby; targetHealth: number } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const targetState = lobby.playerCombatStates[playerId];
    if (!targetState || targetState.isDowned) return null;

    targetState.hp = Math.max(0, targetState.hp - damage);
    targetState.lastDamagedBy = 'boss';

    if (targetState.hp <= 0) {
      targetState.isDowned = true;
    }

    return { lobby, targetHealth: targetState.hp };
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
    lobby.boss = this.createBossFromTickets(lobby.tickets);

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
          lobby.currentTicket = lobby.tickets[nextTicketIndex];
          lobby.boss = this.createBossFromTickets(lobby.tickets.slice(nextTicketIndex));
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

  private createBossFromTickets(tickets: JiraTicket[]): Boss {
    const totalComplexity = tickets.length * 100;
    
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
    
    return {
      id: Math.random().toString(36).substring(2, 15),
      name: `${selectedBoss.name} of ${tickets.length} Challenge${tickets.length > 1 ? 's' : ''}`,
      maxHealth: totalComplexity,
      currentHealth: totalComplexity,
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

    // Check if all non-spectator players have submitted scores
    const nonSpectatorPlayers = lobby.players.filter(p => p.team !== 'spectators');
    const submittedPlayers = nonSpectatorPlayers.filter(p => p.hasSubmittedScore);

    if (submittedPlayers.length === nonSpectatorPlayers.length && nonSpectatorPlayers.length > 0) {
      lobby.gamePhase = 'reveal';
    }

    return lobby;
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
    }

    return { lobby, teamScores, teamConsensus };
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

  attackBoss(playerId: string, damage: number): { lobby: Lobby; bossHealth: number; ringAttack?: any } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || !lobby.boss || lobby.gamePhase !== 'battle') return null;

    // Damage the boss
    lobby.boss.currentHealth = Math.max(0, lobby.boss.currentHealth - damage);

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
      ringAttack
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