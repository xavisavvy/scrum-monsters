// Shared types and events for the multiplayer scrum poker game

export interface Player {
  id: string;
  name: string;
  avatar: AvatarClass;
  team: TeamType;
  isHost: boolean;
  currentScore?: number;
  hasSubmittedScore: boolean;
}

export interface TeamStats {
  totalStoryPoints: number;
  ticketsCompleted: number;
  averageEstimationTime: number;
  consensusRate: number;
  accuracyScore: number;
  participationRate: number;
  achievements: string[];
  currentStreak: number;
  bestStreak: number;
}

export interface TeamCompetition {
  developers: TeamStats;
  qa: TeamStats;
  currentRound: number;
  winnerHistory: TeamType[];
  seasonStart: string;
}

export interface Lobby {
  id: string;
  name: string;
  hostId: string;
  players: Player[];
  teams: Record<TeamType, Player[]>;
  currentTicket?: JiraTicket;
  tickets: JiraTicket[];
  gamePhase: GamePhase;
  boss?: Boss;
  completedTickets: CompletedTicket[];
  teamCompetition: TeamCompetition;
}

export interface JiraTicket {
  id: string;
  title: string;
  description: string;
  storyPoints?: number;
}

export interface CompletedTicket {
  id: string;
  title: string;
  description: string;
  storyPoints: number;
  completedAt: string; // ISO 8601 date string for JSON serialization
  teamBreakdown: {
    developers: { participated: boolean; consensusScore?: number };
    qa: { participated: boolean; consensusScore?: number };
  };
}

export interface Boss {
  id: string;
  name: string;
  maxHealth: number;
  currentHealth: number;
  phase: number;
  maxPhases: number;
  sprite: string;
  defeated: boolean;
}

export type GamePhase = 'lobby' | 'avatar_selection' | 'battle' | 'scoring' | 'reveal' | 'victory' | 'next_level';

export type TeamType = 'developers' | 'qa' | 'spectators';

export type AvatarClass = 'ranger' | 'rogue' | 'bard' | 'sorcerer' | 'wizard' | 'warrior' | 'paladin' | 'cleric';

// WebSocket Events
export interface ClientEvents {
  'create_lobby': { lobbyName: string; hostName: string };
  'join_lobby': { lobbyId: string; playerName: string };
  'select_avatar': { avatarClass: AvatarClass };
  'assign_team': { playerId: string; team: TeamType };
  'change_own_team': { team: TeamType };
  'start_battle': { tickets: JiraTicket[] };
  'submit_score': { score: number };
  'attack_boss': { damage: number };
  'proceed_next_level': {};
  'restart_game': {};
  'player_performance': { 
    playerId: string; 
    team: TeamType; 
    estimationTime: number; 
    score: number; 
    ticketId?: string; 
  };
  'abandon_quest': {};
  'force_reveal': {};
  'youtube_play': { videoId: string; url: string };
  'youtube_stop': {};
}

export interface TeamScores {
  developers: Record<string, number>;
  qa: Record<string, number>;
}

export interface TeamConsensus {
  developers: { hasConsensus: boolean; score?: number };
  qa: { hasConsensus: boolean; score?: number };
}

export interface ServerEvents {
  'lobby_created': { lobby: Lobby; inviteLink: string };
  'lobby_joined': { lobby: Lobby; player: Player };
  'lobby_updated': { lobby: Lobby };
  'avatar_selected': { playerId: string; avatar: AvatarClass };
  'battle_started': { lobby: Lobby; boss: Boss };
  'score_submitted': { playerId: string; team: TeamType };
  'scores_revealed': { teamScores: TeamScores; teamConsensus: TeamConsensus };
  'boss_attacked': { playerId: string; damage: number; bossHealth: number };
  'boss_defeated': { lobby: Lobby };
  'quest_abandoned': { lobby: Lobby };
  'game_error': { message: string };
  'player_disconnected': { playerId: string };
  'youtube_play_synced': { videoId: string; url: string };
  'youtube_stop_synced': {};
}

export const FIBONACCI_NUMBERS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

export interface CharacterStats {
  str: number; // Strength - Physical damage, HP
  dex: number; // Dexterity - Attack speed, critical chance
  con: number; // Constitution - HP, damage resistance
  wis: number; // Wisdom - Mana, spell resistance
  int: number; // Intelligence - Spell damage, mana
  cha: number; // Charisma - Team buffs, leadership bonuses
}

export const AVATAR_CLASSES: Record<AvatarClass, { 
  name: string; 
  description: string; 
  color: string; 
  stats: CharacterStats;
  specialties: string[];
}> = {
  ranger: { 
    name: 'Ranger', 
    description: 'Swift archer with keen eyes', 
    color: '#228B22',
    stats: { str: 12, dex: 16, con: 10, wis: 14, int: 12, cha: 14 },
    specialties: ['Ranged Combat', 'Tracking', 'Nature Magic']
  },
  rogue: { 
    name: 'Rogue', 
    description: 'Stealthy assassin', 
    color: '#2F4F4F',
    stats: { str: 10, dex: 18, con: 8, wis: 12, int: 14, cha: 16 },
    specialties: ['Stealth', 'Critical Strikes', 'Lockpicking']
  },
  bard: { 
    name: 'Bard', 
    description: 'Musical storyteller', 
    color: '#9370DB',
    stats: { str: 6, dex: 12, con: 10, wis: 12, int: 16, cha: 22 },
    specialties: ['Support Magic', 'Inspiration', 'Versatility']
  },
  sorcerer: { 
    name: 'Sorcerer', 
    description: 'Raw magic wielder', 
    color: '#FF4500',
    stats: { str: 6, dex: 10, con: 12, wis: 8, int: 22, cha: 20 },
    specialties: ['Elemental Magic', 'Raw Power', 'Metamagic']
  },
  wizard: { 
    name: 'Wizard', 
    description: 'Learned spellcaster', 
    color: '#4169E1',
    stats: { str: 6, dex: 8, con: 10, wis: 16, int: 22, cha: 16 },
    specialties: ['Arcane Knowledge', 'Spell Variety', 'Research']
  },
  warrior: { 
    name: 'Warrior', 
    description: 'Brave melee fighter', 
    color: '#B22222',
    stats: { str: 20, dex: 10, con: 16, wis: 8, int: 6, cha: 18 },
    specialties: ['Melee Combat', 'Defense', 'Leadership']
  },
  paladin: { 
    name: 'Paladin', 
    description: 'Holy knight', 
    color: '#FFD700',
    stats: { str: 16, dex: 8, con: 14, wis: 12, int: 10, cha: 18 },
    specialties: ['Divine Magic', 'Protection', 'Healing']
  },
  cleric: { 
    name: 'Cleric', 
    description: 'Divine healer', 
    color: '#F0F8FF',
    stats: { str: 10, dex: 6, con: 12, wis: 20, int: 12, cha: 18 },
    specialties: ['Healing Magic', 'Divine Power', 'Support']
  }
};

export const TEAM_NAMES: Record<TeamType, string> = {
  developers: 'Developers',
  qa: 'QA Engineers',
  spectators: 'Spectators'
};
