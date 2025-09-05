import { Lobby, Player, Boss, JiraTicket, CompletedTicket, GamePhase, TeamType, AvatarClass, TeamScores, TeamConsensus } from '../shared/gameEvents.js';

class GameStateManager {
  private lobbies: Map<string, Lobby> = new Map();
  private playerToLobby: Map<string, string> = new Map();

  generateLobbyId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
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
      completedTickets: []
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

    // Check if both teams have consensus and agree on the same score
    const bothTeamsHaveConsensus = devConsensus && qaConsensus;
    const teamsAgree = bothTeamsHaveConsensus && devScoreValues[0] === qaScoreValues[0];

    if (teamsAgree && lobby.boss && lobby.currentTicket) {
      // Defeat current boss phase
      lobby.boss.currentHealth = 0;
      
      // Store completed ticket with agreed story points
      const storyPoints = devScoreValues[0]; // Both teams agree on this score
      const completedTicket: CompletedTicket = {
        id: lobby.currentTicket.id,
        title: lobby.currentTicket.title,
        description: lobby.currentTicket.description,
        storyPoints,
        completedAt: new Date().toISOString()
      };
      lobby.completedTickets.push(completedTicket);
      
      if (lobby.completedTickets.length >= lobby.tickets.length) {
        lobby.gamePhase = 'victory';
        lobby.boss.defeated = true;
      } else {
        lobby.gamePhase = 'next_level';
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

  removePlayer(playerId: string): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    // Remove player from lobby
    lobby.players = lobby.players.filter(p => p.id !== playerId);
    
    // Remove from teams
    Object.keys(lobby.teams).forEach(teamKey => {
      const teamType = teamKey as TeamType;
      lobby.teams[teamType] = lobby.teams[teamType].filter(p => p.id !== playerId);
    });

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
}

export const gameState = new GameStateManager();
