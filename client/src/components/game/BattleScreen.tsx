import React, { useEffect } from 'react';
import { BossDisplay } from './BossDisplay';
import { ScoreSubmission } from './ScoreSubmission';
import { PlayerHUD } from './PlayerHUD';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useAudio } from '@/lib/stores/useAudio';

export function BattleScreen() {
  const { currentLobby, currentBoss, addAttackAnimation } = useGameState();
  const { emit } = useWebSocket();
  const { playHit, playSuccess } = useAudio();

  const handleBossAttack = () => {
    const damage = Math.floor(Math.random() * 50) + 10;
    
    // Add visual attack animation
    addAttackAnimation({
      id: Math.random().toString(36).substring(2, 15),
      playerId: 'current',
      damage,
      timestamp: Date.now(),
      x: Math.random() * 100,
      y: Math.random() * 100
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
        if (!currentBoss) return null;
        return (
          <div className="grid lg:grid-cols-3 gap-6 p-6">
            <div className="lg:col-span-2">
              <BossDisplay boss={currentBoss} onAttack={handleBossAttack} />
            </div>
            <div>
              <ScoreSubmission />
            </div>
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
    <div className="battle-screen">
      {renderGamePhase()}
      <PlayerHUD />
    </div>
  );
}
