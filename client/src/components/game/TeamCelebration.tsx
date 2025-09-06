import React, { useEffect, useState, useRef } from 'react';
import { useGameState } from '@/lib/stores/useGameState';
import { TeamType } from '@/lib/gameTypes';
import { getRandomVictoryImage } from '@/lib/victoryImages';

interface CelebrationEvent {
  id: string;
  team: TeamType;
  type: 'achievement' | 'victory' | 'streak' | 'milestone';
  message: string;
  emoji?: string;
  image?: string;
  timestamp: number;
}

export function TeamCelebration() {
  const { currentLobby } = useGameState();
  const [celebrations, setCelebrations] = useState<CelebrationEvent[]>([]);
  const announcedAchievements = useRef(new Set<string>());
  const announcedStreaks = useRef(new Map<string, number>());
  const announcedMilestones = useRef(new Map<string, number>());

  useEffect(() => {
    if (!currentLobby?.teamCompetition) return;

    const { developers, qa } = currentLobby.teamCompetition;
    
    // Check for new achievements
    const checkForCelebrations = () => {
      const newCelebrations: CelebrationEvent[] = [];

      // Check developer achievements
      if (developers.achievements.length > 0) {
        const latestAchievement = developers.achievements[developers.achievements.length - 1];
        const achievementKey = `dev-${latestAchievement}`;
        if (latestAchievement && !announcedAchievements.current.has(achievementKey)) {
          announcedAchievements.current.add(achievementKey);
          newCelebrations.push({
            id: `dev-achievement-${Date.now()}`,
            team: 'developers',
            type: 'achievement',
            message: latestAchievement,
            image: getRandomVictoryImage(),
            timestamp: Date.now()
          });
        }
      }

      // Check QA achievements
      if (qa.achievements.length > 0) {
        const latestAchievement = qa.achievements[qa.achievements.length - 1];
        const achievementKey = `qa-${latestAchievement}`;
        if (latestAchievement && !announcedAchievements.current.has(achievementKey)) {
          announcedAchievements.current.add(achievementKey);
          newCelebrations.push({
            id: `qa-achievement-${Date.now()}`,
            team: 'qa',
            type: 'achievement',
            message: latestAchievement,
            image: getRandomVictoryImage(),
            timestamp: Date.now()
          });
        }
      }

      // Check for streaks
      if (developers.currentStreak >= 5 && developers.currentStreak % 5 === 0) {
        const lastAnnouncedStreak = announcedStreaks.current.get('developers') || 0;
        if (developers.currentStreak > lastAnnouncedStreak) {
          announcedStreaks.current.set('developers', developers.currentStreak);
          newCelebrations.push({
            id: `dev-streak-${developers.currentStreak}`,
            team: 'developers',
            type: 'streak',
            message: `🔥 ${developers.currentStreak} Streak!`,
            emoji: '🚀',
            timestamp: Date.now()
          });
        }
      }

      if (qa.currentStreak >= 5 && qa.currentStreak % 5 === 0) {
        const lastAnnouncedStreak = announcedStreaks.current.get('qa') || 0;
        if (qa.currentStreak > lastAnnouncedStreak) {
          announcedStreaks.current.set('qa', qa.currentStreak);
          newCelebrations.push({
            id: `qa-streak-${qa.currentStreak}`,
            team: 'qa',
            type: 'streak',
            message: `🔥 ${qa.currentStreak} Streak!`,
            emoji: '⚡',
            timestamp: Date.now()
          });
        }
      }

      // Check for milestones
      const checkMilestone = (stats: any, team: TeamType, emoji: string) => {
        const milestones = [50, 100, 250, 500, 1000];
        const currentPoints = stats.totalStoryPoints;
        const lastAnnouncedMilestone = announcedMilestones.current.get(team) || 0;
        
        milestones.forEach(milestone => {
          if (currentPoints >= milestone && milestone > lastAnnouncedMilestone) {
            announcedMilestones.current.set(team, milestone);
            newCelebrations.push({
              id: `${team}-milestone-${milestone}`,
              team,
              type: 'milestone',
              message: `💎 ${milestone} Points Milestone!`,
              emoji,
              timestamp: Date.now()
            });
          }
        });
      };

      checkMilestone(developers, 'developers', '🎯');
      checkMilestone(qa, 'qa', '🏆');

      if (newCelebrations.length > 0) {
        setCelebrations(prev => [...prev, ...newCelebrations]);
        
        // Auto-remove celebrations after 4 seconds
        setTimeout(() => {
          setCelebrations(prev => 
            prev.filter(c => !newCelebrations.some(nc => nc.id === c.id))
          );
        }, 4000);
      }
    };

    checkForCelebrations();
  }, [currentLobby?.teamCompetition?.developers.achievements, 
      currentLobby?.teamCompetition?.qa.achievements,
      currentLobby?.teamCompetition?.developers.currentStreak,
      currentLobby?.teamCompetition?.qa.currentStreak,
      currentLobby?.teamCompetition?.developers.totalStoryPoints,
      currentLobby?.teamCompetition?.qa.totalStoryPoints]);

  const getTeamColor = (team: TeamType) => {
    return team === 'developers' ? 'text-blue-400' : 'text-green-400';
  };

  const getTeamBgColor = (team: TeamType) => {
    return team === 'developers' ? 'bg-blue-500/20 border-blue-400' : 'bg-green-500/20 border-green-400';
  };

  if (celebrations.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
      {celebrations.map((celebration) => (
        <div
          key={celebration.id}
          className={`
            ${getTeamBgColor(celebration.team)} 
            border-2 rounded-lg p-4 shadow-lg
            animate-bounce transform transition-all duration-500
            max-w-xs
          `}
        >
          <div className="flex items-center space-x-2">
            <div className="animate-pulse">
              {celebration.image ? (
                <img 
                  src={celebration.image} 
                  alt="Celebration"
                  className="w-8 h-8 pixelated"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <div className="text-2xl">
                  {celebration.emoji}
                </div>
              )}
            </div>
            <div>
              <div className={`font-bold text-sm ${getTeamColor(celebration.team)}`}>
                {celebration.team === 'developers' ? '👨‍💻 Developers' : '🧪 QA Team'}
              </div>
              <div className="text-white text-sm">
                {celebration.message}
              </div>
            </div>
          </div>
          
          {/* Animated background effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent 
                          animate-ping opacity-50 rounded-lg"></div>
        </div>
      ))}
    </div>
  );
}