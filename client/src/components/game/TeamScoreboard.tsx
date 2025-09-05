import React from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { RetroCard } from '@/components/ui/retro-card';
import { TeamType } from '@/lib/gameTypes';

export function TeamScoreboard() {
  const { currentLobby } = useGameState();

  if (!currentLobby?.teamCompetition) return null;

  const { developers, qa } = currentLobby.teamCompetition;

  const getTeamIcon = (team: TeamType) => {
    return team === 'developers' ? '👨‍💻' : '🧪';
  };

  const getTeamColor = (team: TeamType) => {
    return team === 'developers' ? 'text-blue-400' : 'text-green-400';
  };

  const getTeamBgColor = (team: TeamType) => {
    return team === 'developers' ? 'bg-blue-900/30 border-blue-500/30' : 'bg-green-900/30 border-green-500/30';
  };

  const formatTime = (seconds: number) => {
    return `${seconds.toFixed(1)}s`;
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getLeadingTeam = () => {
    const devScore = developers.totalStoryPoints + developers.accuracyScore * 10;
    const qaScore = qa.totalStoryPoints + qa.accuracyScore * 10;
    
    if (devScore > qaScore) return 'developers';
    if (qaScore > devScore) return 'qa';
    return null;
  };

  const leadingTeam = getLeadingTeam();

  return (
    <div className="team-scoreboard">
      <RetroCard title="🏆 Team Competition">
      <div className="space-y-4">
        {/* Overall Leader */}
        {leadingTeam && (
          <div className="text-center">
            <div className={`text-lg font-bold ${getTeamColor(leadingTeam)}`}>
              {getTeamIcon(leadingTeam)} {leadingTeam === 'developers' ? 'Developers' : 'QA Engineers'} Leading!
            </div>
          </div>
        )}

        {/* Team Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Developers Stats */}
          <div className={`p-3 rounded-lg border ${getTeamBgColor('developers')}`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${getTeamColor('developers')}`}>
                {getTeamIcon('developers')} Developers
              </div>
              {developers.currentStreak > 0 && (
                <div className="text-xs text-yellow-400">
                  🔥 {developers.currentStreak} streak
                </div>
              )}
            </div>
            
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Story Points:</span>
                <span className="font-bold">{developers.totalStoryPoints}</span>
              </div>
              <div className="flex justify-between">
                <span>Tickets Done:</span>
                <span className="font-bold">{developers.ticketsCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Time:</span>
                <span className="font-bold">{formatTime(developers.averageEstimationTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>Consensus:</span>
                <span className="font-bold">{formatPercentage(developers.consensusRate)}</span>
              </div>
              <div className="flex justify-between">
                <span>Accuracy:</span>
                <span className="font-bold">{formatPercentage(developers.accuracyScore)}</span>
              </div>
              <div className="flex justify-between">
                <span>Participation:</span>
                <span className="font-bold">{formatPercentage(developers.participationRate)}</span>
              </div>
            </div>
          </div>

          {/* QA Stats */}
          <div className={`p-3 rounded-lg border ${getTeamBgColor('qa')}`}>
            <div className="text-center mb-3">
              <div className={`font-bold ${getTeamColor('qa')}`}>
                {getTeamIcon('qa')} QA Engineers
              </div>
              {qa.currentStreak > 0 && (
                <div className="text-xs text-yellow-400">
                  🔥 {qa.currentStreak} streak
                </div>
              )}
            </div>
            
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span>Story Points:</span>
                <span className="font-bold">{qa.totalStoryPoints}</span>
              </div>
              <div className="flex justify-between">
                <span>Tickets Done:</span>
                <span className="font-bold">{qa.ticketsCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Time:</span>
                <span className="font-bold">{formatTime(qa.averageEstimationTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>Consensus:</span>
                <span className="font-bold">{formatPercentage(qa.consensusRate)}</span>
              </div>
              <div className="flex justify-between">
                <span>Accuracy:</span>
                <span className="font-bold">{formatPercentage(qa.accuracyScore)}</span>
              </div>
              <div className="flex justify-between">
                <span>Participation:</span>
                <span className="font-bold">{formatPercentage(qa.participationRate)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Achievements */}
        <div className="space-y-2">
          <div className="text-sm font-bold text-center">Recent Achievements</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className={`font-bold ${getTeamColor('developers')} mb-1`}>Developers:</div>
              {developers.achievements.length > 0 ? (
                developers.achievements.slice(-2).map((achievement, index) => (
                  <div key={index} className="text-yellow-400">🏅 {achievement}</div>
                ))
              ) : (
                <div className="text-gray-500">No achievements yet</div>
              )}
            </div>
            <div>
              <div className={`font-bold ${getTeamColor('qa')} mb-1`}>QA:</div>
              {qa.achievements.length > 0 ? (
                qa.achievements.slice(-2).map((achievement, index) => (
                  <div key={index} className="text-yellow-400">🏅 {achievement}</div>
                ))
              ) : (
                <div className="text-gray-500">No achievements yet</div>
              )}
            </div>
          </div>
        </div>

        {/* Competition History */}
        <div className="text-center">
          <div className="text-sm font-bold mb-2">Season Progress</div>
          <div className="text-xs text-gray-400">
            Round {currentLobby.teamCompetition.currentRound}
          </div>
          {currentLobby.teamCompetition.winnerHistory.length > 0 && (
            <div className="flex justify-center gap-1 mt-2">
              {currentLobby.teamCompetition.winnerHistory.slice(-5).map((winner, index) => (
                <span key={index} className={getTeamColor(winner)}>
                  {getTeamIcon(winner)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </RetroCard>
    </div>
  );
}