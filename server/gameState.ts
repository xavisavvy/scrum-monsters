import { Lobby, Player, Boss, JiraTicket, GamePhase, TeamType, AvatarClass } from '../shared/gameEvents.js';

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
      completedTickets: 0
    };

    this.lobbies.set(lobbyId, lobby);
    this.playerToLobby.set(hostId, lobbyId);

    const inviteLink = `${process.env.BASE_URL || 'http://localhost:5000'}/join/${lobbyId}`;
    
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

  startBattle(playerId: string, tickets: JiraTicket[]): { lobby: Lobby; boss: Boss } | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby) return null;

    const requester = lobby.players.find(p => p.id === playerId);
    if (!requester?.isHost) return null;

    lobby.tickets = tickets;
    lobby.currentTicket = tickets[0];
    lobby.gamePhase = 'battle';
    lobby.completedTickets = 0;

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

  submitScore(playerId: string, score: number): Lobby | null {
    const lobby = this.getLobbyByPlayerId(playerId);
    if (!lobby || lobby.gamePhase !== 'battle') return null;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return null;

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

  revealScores(lobbyId: string): { lobby: Lobby; scores: Record<string, number>; consensus: boolean } | null {
    const lobby = this.lobbies.get(lobbyId);
    if (!lobby || lobby.gamePhase !== 'reveal') return null;

    const scores: Record<string, number> = {};
    const nonSpectatorPlayers = lobby.players.filter(p => p.team !== 'spectators');
    
    nonSpectatorPlayers.forEach(p => {
      if (p.currentScore !== undefined) {
        scores[p.id] = p.currentScore;
      }
    });

    // Check for consensus (all scores match)
    const scoreValues = Object.values(scores);
    const consensus = scoreValues.length > 0 && scoreValues.every(score => score === scoreValues[0]);

    if (consensus && lobby.boss) {
      // Defeat current boss phase
      lobby.boss.currentHealth = 0;
      lobby.completedTickets++;
      
      if (lobby.completedTickets >= lobby.tickets.length) {
        lobby.gamePhase = 'victory';
        lobby.boss.defeated = true;
      } else {
        lobby.gamePhase = 'next_level';
        // Progress to next phase/ticket
        lobby.currentTicket = lobby.tickets[lobby.completedTickets];
        lobby.boss = this.createBossFromTickets(lobby.tickets.slice(lobby.completedTickets));
      }
    } else {
      // Reset for another round
      lobby.gamePhase = 'battle';
      lobby.players.forEach(p => {
        p.hasSubmittedScore = false;
        p.currentScore = undefined;
      });
    }

    return { lobby, scores, consensus };
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
    
    const bossNames = [
      'Bug Hydra', 'Sprint Demon', 'Deadline Dragon', 'Technical Debt Golem', 'Scope Creep Beast'
    ];
    
    const boss: Boss = {
      id: Math.random().toString(36).substring(2, 15),
      name: bossNames[Math.floor(Math.random() * bossNames.length)],
      maxHealth: ticketCount * 100,
      currentHealth: ticketCount * 100,
      phase: 1,
      maxPhases: phases,
      sprite: 'boss_dragon', // Will be rendered as pixel art
      defeated: false
    };

    return boss;
  }
}

export const gameState = new GameStateManager();
