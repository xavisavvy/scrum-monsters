import React, { useState, useEffect } from 'react';
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

  // Reset local hasSubmitted state when server state changes
  useEffect(() => {
    if (currentPlayer && !currentPlayer.hasSubmittedScore) {
      setHasSubmitted(false);
      setSelectedScore(null);
    }
  }, [currentPlayer?.hasSubmittedScore]);

  const handleScoreSubmit = () => {
    if (selectedScore === null) return;
    
    emit('submit_score', { score: selectedScore });
    setHasSubmitted(true);
  };

  const currentTicket = currentLobby?.currentTicket;
  // Count submitted scores by team
  const devPlayers = currentLobby?.players.filter(p => p.team === 'developers') || [];
  const qaPlayers = currentLobby?.players.filter(p => p.team === 'qa') || [];
  const devSubmitted = devPlayers.filter(p => p.hasSubmittedScore).length;
  const qaSubmitted = qaPlayers.filter(p => p.hasSubmittedScore).length;
  
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

      {/* Spectator Message */}
      {currentPlayer.team === 'spectators' && (
        <RetroCard title="Spectator View">
          <div className="text-center space-y-4">
            <div className="text-yellow-400 text-lg font-bold">
              🎭 Spectator Mode 🎭
            </div>
            <p className="text-sm text-gray-400">
              You're watching the estimation process. Developers and QA teams are voting!
            </p>
            <p className="text-xs text-gray-500">
              Future feature: You'll be able to control lair animations and other fun spectator activities!
            </p>
          </div>
        </RetroCard>
      )}

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

      {/* Team Submission Status */}
      <RetroCard title="Team Battle Status">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Developers Status */}
            <div className="text-center p-3 bg-blue-900/30 rounded-lg border border-blue-500/30">
              <div className="text-blue-400 font-bold text-sm mb-1">
                👨‍💻 Developers
              </div>
              <div className="text-lg font-bold">
                {devPlayers.length === 0 ? '— No members' : `${devSubmitted} / ${devPlayers.length}`}
              </div>
              <div className="text-xs text-gray-500">
                {devPlayers.length === 0 ? '' : (devSubmitted === devPlayers.length ? '✅ Ready' : '⏳ Voting...')}
              </div>
            </div>

            {/* QA Status */}
            <div className="text-center p-3 bg-green-900/30 rounded-lg border border-green-500/30">
              <div className="text-green-400 font-bold text-sm mb-1">
                🧪 QA Engineers
              </div>
              <div className="text-lg font-bold">
                {qaPlayers.length === 0 ? '— No members' : `${qaSubmitted} / ${qaPlayers.length}`}
              </div>
              <div className="text-xs text-gray-500">
                {qaPlayers.length === 0 ? '' : (qaSubmitted === qaPlayers.length ? '✅ Ready' : '⏳ Testing...')}
              </div>
            </div>
          </div>

          <div className="text-center">
            <div className="text-sm text-gray-400 mb-1">
              Overall Progress
            </div>
            <div className="text-xl font-bold retro-text-glow">
              {submittedCount} / {totalPlayers}
            </div>
            {submittedCount < totalPlayers && (
              <div className="text-xs text-gray-500 mt-2">
                Both teams must submit estimates to reveal scores...
              </div>
            )}
          </div>

          {hasSubmitted && (
            <p className="text-center text-green-400 text-sm">
              ✓ Your estimate has been submitted!
            </p>
          )}
        </div>
      </RetroCard>
    </div>
  );
}
