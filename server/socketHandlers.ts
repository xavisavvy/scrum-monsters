// Add this to the existing socketHandlers.ts or create if it doesn't exist
// This handles the new player_performance event

import { Socket } from 'socket.io';
import type { ClientEvents, ServerEvents } from '../shared/gameEvents.js';

export function setupTeamCompetitionHandlers(
  socket: Socket<ClientEvents, ServerEvents>,
  gameStateManager: any // Replace with proper type
) {
  socket.on('player_performance', (data) => {
    try {
      console.log(`Performance data received from ${data.playerId}:`, data);
      
      // Store performance data for later team stats calculation
      gameStateManager.trackPlayerPerformance(data.playerId, {
        estimationTime: data.estimationTime,
        score: data.score,
        team: data.team,
        ticketId: data.ticketId
      });
      
    } catch (error) {
      console.error('Error handling player_performance:', error);
      socket.emit('game_error', { message: 'Failed to track performance data' });
    }
  });
}