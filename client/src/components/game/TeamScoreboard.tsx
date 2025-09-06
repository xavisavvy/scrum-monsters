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
    // Use enhanced competitive scoring algorithm
    const devScore = calculateCompetitiveScore(developers);
    const qaScore = calculateCompetitiveScore(qa);
    
    if (devScore > qaScore) return 'developers';
    if (qaScore > devScore) return 'qa';
    return null;
  };

  const calculateCompetitiveScore = (stats: any) => {
    const baseScore = stats.totalStoryPoints * 1.0;
    const accuracyBonus = stats.accuracyScore * 50;
    const consensusBonus = stats.consensusRate * 30;
    const participationBonus = stats.participationRate * 20;
    const streakBonus = stats.currentStreak * 15;
    const speedBonus = stats.averageEstimationTime > 0 ? 
      Math.max(0, (30 - stats.averageEstimationTime) * 2) : 0;
    const efficiencyBonus = stats.ticketsCompleted > 0 ? 
      (stats.totalStoryPoints / stats.ticketsCompleted) * 5 : 0;

    return baseScore + accuracyBonus + consensusBonus + participationBonus + 
           streakBonus + speedBonus + efficiencyBonus;
  };

  const getScoreDifference = () => {
    const devScore = calculateCompetitiveScore(developers);
    const qaScore = calculateCompetitiveScore(qa);
    return Math.abs(devScore - qaScore);
  };

  const leadingTeam = getLeadingTeam();

  return (
    <div className="team-scoreboard">
      <RetroCard title="🏆 Team Competition">
      <div className="space-y-4">
        {/* Team Competition Header */}
        <div className="text-center space-y-2">
          <div className="text-lg font-bold text-yellow-400">⚔️ TEAM BATTLE ⚔️</div>
          
          {/* Score Comparison Bar */}
          <div className="relative">
            <div className="flex items-center justify-between bg-gray-800 rounded-lg p-2">
              <div className={`font-bold ${getTeamColor('developers')}`}>
                {getTeamIcon('developers')} DEV
              </div>
              <div className="text-center text-sm">
                <div className="text-yellow-400">
                  {Math.round(calculateCompetitiveScore(developers))} - {Math.round(calculateCompetitiveScore(qa))}
                </div>
                {leadingTeam ? (
                  <div className={`text-xs ${getTeamColor(leadingTeam)}`}>
                    +{Math.round(getScoreDifference())} ahead
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">TIED</div>
                )}
              </div>
              <div className={`font-bold ${getTeamColor('qa')}`}>
                QA {getTeamIcon('qa')}
              </div>
            </div>
            
            {/* Leading Team Indicator */}
            {leadingTeam && (
              <div className={`absolute -top-1 ${leadingTeam === 'developers' ? 'left-2' : 'right-2'}`}>
                <div className={`text-xs ${getTeamColor(leadingTeam)} animate-pulse`}>
                  👑
                </div>
              </div>
            )}
          </div>
        </div>

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
                <span>💎 Points:</span>
                <span className="font-bold text-yellow-400">{developers.totalStoryPoints}</span>
              </div>
              <div className="flex justify-between">
                <span>🎫 Tickets:</span>
                <span className="font-bold">{developers.ticketsCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span>⚡ Speed:</span>
                <span className="font-bold">{formatTime(developers.averageEstimationTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>🤝 Consensus:</span>
                <span className="font-bold">{formatPercentage(developers.consensusRate)}</span>
              </div>
              <div className="flex justify-between">
                <span>🎯 Accuracy:</span>
                <span className="font-bold">{formatPercentage(developers.accuracyScore)}</span>
              </div>
              <div className="flex justify-between">
                <span>📊 Score:</span>
                <span className="font-bold text-blue-400">{Math.round(calculateCompetitiveScore(developers))}</span>
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
                <span>💎 Points:</span>
                <span className="font-bold text-yellow-400">{qa.totalStoryPoints}</span>
              </div>
              <div className="flex justify-between">
                <span>🎫 Tickets:</span>
                <span className="font-bold">{qa.ticketsCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span>⚡ Speed:</span>
                <span className="font-bold">{formatTime(qa.averageEstimationTime)}</span>
              </div>
              <div className="flex justify-between">
                <span>🤝 Consensus:</span>
                <span className="font-bold">{formatPercentage(qa.consensusRate)}</span>
              </div>
              <div className="flex justify-between">
                <span>🎯 Accuracy:</span>
                <span className="font-bold">{formatPercentage(qa.accuracyScore)}</span>
              </div>
              <div className="flex justify-between">
                <span>📊 Score:</span>
                <span className="font-bold text-green-400">{Math.round(calculateCompetitiveScore(qa))}</span>
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

        {/* Competition History & Season Stats */}
        <div className="text-center space-y-3">
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-sm font-bold mb-2 text-yellow-400">🏆 Season Progress</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-gray-400">Round</div>
                <div className="font-bold">{currentLobby.teamCompetition.currentRound}</div>
              </div>
              <div>
                <div className="text-gray-400">Wins</div>
                <div className="flex justify-center gap-1 text-xs">
                  <span className={getTeamColor('developers')}>
                    {currentLobby.teamCompetition.winnerHistory.filter(w => w === 'developers').length}
                  </span>
                  <span className="text-gray-500">-</span>
                  <span className={getTeamColor('qa')}>
                    {currentLobby.teamCompetition.winnerHistory.filter(w => w === 'qa').length}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-gray-400">Streak</div>
                <div className="font-bold">
                  {Math.max(developers.currentStreak, qa.currentStreak)}
                </div>
              </div>
            </div>
            
            {/* Recent Match History */}
            {currentLobby.teamCompetition.winnerHistory.length > 0 && (
              <div className="flex justify-center gap-1 mt-2">
                <span className="text-xs text-gray-400 mr-1">Recent:</span>
                {currentLobby.teamCompetition.winnerHistory.slice(-8).map((winner, index) => (
                  <span key={index} className={`${getTeamColor(winner)} text-sm`}>
                    {getTeamIcon(winner)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </RetroCard>
    </div>
  );
}