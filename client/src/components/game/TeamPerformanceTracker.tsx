import React, { useEffect, useState } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { TeamType } from '@/lib/gameTypes';

interface PerformanceMetrics {
  estimationStartTime: number | null;
  teamSubmissions: Record<string, { time: number; score: number }>;
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
    if (currentPlayer?.hasSubmittedScore && currentPlayer.currentScore !== undefined) {
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
            score: currentPlayer.currentScore!
          }
        }
      }));

      // Emit performance data to server
      emit('player_performance', {
        playerId: currentPlayer.id,
        team: currentPlayer.team,
        estimationTime,
        score: currentPlayer.currentScore,
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

  // Calculate real-time team performance
  const getTeamPerformance = (team: TeamType) => {
    if (!currentLobby) return null;

    const teamPlayers = currentLobby.teams[team] || [];
    const teamSubmissions = Object.entries(metrics.teamSubmissions)
      .filter(([playerId]) => teamPlayers.some(p => p.id === playerId))
      .map(([, data]) => data);

    if (teamSubmissions.length === 0) return null;

    const avgTime = teamSubmissions.reduce((sum, sub) => sum + sub.time, 0) / teamSubmissions.length;
    const submissionRate = teamSubmissions.length / Math.max(teamPlayers.length, 1);
    
    // Check if team has consensus
    const scores = teamSubmissions.map(sub => sub.score);
    const hasConsensus = scores.length > 0 && scores.every(score => score === scores[0]);

    return {
      averageTime: avgTime,
      submissionRate,
      hasConsensus,
      consensusScore: hasConsensus ? scores[0] : null,
      submittedCount: teamSubmissions.length,
      totalMembers: teamPlayers.length
    };
  };

  if (!currentLobby || currentLobby.gamePhase !== 'battle') {
    return null;
  }

  const devPerformance = getTeamPerformance('developers');
  const qaPerformance = getTeamPerformance('qa');

  return (
    <div className="fixed top-4 left-4 z-30 pointer-events-none">
      <div className="bg-black bg-opacity-70 rounded-lg p-3 text-white text-sm">
        <div className="font-bold mb-2 text-center">⚡ Live Performance</div>
        
        {/* Developers */}
        {devPerformance && (
          <div className="mb-2">
            <div className="text-blue-400 font-bold">👨‍💻 Developers</div>
            <div className="text-xs space-y-1">
              <div>Submissions: {devPerformance.submittedCount}/{devPerformance.totalMembers}</div>
              <div>Avg Time: {(devPerformance.averageTime / 1000).toFixed(1)}s</div>
              <div className={devPerformance.hasConsensus ? 'text-green-400' : 'text-yellow-400'}>
                {devPerformance.hasConsensus ? '✅ Consensus' : '⏳ Estimating...'}
              </div>
            </div>
          </div>
        )}

        {/* QA */}
        {qaPerformance && (
          <div>
            <div className="text-green-400 font-bold">🧪 QA Engineers</div>
            <div className="text-xs space-y-1">
              <div>Submissions: {qaPerformance.submittedCount}/{qaPerformance.totalMembers}</div>
              <div>Avg Time: {(qaPerformance.averageTime / 1000).toFixed(1)}s</div>
              <div className={qaPerformance.hasConsensus ? 'text-green-400' : 'text-yellow-400'}>
                {qaPerformance.hasConsensus ? '✅ Consensus' : '⏳ Testing...'}
              </div>
            </div>
          </div>
        )}

        {/* Competition indicator */}
        {devPerformance && qaPerformance && (
          <div className="mt-2 pt-2 border-t border-gray-600">
            <div className="text-xs text-center">
              {devPerformance.averageTime < qaPerformance.averageTime ? (
                <span className="text-blue-400">👨‍💻 Faster Estimation</span>
              ) : qaPerformance.averageTime < devPerformance.averageTime ? (
                <span className="text-green-400">🧪 Faster Estimation</span>
              ) : (
                <span className="text-yellow-400">⚡ Tied Speed</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}