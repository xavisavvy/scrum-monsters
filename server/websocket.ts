import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { ClientToServerEvents, ServerToClientEvents } from '../shared/gameEvents.js';
import { gameState } from './gameState.js';

type InterServerEvents = {};
type SocketData = { playerId?: string; lobbyId?: string };

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Set up revival completion watchdog
  setInterval(() => {
    const completedRevivals = (gameState as any).processRevivalSessions();
    for (const revival of completedRevivals) {
      io.to(revival.lobbyId).emit('revive_complete', { 
        targetId: revival.targetId, 
        reviverId: revival.reviverId 
      });
    }
  }, 100);

  io.on('connection', (socket: Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>) => {
    console.log(`Player connected: ${socket.id}`);

    socket.on('create_lobby', ({ lobbyName, hostName }) => {
      try {
        const { lobby, inviteLink } = gameState.createLobby(hostName, lobbyName);
        
        // Store player-socket mapping
        socket.data.playerId = lobby.hostId;
        socket.data.lobbyId = lobby.id;
        
        // Join socket room
        socket.join(lobby.id);
        
        socket.emit('lobby_created', { lobby, inviteLink });
        console.log(`Lobby created: ${lobby.id} by ${hostName}`);
      } catch (error) {
        socket.emit('game_error', { message: 'Failed to create lobby' });
      }
    });

    socket.on('join_lobby', ({ lobbyId, playerName }) => {
      try {
        const result = gameState.joinLobby(lobbyId, playerName);
        if (!result) {
          socket.emit('game_error', { message: 'Lobby not found' });
          return;
        }

        const { lobby, player } = result;
        
        // Store player-socket mapping
        socket.data.playerId = player.id;
        socket.data.lobbyId = lobby.id;
        
        // Join socket room
        socket.join(lobby.id);
        
        socket.emit('lobby_joined', { lobby, player });
        socket.to(lobby.id).emit('lobby_updated', { lobby });
        
        console.log(`Player ${playerName} joined lobby ${lobbyId}`);
      } catch (error) {
        socket.emit('game_error', { message: error instanceof Error ? error.message : 'Failed to join lobby' });
      }
    });

    socket.on('select_avatar', ({ avatarClass }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.selectAvatar(playerId, avatarClass);
      if (lobby) {
        io.to(lobby.id).emit('avatar_selected', { playerId, avatar: avatarClass });
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('assign_team', ({ playerId: targetPlayerId, team }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.assignTeam(playerId, targetPlayerId, team);
      if (lobby) {
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('change_own_team', ({ team }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.changeOwnTeam(playerId, team);
      if (lobby) {
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('start_battle', ({ tickets }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.startBattle(playerId, tickets);
      if (result) {
        const { lobby, boss } = result;
        
        // Update all players with the new lobby state including tickets
        io.to(lobby.id).emit('lobby_updated', { lobby });
        
        // Then start the battle (synchronous - relies on socket.io event ordering)
        io.to(lobby.id).emit('battle_started', { lobby, boss });
      }
    });

    socket.on('submit_score', ({ score }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.submitScore(playerId, score);
      if (lobby) {
        const player = lobby.players.find(p => p.id === playerId);
        if (player) {
          socket.to(lobby.id).emit('score_submitted', { playerId, team: player.team });
        }
        
        // Emit lobby_updated after each score submission for real-time UI updates
        io.to(lobby.id).emit('lobby_updated', { lobby });
        
        // Check if all scores submitted and reveal
        if (lobby.gamePhase === 'reveal') {
          const result = gameState.revealScores(lobby.id);
          if (result) {
            const { lobby: updatedLobby, teamScores, teamConsensus } = result;
            io.to(lobby.id).emit('scores_revealed', { teamScores, teamConsensus });
            io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
            
            // Check if teams agreed using same logic as gameState
            const devTeamExists = updatedLobby.teams.developers.length > 0;
            const qaTeamExists = updatedLobby.teams.qa.length > 0;
            
            let teamsAgree = false;
            if (devTeamExists && qaTeamExists) {
              teamsAgree = teamConsensus.developers.hasConsensus && 
                          teamConsensus.qa.hasConsensus &&
                          teamConsensus.developers.score === teamConsensus.qa.score;
            } else if (devTeamExists && !qaTeamExists) {
              teamsAgree = teamConsensus.developers.hasConsensus;
            } else if (!devTeamExists && qaTeamExists) {
              teamsAgree = teamConsensus.qa.hasConsensus;
            }
            
            if (teamsAgree && updatedLobby.boss?.defeated) {
              io.to(lobby.id).emit('boss_defeated', { lobby: updatedLobby });
            }
          }
        }
      }
    });

    socket.on('attack_boss', ({ damage }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.attackBoss(playerId, damage);
      if (result) {
        const { lobby, bossHealth, ringAttack } = result;
        io.to(lobby.id).emit('boss_attacked', { playerId, damage, bossHealth });
        
        // If boss performs ring attack, broadcast it
        if (ringAttack) {
          io.to(lobby.id).emit('boss_ring_attack', ringAttack);
        }
        
        // Send updated lobby state so clients get the new boss health
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });
    
    // Boss damage to player
    socket.on('boss_damage_player', ({ playerId, damage }: { playerId: string; damage: number }) => {
      const attackerId = socket.data.playerId;
      if (!attackerId) return;

      const result = gameState.bossDamagePlayer(playerId, damage);
      if (result) {
        const { lobby, targetHealth } = result;
        
        // Broadcast boss damage to room
        io.to(lobby.id).emit('player_attacked', { 
          attackerId: 'boss', 
          targetId: playerId, 
          damage, 
          targetHealth 
        });
        
        // Update lobby state
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('proceed_next_level', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.proceedNextLevel(playerId);
      if (lobby) {
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('abandon_quest', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.abandonQuest(playerId);
      if (lobby) {
        io.to(lobby.id).emit('quest_abandoned', { lobby });
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('force_reveal', () => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.forceRevealScores(playerId);
      if (result) {
        const { lobby: updatedLobby, teamScores, teamConsensus } = result;
        io.to(updatedLobby.id).emit('scores_revealed', { teamScores, teamConsensus });
        io.to(updatedLobby.id).emit('lobby_updated', { lobby: updatedLobby });
        
        // Check if teams agreed using same logic as gameState
        const devTeamExists = updatedLobby.teams.developers.length > 0;
        const qaTeamExists = updatedLobby.teams.qa.length > 0;
        
        let teamsAgree = false;
        if (devTeamExists && qaTeamExists) {
          teamsAgree = teamConsensus.developers.hasConsensus && 
                      teamConsensus.qa.hasConsensus &&
                      teamConsensus.developers.score === teamConsensus.qa.score;
        } else if (devTeamExists && !qaTeamExists) {
          teamsAgree = teamConsensus.developers.hasConsensus;
        } else if (!devTeamExists && qaTeamExists) {
          teamsAgree = teamConsensus.qa.hasConsensus;
        }
        
        if (teamsAgree && updatedLobby.boss?.defeated) {
          io.to(updatedLobby.id).emit('boss_defeated', { lobby: updatedLobby });
        }
      }
    });

    socket.on('youtube_play', ({ videoId, url }) => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (!playerId || !lobbyId) return;

      // Only allow host to control YouTube music
      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.hostId !== playerId) {
        socket.emit('game_error', { message: 'Only the host can control YouTube music' });
        return;
      }

      // Broadcast to all players in the lobby
      io.to(lobbyId).emit('youtube_play_synced', { videoId, url });
      console.log(`Host ${playerId} started YouTube music: ${url}`);
    });

    socket.on('youtube_stop', () => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (!playerId || !lobbyId) return;

      // Only allow host to control YouTube music
      const lobby = gameState.getLobby(lobbyId);
      if (!lobby || lobby.hostId !== playerId) {
        socket.emit('game_error', { message: 'Only the host can control YouTube music' });
        return;
      }

      // Broadcast to all players in the lobby
      io.to(lobbyId).emit('youtube_stop_synced');
      console.log(`Host ${playerId} stopped YouTube music`);
    });

    // Position sync for combat
    socket.on('player_pos', ({ x, y }: { x: number; y: number }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.updatePlayerPosition(playerId, { x, y });
      if (lobby) {
        // Broadcast position updates to room (throttled)
        socket.to(lobby.id).emit('players_pos', { positions: lobby.playerPositions });
      }
    });

    // Player vs player combat
    socket.on('attack_player', ({ targetId, damage }: { targetId: string; damage: number }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // For spectators, override target with nearest player
      const lobby = gameState.getLobbyByPlayerId(playerId);
      if (!lobby) return;

      const attacker = lobby.players.find(p => p.id === playerId);
      if (!attacker || attacker.team !== 'spectators') return;

      const actualTargetId = gameState.findNearestTarget(playerId) || targetId;
      const result = gameState.attackPlayer(playerId, actualTargetId, damage);
      
      if (result) {
        const { lobby: updatedLobby, targetHealth } = result;
        io.to(lobby.id).emit('player_attacked', { 
          attackerId: playerId, 
          targetId: actualTargetId, 
          damage, 
          targetHealth 
        });
        io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
      }
    });

    // Revival system
    socket.on('revive_start', ({ targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.startRevive(playerId, targetId);
      if (result) {
        const { lobby, canRevive } = result;
        if (canRevive) {
          io.to(lobby.id).emit('revive_progress', { targetId, reviverId: playerId, progress: 0 });
        }
      }
    });

    socket.on('revive_cancel', ({ targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.cancelRevive(playerId, targetId);
      if (lobby) {
        io.to(lobby.id).emit('revive_cancelled', { targetId, reviverId: playerId });
      }
    });

    socket.on('revive_tick', ({ targetId }: { targetId: string }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      // Update keep-alive and validate revival conditions
      const isValid = gameState.tickRevive(playerId, targetId);
      if (!isValid) {
        // Revival was cancelled due to distance or state changes
        const lobby = gameState.getLobbyByPlayerId(playerId);
        if (lobby) {
          io.to(lobby.id).emit('revive_cancelled', { targetId, reviverId: playerId });
        }
      }
    });

    // Jumping state sync
    socket.on('player_jump', ({ isJumping }: { isJumping: boolean }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.setPlayerJumping(playerId, isJumping);
      if (lobby) {
        // Broadcast to all players in the lobby
        io.to(lobby.id).emit('lobby_updated', { lobby });
      }
    });

    socket.on('disconnect', () => {
      const playerId = socket.data.playerId;
      const lobbyId = socket.data.lobbyId;
      
      if (playerId) {
        const lobby = gameState.removePlayer(playerId);
        if (lobby && lobbyId) {
          io.to(lobbyId).emit('player_disconnected', { playerId });
          io.to(lobbyId).emit('lobby_updated', { lobby });
        }
      }
      
      console.log(`Player disconnected: ${socket.id}`);
    });
  });

  return io;
}
