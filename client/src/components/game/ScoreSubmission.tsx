import React, { useState } from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { FIBONACCI_NUMBERS } from '@/lib/gameTypes';

export function ScoreSubmission() {
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const { emit } = useWebSocket();
  const { currentLobby, currentPlayer } = useGameState();

  const handleScoreSubmit = () => {
    if (selectedScore === null) return;
    
    emit('submit_score', { score: selectedScore });
    setHasSubmitted(true);
  };

  const currentTicket = currentLobby?.currentTicket;
  const submittedCount = currentLobby?.players.filter(p => 
    p.team !== 'spectators' && p.hasSubmittedScore
  ).length || 0;
  const totalPlayers = currentLobby?.players.filter(p => p.team !== 'spectators').length || 0;

  if (!currentTicket || !currentPlayer) return null;

  return (
    <div className="space-y-6">
      {/* Ticket Information */}
      <RetroCard title="Current Objective">
        <div className="space-y-2">
          <h3 className="text-lg font-bold text-yellow-400">
            {currentTicket.title}
          </h3>
          <p className="text-sm text-gray-400">
            {currentTicket.description}
          </p>
        </div>
      </RetroCard>

      {/* Score Selection */}
      {currentPlayer.team !== 'spectators' && !hasSubmitted && (
        <RetroCard title="Submit Your Estimate">
          <div className="space-y-4">
            <p className="text-center text-sm">
              Choose your story point estimate:
            </p>
            
            <div className="fibonacci-grid">
              {FIBONACCI_NUMBERS.map(number => (
                <RetroButton
                  key={number}
                  className={`fibonacci-button ${
                    selectedScore === number ? 'bg-yellow-600' : ''
                  }`}
                  onClick={() => setSelectedScore(number)}
                  variant={selectedScore === number ? 'accent' : 'primary'}
                >
                  {number}
                </RetroButton>
              ))}
            </div>
            
            <div className="text-center">
              <RetroButton
                onClick={handleScoreSubmit}
                disabled={selectedScore === null}
                className="px-8"
                variant="accent"
              >
                Submit Score: {selectedScore ?? '?'}
              </RetroButton>
            </div>
          </div>
        </RetroCard>
      )}

      {/* Submission Status */}
      <RetroCard title="Team Progress">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span>Estimates Submitted:</span>
            <span className="retro-text-glow font-bold">
              {submittedCount} / {totalPlayers}
            </span>
          </div>
          
          <div className="retro-health-bar">
            <div
              className="retro-health-fill"
              style={{
                width: `${totalPlayers > 0 ? (submittedCount / totalPlayers) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #00ff00 0%, #ffff00 100%)'
              }}
            />
          </div>
          
          {hasSubmitted && (
            <p className="text-center text-green-400 text-sm">
              ✓ Your estimate has been submitted!
            </p>
          )}
          
          {submittedCount < totalPlayers && (
            <p className="text-center text-gray-400 text-sm">
              Waiting for remaining team members...
            </p>
          )}
        </div>
      </RetroCard>
    </div>
  );
}
