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
  'abandon_quest': {};
}

export interface ServerEvents {
  'lobby_created': { lobby: Lobby; inviteLink: string };
  'lobby_joined': { lobby: Lobby; player: Player };
  'lobby_updated': { lobby: Lobby };
  'avatar_selected': { playerId: string; avatar: AvatarClass };
  'battle_started': { lobby: Lobby; boss: Boss };
  'score_submitted': { playerId: string };
  'scores_revealed': { scores: Record<string, number>; consensus: boolean };
  'boss_attacked': { playerId: string; damage: number; bossHealth: number };
  'boss_defeated': { lobby: Lobby };
  'quest_abandoned': { lobby: Lobby };
  'game_error': { message: string };
  'player_disconnected': { playerId: string };
}

export const FIBONACCI_NUMBERS = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

export const AVATAR_CLASSES: Record<AvatarClass, { name: string; description: string; color: string }> = {
  ranger: { name: 'Ranger', description: 'Swift archer with keen eyes', color: '#228B22' },
  rogue: { name: 'Rogue', description: 'Stealthy assassin', color: '#2F4F4F' },
  bard: { name: 'Bard', description: 'Musical storyteller', color: '#9370DB' },
  sorcerer: { name: 'Sorcerer', description: 'Raw magic wielder', color: '#FF4500' },
  wizard: { name: 'Wizard', description: 'Learned spellcaster', color: '#4169E1' },
  warrior: { name: 'Warrior', description: 'Brave melee fighter', color: '#B22222' },
  paladin: { name: 'Paladin', description: 'Holy knight', color: '#FFD700' },
  cleric: { name: 'Cleric', description: 'Divine healer', color: '#F0F8FF' }
};

export const TEAM_NAMES: Record<TeamType, string> = {
  developers: 'Developers',
  qa: 'QA Engineers',
  spectators: 'Spectators'
};
