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
    if (!currentLobby || !currentBoss) return null;

    switch (currentLobby.gamePhase) {
      case 'battle':
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
        return (
          <div className="text-center p-6">
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
                  Total Objectives: {currentLobby.tickets.length}
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
                  Progress: {currentLobby.completedTickets} / {currentLobby.tickets.length}
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
