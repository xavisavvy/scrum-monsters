// Add this to the existing socketHandlers.ts or create if it doesn't exist
// This handles the new player_performance event

import { Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/gameEvents.js';
import { socketLogger } from './logger.js';

interface PerformanceTrackingTarget {
  trackPlayerPerformance(
    playerId: string,
    data: { estimationTime: number; score: number; team: string; ticketId?: string }
  ): void;
}

export function setupTeamCompetitionHandlers(
  socket: Socket<ClientToServerEvents, ServerToClientEvents>,
  gameStateManager: PerformanceTrackingTarget
) {
  socket.on('player_performance', (data: { playerId: string; team: string; estimationTime: number; score: number; ticketId?: string }) => {
    try {
      socketLogger.debug({ playerId: data.playerId, data }, 'Performance data received');
      
      // Store performance data for later team stats calculation
      gameStateManager.trackPlayerPerformance(data.playerId, {
        estimationTime: data.estimationTime,
        score: data.score,
        team: data.team,
        ticketId: data.ticketId
      });
      
    } catch (error) {
      socketLogger.error({ err: error }, 'Error handling player_performance');
      socket.emit('game_error', { message: 'Failed to track performance data' });
    }
  });
}