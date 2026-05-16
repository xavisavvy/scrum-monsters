import { useEffect, useState } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';

interface PerformanceMetrics {
  estimationStartTime: number | null;
  teamSubmissions: Record<string, { time: number; score: number | '?' }>;
  consensusTime: number | null;
}

export function TeamPerformanceTracker() {
  const { currentLobby, currentPlayer } = useGameState();
  const { emit } = useWebSocket();
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    estimationStartTime: null,
    teamSubmissions: {},
    consensusTime: null
  });

  // Track estimation start time
  useEffect(() => {
    if (currentLobby?.gamePhase === 'battle' && !metrics.estimationStartTime) {
      setMetrics(prev => ({
        ...prev,
        estimationStartTime: Date.now()
      }));
    }
  }, [currentLobby?.gamePhase, metrics.estimationStartTime]);

  // Track score submissions
  useEffect(() => {
    if (currentPlayer?.hasSubmittedScore && currentPlayer.currentScore !== undefined && currentPlayer.currentScore !== '?') {
      const submissionTime = Date.now();
      const estimationTime = metrics.estimationStartTime
        ? submissionTime - metrics.estimationStartTime
        : 0;

      setMetrics(prev => ({
        ...prev,
        teamSubmissions: {
          ...prev.teamSubmissions,
          [currentPlayer.id]: {
            time: estimationTime,
            score: currentPlayer.currentScore as number
          }
        }
      }));

      // Emit performance data to server
      emit('player_performance', {
        playerId: currentPlayer.id,
        team: currentPlayer.team,
        estimationTime,
        score: currentPlayer.currentScore as number,
        ticketId: currentLobby?.currentTicket?.id
      });
    }
  }, [currentPlayer?.hasSubmittedScore, currentPlayer?.currentScore, metrics.estimationStartTime, emit, currentPlayer?.id, currentPlayer?.team, currentLobby?.currentTicket?.id]);

  // Track consensus time
  useEffect(() => {
    if (currentLobby?.gamePhase === 'reveal' && !metrics.consensusTime) {
      setMetrics(prev => ({
        ...prev,
        consensusTime: Date.now()
      }));
    }
  }, [currentLobby?.gamePhase, metrics.consensusTime]);

  // Reset metrics when moving to next ticket
  useEffect(() => {
    if (currentLobby?.gamePhase === 'lobby' || currentLobby?.gamePhase === 'next_level') {
      setMetrics({
        estimationStartTime: null,
        teamSubmissions: {},
        consensusTime: null
      });
    }
  }, [currentLobby?.gamePhase]);

  // Hide Live Performance section as requested
  return null;
}