import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';
import { useState, useEffect } from 'react';
import { Player } from '@shared/gameEvents';

const FIBONACCI_NUMBERS = [1, 2, 3, 5, 8, 13, 21, '?'] as const;

export function Discussion() {
  const { currentLobby, currentPlayer, discussionTimer } = useGameState();
  const { emit, socket } = useWebSocket();
  const [selectedScore, setSelectedScore] = useState<number | '?' | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Auto-select current player's score when component mounts
  useEffect(() => {
    if (currentPlayer?.currentScore !== undefined) {
      setSelectedScore(currentPlayer.currentScore);
    }
  }, [currentPlayer?.currentScore]);

  // Timer countdown effect
  useEffect(() => {
    if (!discussionTimer?.active) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemaining = () => {
      const remaining = Math.max(0, Math.floor((discussionTimer.endsAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);
    return () => clearInterval(interval);
  }, [discussionTimer]);

  const handleUpdateVote = () => {
    if (selectedScore === null || !currentPlayer || currentPlayer.team === 'spectators') return;

    emit('update_discussion_vote', { score: selectedScore });
  };

  const handleFinalize = (estimate: number) => {
    socket?.emit('finalize_estimate', { estimate });
  };

  if (!currentLobby || !currentPlayer) return null;

  const isHost = currentLobby.hostId === currentPlayer.id;

  const currentTicket = currentLobby.currentTicket;
  if (!currentTicket) return null;

  // Get all players with votes, organized by team
  const developersWithVotes = currentLobby.teams.developers
    .filter((p: Player) => p.currentScore !== undefined)
    .map((p: Player) => ({ ...p, score: p.currentScore! }));
    
  const qaWithVotes = currentLobby.teams.qa
    .filter((p: Player) => p.currentScore !== undefined)
    .map((p: Player) => ({ ...p, score: p.currentScore! }));

  // Check if there's consensus
  const devScores = developersWithVotes.map((p: any) => p.score).filter((score: any) => typeof score === 'number');
  const qaScores = qaWithVotes.map((p: any) => p.score).filter((score: any) => typeof score === 'number');
  
  const devConsensus = devScores.length > 0 && devScores.every((score: any) => score === devScores[0]);
  const qaConsensus = qaScores.length > 0 && qaScores.every((score: any) => score === qaScores[0]);
  
  const hasConsensus = currentLobby.teams.developers.length > 0 && currentLobby.teams.qa.length > 0
    ? devConsensus && qaConsensus && devScores[0] === qaScores[0]
    : currentLobby.teams.developers.length > 0
      ? devConsensus
      : qaConsensus;

  // Collect unique voted values for finalize buttons
  const uniqueVotedValues = Array.from(new Set([...devScores, ...qaScores])).sort((a, b) => a - b);

  // Format timer display
  const timerDisplay = remainingSeconds > 0
    ? `${Math.floor(remainingSeconds / 60)}:${(remainingSeconds % 60).toString().padStart(2, '0')}`
    : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Current Ticket */}
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
          <p className="text-sm text-gray-400">{currentTicket.description}</p>
        </div>
      </RetroCard>

      {/* Discussion Status */}
      <RetroCard title="Team Discussion">
        <div className="space-y-4">
          {/* Timer Display */}
          {timerDisplay && discussionTimer?.active && (
            <div className="text-center">
              <div className="text-3xl font-mono font-bold text-yellow-400">
                {timerDisplay}
              </div>
              <p className="text-xs text-gray-400">Time Remaining</p>
            </div>
          )}

          <div className="text-center">
            {hasConsensus ? (
              <div className="space-y-3">
                <div className="text-green-400 text-lg font-bold">
                  Consensus Reached! Auto-advancing soon...
                </div>
                {isHost && (
                  <button
                    onClick={() => socket?.emit('advancePhaseNow')}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold rounded border-2 border-yellow-400 transition-colors"
                  >
                    Advance Now (Host)
                  </button>
                )}
              </div>
            ) : (
              <div className="text-orange-400 text-lg">
                Team Discussion in Progress
              </div>
            )}
            <p className="text-sm text-gray-400 mt-2">
              Review individual votes below and update your estimate if needed
            </p>
          </div>

          {/* Host Finalize Estimate Buttons */}
          {isHost && discussionTimer?.active && uniqueVotedValues.length > 0 && !hasConsensus && (
            <div className="mt-4 border-t border-gray-700 pt-4">
              <div className="text-sm text-gray-400 mb-2 text-center">Finalize with a voted value:</div>
              <div className="flex gap-2 flex-wrap justify-center">
                {uniqueVotedValues.map((value) => (
                  <button
                    key={value}
                    onClick={() => handleFinalize(value)}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded font-bold transition-colors"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </RetroCard>

      {/* Individual Votes by Team */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Developers Team */}
        {currentLobby.teams.developers.length > 0 && (
          <RetroCard title="👨‍💻 Developers">
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {developersWithVotes.map((player: any) => (
                <div 
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded border ${
                    devConsensus ? 'bg-green-900/30 border-green-500/30' : 'bg-blue-900/30 border-blue-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-lg">{player.avatar === 'wizard' ? '🧙‍♂️' : player.avatar === 'warrior' ? '⚔️' : player.avatar === 'ranger' ? '🏹' : player.avatar === 'cleric' ? '⚡' : player.avatar === 'rogue' ? '🗡️' : '🎭'}</div>
                    <div>
                      <div className="font-semibold text-blue-300">{player.name}</div>
                      {player.id === currentPlayer.id && (
                        <div className="text-xs text-blue-400">You</div>
                      )}
                    </div>
                  </div>
                  <div className={`text-xl font-bold px-3 py-1 rounded ${
                    typeof player.score === 'number' 
                      ? 'text-white bg-blue-600' 
                      : 'text-gray-300 bg-gray-600'
                  }`}>
                    {player.score}
                  </div>
                </div>
              ))}
              {developersWithVotes.length === 0 && (
                <div className="text-center text-gray-400 py-4">
                  No votes submitted yet
                </div>
              )}
            </div>
          </RetroCard>
        )}

        {/* QA Team */}
        {currentLobby.teams.qa.length > 0 && (
          <RetroCard title="🧪 QA Engineers">
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {qaWithVotes.map((player: any) => (
                <div 
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded border ${
                    qaConsensus ? 'bg-green-900/30 border-green-500/30' : 'bg-red-900/30 border-red-500/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-lg">{player.avatar === 'wizard' ? '🧙‍♂️' : player.avatar === 'warrior' ? '⚔️' : player.avatar === 'ranger' ? '🏹' : player.avatar === 'cleric' ? '⚡' : player.avatar === 'rogue' ? '🗡️' : '🎭'}</div>
                    <div>
                      <div className="font-semibold text-green-300">{player.name}</div>
                      {player.id === currentPlayer.id && (
                        <div className="text-xs text-green-400">You</div>
                      )}
                    </div>
                  </div>
                  <div className={`text-xl font-bold px-3 py-1 rounded ${
                    typeof player.score === 'number' 
                      ? 'text-white bg-green-600' 
                      : 'text-gray-300 bg-gray-600'
                  }`}>
                    {player.score}
                  </div>
                </div>
              ))}
              {qaWithVotes.length === 0 && (
                <div className="text-center text-gray-400 py-4">
                  No votes submitted yet
                </div>
              )}
            </div>
          </RetroCard>
        )}
      </div>

      {/* Update Vote Section - Only for developers and QA */}
      {(currentPlayer.team === 'developers' || currentPlayer.team === 'qa') && (
        <RetroCard title="Update Your Estimate">
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm mb-4">
                Current vote: <span className="font-bold text-yellow-400">{currentPlayer.currentScore}</span>
              </p>
              <p className="text-sm text-gray-400">
                Change your estimate based on team discussion:
              </p>
            </div>
            
            <div className="fibonacci-grid">
              {FIBONACCI_NUMBERS.map(number => (
                <RetroButton
                  key={number}
                  variant={selectedScore === number ? 'primary' : 'secondary'}
                  onClick={() => setSelectedScore(number)}
                  className="text-lg font-bold"
                >
                  {number}
                </RetroButton>
              ))}
            </div>

            <div className="text-center">
              <RetroButton
                variant="accent"
                onClick={handleUpdateVote}
                disabled={selectedScore === null || selectedScore === currentPlayer.currentScore}
                className="px-8"
              >
                {selectedScore === currentPlayer.currentScore ? 'No Change' : 'Update Vote'}
              </RetroButton>
            </div>
          </div>
        </RetroCard>
      )}

      {/* Spectator Message */}
      {currentPlayer.team === 'spectators' && (
        <RetroCard title="Spectator View">
          <div className="text-center space-y-4">
            <div className="text-yellow-400 text-lg font-bold">
              🎭 Spectator Mode 🎭
            </div>
            <p className="text-sm text-gray-400">
              You're watching the team discussion. Players can update their estimates above!
            </p>
          </div>
        </RetroCard>
      )}
    </div>
  );
}