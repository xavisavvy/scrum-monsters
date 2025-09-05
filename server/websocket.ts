import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { ClientEvents, ServerEvents } from '../shared/gameEvents.js';
import { gameState } from './gameState.js';

export function setupWebSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer<ClientEvents, ServerEvents>(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
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

    socket.on('start_battle', ({ tickets }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const result = gameState.startBattle(playerId, tickets);
      if (result) {
        const { lobby, boss } = result;
        io.to(lobby.id).emit('battle_started', { lobby, boss });
      }
    });

    socket.on('submit_score', ({ score }) => {
      const playerId = socket.data.playerId;
      if (!playerId) return;

      const lobby = gameState.submitScore(playerId, score);
      if (lobby) {
        socket.to(lobby.id).emit('score_submitted', { playerId });
        
        // Check if all scores submitted and reveal
        if (lobby.gamePhase === 'reveal') {
          const result = gameState.revealScores(lobby.id);
          if (result) {
            const { lobby: updatedLobby, scores, consensus } = result;
            io.to(lobby.id).emit('scores_revealed', { scores, consensus });
            io.to(lobby.id).emit('lobby_updated', { lobby: updatedLobby });
            
            if (consensus && updatedLobby.boss?.defeated) {
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
        const { lobby, bossHealth } = result;
        io.to(lobby.id).emit('boss_attacked', { playerId, damage, bossHealth });
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
