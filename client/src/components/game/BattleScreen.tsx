import React, { useEffect } from 'react';
import { BossDisplay } from './BossDisplay';
import { ScoreSubmission } from './ScoreSubmission';
import { PlayerHUD } from './PlayerHUD';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';
import { BossMusicControls } from '@/components/ui/BossMusicControls';
import { YoutubeAudioPlayer } from '@/components/ui/YoutubeAudioPlayer';
import { PlayerController } from './PlayerController';
// Team competition components for enhanced multiplayer experience
import { TeamScoreboard } from './TeamScoreboard';
import { TeamPerformanceTracker } from './TeamPerformanceTracker';
import { TeamCelebration } from './TeamCelebration';
import { TimerDisplay } from './TimerDisplay';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useAudio } from '@/lib/stores/useAudio';

export function BattleScreen() {
  const { currentLobby, addAttackAnimation } = useGameState();
  const { emit } = useWebSocket();
  const { playHit, playSuccess, fadeInBossMusic, fadeOutBossMusic, stopBossMusic } = useAudio();

  // Handle boss music when entering/leaving battle
  useEffect(() => {
    console.log('🎵 Boss music effect triggered. Phase:', currentLobby?.gamePhase, 'Boss:', !!currentLobby?.boss);
    if (currentLobby?.gamePhase === 'battle' && currentLobby?.boss) {
      console.log('🎵 Starting boss music...');
      // Fade in boss music when battle starts
      fadeInBossMusic();
    } else {
      console.log('🎵 Stopping boss music...');
      // Stop boss music when leaving battle
      stopBossMusic();
    }

    // Cleanup on unmount
    return () => {
      stopBossMusic();
    };
  }, [currentLobby?.gamePhase, currentLobby?.boss, fadeInBossMusic, stopBossMusic]);

  const handleBossAttack = () => {
    const damage = Math.floor(Math.random() * 50) + 10;
    
    // Add visual attack animation with consistent coordinate system (percentages)
    addAttackAnimation({
      id: Math.random().toString(36).substring(2, 15),
      playerId: 'current',
      damage,
      timestamp: Date.now(),
      x: Math.random() * 80 + 10, // 10-90% of viewport width
      y: Math.random() * 80 + 10  // 10-90% of viewport height
    });
    
    // Emit attack to server
    emit('attack_boss', { damage });
    
    // Play sound effect
    playHit();
  };

  const renderGamePhase = () => {
    if (!currentLobby) return null;

    switch (currentLobby.gamePhase) {
      case 'battle':
        if (!currentLobby?.boss) return null;
        return (
          <div className="relative">
            {/* Fullscreen Boss Background */}
            <BossDisplay boss={currentLobby.boss} onAttack={handleBossAttack} fullscreen />
            
            {/* UI Overlay */}
            <div className="relative z-30 min-h-screen flex items-center justify-end p-6">
              <div className="w-full max-w-md bg-black bg-opacity-80 rounded-lg border-2 border-gray-600" data-no-shoot>
                <ScoreSubmission />
              </div>
            </div>

            {/* Timer Display - Top Left */}
            <TimerDisplay />
            
            {/* Boss Music Controls - Top Right */}
            <div className="absolute top-6 right-6 z-40" data-no-shoot>
              <BossMusicControls />
            </div>

            {/* Player Character Controller */}
            <div className="absolute inset-0 z-20" style={{ pointerEvents: 'auto' }}>
              <PlayerController 
                containerWidth={window.innerWidth}
                containerHeight={window.innerHeight}
              />
            </div>

            {/* Team Competition Components */}
            <TeamScoreboard />
            <TeamPerformanceTracker />
            <TeamCelebration />
          </div>
        );

      case 'reveal':
        return (
          <div className="text-center p-6">
            <RetroCard title="Revealing Estimates...">
              <div className="space-y-4">
                <div className="text-2xl">⏳</div>
                <p>Calculating team consensus...</p>
              </div>
            </RetroCard>
          </div>
        );

      case 'victory':
        const completedTickets = Array.isArray(currentLobby.completedTickets) ? currentLobby.completedTickets : [];
        const totalStoryPoints = completedTickets.reduce((sum, ticket) => sum + ticket.storyPoints, 0);
        
        // Calculate story points by team
        const devStoryPoints = completedTickets.reduce((sum, ticket) => 
          ticket.teamBreakdown?.developers.participated ? sum + (ticket.teamBreakdown.developers.consensusScore || 0) : sum, 0
        );
        const qaStoryPoints = completedTickets.reduce((sum, ticket) => 
          ticket.teamBreakdown?.qa.participated ? sum + (ticket.teamBreakdown.qa.consensusScore || 0) : sum, 0
        );
        
        return (
          <div className="p-6">
            <div className="text-center mb-6">
              <RetroCard title="Victory!">
                <div className="space-y-4">
                  <div className="text-6xl">🎉</div>
                  <h2 className="text-2xl font-bold retro-text-glow">
                    All Objectives Complete!
                  </h2>
                  <p className="text-lg">
                    The team has successfully defeated all bosses!
                  </p>
                  <div className="text-sm text-gray-400">
                    Total Objectives: {currentLobby.tickets.length} • Total Story Points: {totalStoryPoints}
                  </div>
                  
                  {/* Team Story Points Breakdown */}
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div className="bg-blue-900/30 rounded-lg border border-blue-500/30 p-3">
                      <div className="text-blue-400 font-bold text-sm">👨‍💻 Developers</div>
                      <div className="text-xl font-bold text-blue-300">{devStoryPoints}</div>
                      <div className="text-xs text-gray-400">Story Points</div>
                    </div>
                    <div className="bg-green-900/30 rounded-lg border border-green-500/30 p-3">
                      <div className="text-green-400 font-bold text-sm">🧪 QA Engineers</div>
                      <div className="text-xl font-bold text-green-300">{qaStoryPoints}</div>
                      <div className="text-xs text-gray-400">Story Points</div>
                    </div>
                  </div>
                </div>
              </RetroCard>
            </div>

            {/* Battle Summary */}
            <RetroCard title="Battle Summary" className="max-w-4xl mx-auto">
              <div className="space-y-4">
                <div className="grid gap-3">
                  {completedTickets.map((ticket, index) => (
                    <div 
                      key={ticket.id}
                      className="bg-gray-800 border border-gray-600 rounded p-4 flex justify-between items-center"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-green-400 text-xl">✅</span>
                        <div>
                          <div className="font-mono text-sm text-blue-400">#{index + 1}</div>
                          <div className="font-bold">{ticket.title}</div>
                          <div className="text-sm text-gray-400">{ticket.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold text-yellow-400">{ticket.storyPoints}</div>
                        <div className="text-xs text-gray-400">Story Points</div>
                        {/* Team participation indicators */}
                        <div className="flex gap-1 justify-end mt-1">
                          {ticket.teamBreakdown?.developers.participated && (
                            <span className="text-xs bg-blue-600 text-white px-1 rounded">
                              Dev: {ticket.teamBreakdown.developers.consensusScore}
                            </span>
                          )}
                          {ticket.teamBreakdown?.qa.participated && (
                            <span className="text-xs bg-green-600 text-white px-1 rounded">
                              QA: {ticket.teamBreakdown.qa.consensusScore}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-gray-600 pt-4 text-center">
                  <div className="text-lg font-bold">
                    Total Story Points Completed: 
                    <span className="text-yellow-400 ml-2">{totalStoryPoints}</span>
                  </div>
                </div>
              </div>
            </RetroCard>
          </div>
        );

      case 'next_level':
        return (
          <div className="text-center p-6">
            <RetroCard title="Objective Complete!">
              <div className="space-y-4">
                <div className="text-4xl">✅</div>
                <h2 className="text-xl font-bold text-green-400">
                  Boss Defeated!
                </h2>
                <p>
                  Progress: {Array.isArray(currentLobby.completedTickets) ? currentLobby.completedTickets.length : 0} / {currentLobby.tickets.length}
                </p>
                <p className="text-sm text-gray-400">
                  Waiting for host to proceed to next level...
                </p>
              </div>
            </RetroCard>
          </div>
        );

      default:
        return null;
    }
  };

  useEffect(() => {
    // Play success sound on victory
    if (currentLobby?.gamePhase === 'victory') {
      playSuccess();
    }
  }, [currentLobby?.gamePhase, playSuccess]);

  return (
    <div className="battle-screen relative">
      {renderGamePhase()}
      <div className="relative z-40">
        <PlayerHUD />
      </div>
      {/* YouTube Audio Player (hidden) */}
      <YoutubeAudioPlayer />
    </div>
  );
}
