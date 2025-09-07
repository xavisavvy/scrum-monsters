import React, { useState, useEffect } from 'react';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { FIBONACCI_NUMBERS, EstimationScaleType, ESTIMATION_SCALES } from '@/lib/gameTypes';
import { TeamScoreboard } from './TeamScoreboard';

export function ScoreSubmission() {
  const [selectedScore, setSelectedScore] = useState<number | string | '?' | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const { emit } = useWebSocket();
  const { currentLobby, currentPlayer } = useGameState();

  // Get the scoring options based on the lobby's estimation scale
  const getScoringOptions = (): (number | string)[] => {
    if (!currentLobby?.estimationSettings) {
      return FIBONACCI_NUMBERS; // Default to Fibonacci if no settings
    }

    const scaleType = currentLobby.estimationSettings.scaleType;
    const scale = ESTIMATION_SCALES[scaleType];
    
    if (scaleType === 'tshirt' && currentLobby.estimationSettings.customTshirtMapping) {
      // Use custom T-shirt sizes in order
      return ['XS', 'S', 'M', 'L', 'XL'];
    }
    
    return scale.options;
  };

  // Get display text for a scoring option
  const getScoreDisplayText = (option: number | string): string => {
    if (typeof option === 'string') {
      // For T-shirt sizes, show the size and points
      const customMapping = currentLobby?.estimationSettings?.customTshirtMapping;
      const defaultMapping = ESTIMATION_SCALES.tshirt.pointMapping;
      const points = customMapping?.[option] ?? defaultMapping?.[option] ?? 0;
      return `${option} (${points}pt)`;
    }
    return option.toString();
  };

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
            {currentLobby.jiraSettings?.baseUrl ? (
              <a
                href={`${currentLobby.jiraSettings.baseUrl}${currentTicket.title}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-yellow-400 hover:text-yellow-300 hover:underline"
              >
                {currentTicket.title}
              </a>
            ) : (
              currentTicket.title
            )}
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

      {/* Score Selection - Only for developers and QA */}
      {(currentPlayer.team === 'developers' || currentPlayer.team === 'qa') && !hasSubmitted && (
        <RetroCard title="Submit Your Estimate">
          <div className="space-y-4">
            <p className="text-center text-sm">
              Choose your story point estimate (or ? if you're unsure):
            </p>
            
            <div className="fibonacci-grid">
              {getScoringOptions().map(option => (
                <RetroButton
                  key={option}
                  className={`fibonacci-button ${
                    selectedScore === option ? 'bg-yellow-600' : ''
                  }`}
                  onClick={() => setSelectedScore(option)}
                  variant={selectedScore === option ? 'accent' : 'primary'}
                  title={typeof option === 'string' ? `T-shirt size: ${getScoreDisplayText(option)}` : undefined}
                >
                  {getScoreDisplayText(option)}
                </RetroButton>
              ))}
              {/* Add "Don't Know" option */}
              <RetroButton
                key="unknown"
                className={`fibonacci-button ${
                  selectedScore === '?' ? 'bg-purple-600' : ''
                }`}
                onClick={() => setSelectedScore('?')}
                variant={selectedScore === '?' ? 'accent' : 'primary'}
                title="I don't know / No opinion"
              >
                ?
              </RetroButton>
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

      {/* Submitted Score Status - Only for developers and QA */}
      {(currentPlayer.team === 'developers' || currentPlayer.team === 'qa') && hasSubmitted && (
        <RetroCard title="Estimate Submitted">
          <div className="text-center space-y-4">
            <div className="text-2xl">✅</div>
            <div className="text-lg font-bold text-green-400">
              Estimate Submitted!
            </div>
            <p className="text-sm">
              Your estimate: <span className="text-yellow-400 font-bold">{selectedScore}</span>
            </p>
            <p className="text-xs text-gray-400">
              Waiting for other team members...
            </p>
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
                {devPlayers.length > 0 && qaPlayers.length > 0 
                  ? 'Both teams must submit estimates to reveal scores...'
                  : 'All team members must submit estimates to reveal scores...'
                }
              </div>
            )}
          </div>

          {(currentPlayer.team === 'developers' || currentPlayer.team === 'qa') && hasSubmitted && (
            <p className="text-center text-green-400 text-sm">
              ✓ Your estimate has been submitted!
            </p>
          )}

          {/* Host Force Reveal Button */}
          {currentPlayer?.isHost && submittedCount > 0 && currentLobby?.gamePhase === 'battle' && (
            <div className="text-center mt-4 pt-4 border-t border-gray-600">
              <RetroButton
                onClick={() => emit('force_reveal', {})}
                variant="secondary"
                size="sm"
                className="bg-red-600 hover:bg-red-700"
              >
                🚨 Force Reveal Scores
              </RetroButton>
              <div className="text-xs text-gray-500 mt-1">
                Host only: Reveal scores without waiting for all votes
              </div>
            </div>
          )}
        </div>
      </RetroCard>

      {/* Team Competition Section */}
      <TeamScoreboard />
    </div>
  );
}
