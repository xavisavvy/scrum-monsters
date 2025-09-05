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
    return (
      stats.totalStoryPoints * 1.0 +
      stats.accuracyScore * 50 +
      stats.consensusRate * 30 +
      stats.participationRate * 20 +
      stats.currentStreak * 10
    );
  }

  private static checkAndAwardAchievements(teamStats: TeamStats, data: any): void {
    const achievements = [];

    // Speed achievements
    if (data.estimationTime < 10000) { // Less than 10 seconds
      achievements.push('Lightning Fast');
    }

    // Accuracy achievements
    if (data.accuracy >= 0.95) {
      achievements.push('Precision Master');
    }

    // Streak achievements
    if (teamStats.currentStreak === 5) {
      achievements.push('Five in a Row');
    } else if (teamStats.currentStreak === 10) {
      achievements.push('Perfect Ten');
    }

    // Participation achievements
    if (data.participationRate === 1.0) {
      achievements.push('Full Team Unity');
    }

    // Story point milestones
    if (teamStats.totalStoryPoints >= 100) {
      achievements.push('Century Club');
    } else if (teamStats.totalStoryPoints >= 500) {
      achievements.push('Story Point Master');
    }

    // Add new achievements (avoid duplicates)
    achievements.forEach(achievement => {
      if (!teamStats.achievements.includes(achievement)) {
        teamStats.achievements.push(achievement);
      }
    });

    // Keep only last 10 achievements
    if (teamStats.achievements.length > 10) {
      teamStats.achievements = teamStats.achievements.slice(-10);
    }
  }

  static calculatePerformanceData(lobby: Lobby, playerPerformanceMap: Map<string, {
    estimationTime: number;
    score: number;
    team: TeamType;
  }>): any[] {
    const teamData: { [key in TeamType]?: any } = {};

    // Initialize team data
    (['developers', 'qa'] as const).forEach(team => {
      const teamPlayers = lobby.teams[team as TeamType] || [];
      const teamPerformances = Array.from(playerPerformanceMap.values())
        .filter(p => p.team === team);

      if (teamPerformances.length === 0) return;

      const avgEstimationTime = teamPerformances.reduce((sum, p) => sum + p.estimationTime, 0) / teamPerformances.length;
      const participationRate = teamPerformances.length / Math.max(teamPlayers.length, 1);
      
      // Calculate accuracy based on final consensus vs individual estimates
      const finalScore = lobby.currentTicket?.storyPoints || 0;
      const accuracy = teamPerformances.length > 0 ? 
        teamPerformances.reduce((sum, p) => {
          const diff = Math.abs(p.score - finalScore);
          const maxDiff = Math.max(p.score, finalScore);
          return sum + (maxDiff > 0 ? 1 - (diff / maxDiff) : 1);
        }, 0) / teamPerformances.length : 0;

      // Check if team achieved consensus
      const teamScores = teamPerformances.map(p => p.score);
      const consensusAchieved = teamScores.length > 1 && 
        teamScores.every(score => score === teamScores[0]);

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