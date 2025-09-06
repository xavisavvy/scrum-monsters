import { Lobby, TeamType, TeamStats, TeamCompetition } from '../shared/gameEvents.js';

export class TeamStatsManager {
  
  static updateTeamCompetitionStats(lobby: Lobby, performanceData: {
    team: TeamType;
    estimationTime: number;
    accuracy: number;
    participationRate: number;
    consensusAchieved: boolean;
  }[]): void {
    if (!lobby.teamCompetition) return;

    // Update each team's stats
    performanceData.forEach(data => {
      const teamStats = data.team === 'spectators' ? null : lobby.teamCompetition[data.team as 'developers' | 'qa'];
      if (!teamStats) return;

      // Update running averages and totals
      teamStats.averageEstimationTime = this.updateAverage(
        teamStats.averageEstimationTime,
        data.estimationTime,
        teamStats.ticketsCompleted
      );

      teamStats.accuracyScore = this.updateAverage(
        teamStats.accuracyScore,
        data.accuracy,
        teamStats.ticketsCompleted
      );

      teamStats.participationRate = this.updateAverage(
        teamStats.participationRate,
        data.participationRate,
        teamStats.ticketsCompleted
      );

      // Update consensus rate
      const newConsensusCount = teamStats.consensusRate * teamStats.ticketsCompleted + (data.consensusAchieved ? 1 : 0);
      teamStats.consensusRate = newConsensusCount / (teamStats.ticketsCompleted + 1);

      // Add story points if current ticket exists
      if (lobby.currentTicket?.storyPoints) {
        teamStats.totalStoryPoints += lobby.currentTicket.storyPoints;
      }

      // Increment tickets completed
      teamStats.ticketsCompleted++;

      // Update streak
      if (data.consensusAchieved && data.accuracy > 0.8) {
        teamStats.currentStreak++;
        teamStats.bestStreak = Math.max(teamStats.bestStreak, teamStats.currentStreak);
      } else {
        teamStats.currentStreak = 0;
      }

      // Check for achievements
      this.checkAndAwardAchievements(teamStats, data);
    });

    // Update competition round
    lobby.teamCompetition.currentRound++;

    // Determine round winner
    const devStats = lobby.teamCompetition.developers;
    const qaStats = lobby.teamCompetition.qa;
    
    const devScore = this.calculateTeamScore(devStats);
    const qaScore = this.calculateTeamScore(qaStats);

    if (devScore > qaScore) {
      lobby.teamCompetition.winnerHistory.push('developers');
    } else if (qaScore > devScore) {
      lobby.teamCompetition.winnerHistory.push('qa');
    }
  }

  private static updateAverage(currentAvg: number, newValue: number, count: number): number {
    return (currentAvg * count + newValue) / (count + 1);
  }

  private static calculateTeamScore(stats: TeamStats): number {
    // Enhanced competitive scoring algorithm
    const baseScore = stats.totalStoryPoints * 1.0;
    const accuracyBonus = stats.accuracyScore * 50;
    const consensusBonus = stats.consensusRate * 30;
    const participationBonus = stats.participationRate * 20;
    const streakBonus = stats.currentStreak * 15; // Increased streak value
    const speedBonus = stats.averageEstimationTime > 0 ? 
      Math.max(0, (30 - stats.averageEstimationTime) * 2) : 0; // Bonus for faster estimation
    const efficiencyBonus = stats.ticketsCompleted > 0 ? 
      (stats.totalStoryPoints / stats.ticketsCompleted) * 5 : 0; // Points per ticket efficiency

    return baseScore + accuracyBonus + consensusBonus + participationBonus + 
           streakBonus + speedBonus + efficiencyBonus;
  }

  private static checkAndAwardAchievements(teamStats: TeamStats, data: any): void {
    const achievements = [];

    // Speed achievements (convert ms to seconds for comparison)
    const estimationTimeSeconds = data.estimationTime / 1000;
    if (estimationTimeSeconds < 5) { // Less than 5 seconds
      achievements.push('⚡ Speed Demon');
    } else if (estimationTimeSeconds < 10) { // Less than 10 seconds
      achievements.push('💨 Lightning Fast');
    }

    // Accuracy achievements
    if (data.accuracy >= 0.98) {
      achievements.push('🎯 Perfect Shot');
    } else if (data.accuracy >= 0.95) {
      achievements.push('🔍 Precision Master');
    } else if (data.accuracy >= 0.90) {
      achievements.push('🎪 Sharp Shooter');
    }

    // Streak achievements (more competitive tiers)
    if (teamStats.currentStreak === 3) {
      achievements.push('🔥 Hot Streak');
    } else if (teamStats.currentStreak === 5) {
      achievements.push('🌟 Five in a Row');
    } else if (teamStats.currentStreak === 10) {
      achievements.push('💫 Perfect Ten');
    } else if (teamStats.currentStreak === 15) {
      achievements.push('🚀 Unstoppable');
    }

    // Participation achievements
    if (data.participationRate === 1.0) {
      achievements.push('🤝 Full Team Unity');
    }

    // Story point milestones (descending order for proper awarding)
    if (teamStats.totalStoryPoints >= 1000) {
      achievements.push('🌟 Legendary Estimator');
    } else if (teamStats.totalStoryPoints >= 500) {
      achievements.push('👑 Story Point King');
    } else if (teamStats.totalStoryPoints >= 250) {
      achievements.push('🏆 Quarter Grand');
    } else if (teamStats.totalStoryPoints >= 100) {
      achievements.push('🎖️ Century Club');
    } else if (teamStats.totalStoryPoints >= 50) {
      achievements.push('🏅 First Milestone');
    }

    // Consensus achievements
    if (teamStats.consensusRate >= 0.90) {
      achievements.push('🎵 Perfect Harmony');
    } else if (teamStats.consensusRate >= 0.75) {
      achievements.push('🤝 Team Player');
    }

    // Competitive achievements
    if (teamStats.ticketsCompleted >= 10) {
      achievements.push('📈 Productivity Master');
    }
    if (teamStats.ticketsCompleted >= 25) {
      achievements.push('🏭 Estimation Factory');
    }
    if (teamStats.bestStreak >= 20) {
      achievements.push('🔥 Legendary Streak');
    }

    // Add new achievements (avoid duplicates)
    achievements.forEach(achievement => {
      if (!teamStats.achievements.includes(achievement)) {
        teamStats.achievements.push(achievement);
      }
    });

    // Keep only last 15 achievements to show more history
    if (teamStats.achievements.length > 15) {
      teamStats.achievements = teamStats.achievements.slice(-15);
    }
  }

  static calculatePerformanceData(lobby: Lobby, playerPerformanceMap: Map<string, {
    estimationTime: number;
    score: number | '?';
    team: TeamType;
  }>): any[] {
    const teamData: { [key in TeamType]?: any } = {};

    // Initialize team data
    (['developers', 'qa'] as const).forEach(team => {
      const teamPlayers = lobby.teams[team as TeamType] || [];
      const teamPerformances = Array.from(playerPerformanceMap.values())
        .filter(p => p.team === team);

      if (teamPerformances.length === 0) return;

      const avgEstimationTime = teamPerformances.reduce((sum, p) => sum + p.estimationTime, 0) / teamPerformances.length / 1000; // Convert ms to seconds
      const participationRate = teamPerformances.length / Math.max(teamPlayers.length, 1);
      
      // Calculate accuracy based on final consensus vs individual estimates (exclude '?' votes)
      const finalScore = lobby.currentTicket?.storyPoints || 0;
      const numericPerformances = teamPerformances.filter(p => typeof p.score === 'number');
      const accuracy = numericPerformances.length > 0 ? 
        numericPerformances.reduce((sum, p) => {
          const diff = Math.abs((p.score as number) - finalScore);
          const maxDiff = Math.max((p.score as number), finalScore);
          return sum + (maxDiff > 0 ? 1 - (diff / maxDiff) : 1);
        }, 0) / numericPerformances.length : 0;

      // Check if team achieved consensus (exclude '?' votes)
      const numericScores = teamPerformances.map(p => p.score).filter(score => typeof score === 'number');
      const consensusAchieved = numericScores.length > 1 && 
        numericScores.every(score => score === numericScores[0]);

      teamData[team as TeamType] = {
        team: team as TeamType,
        estimationTime: avgEstimationTime,
        accuracy,
        participationRate,
        consensusAchieved
      };
    });

    return Object.values(teamData).filter(Boolean);
  }
}