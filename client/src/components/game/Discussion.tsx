import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';
import { useState, useEffect } from 'react';
import { Player } from '@shared/gameEvents';

const FIBONACCI_NUMBERS = [1, 2, 3, 5, 8, 13, 21, '?'] as const;

export function Discussion() {
  const { currentLobby, currentPlayer } = useGameState();
  const { emit } = useWebSocket();
  const [selectedScore, setSelectedScore] = useState<number | '?' | null>(null);

  // Auto-select current player's score when component mounts
  useEffect(() => {
    if (currentPlayer?.currentScore !== undefined) {
      setSelectedScore(currentPlayer.currentScore);
    }
  }, [currentPlayer?.currentScore]);

  const handleUpdateVote = () => {
    if (selectedScore === null || !currentPlayer || currentPlayer.team === 'spectators') return;
    
    emit('update_discussion_vote', { score: selectedScore });
  };

  if (!currentLobby || !currentPlayer) return null;

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
          <div className="text-center">
            {hasConsensus ? (
              <div className="text-green-400 text-lg font-bold">
                ✅ Consensus Reached! Auto-advancing soon...
              </div>
            ) : (
              <div className="text-orange-400 text-lg">
                💭 Team Discussion in Progress
              </div>
            )}
            <p className="text-sm text-gray-400 mt-2">
              Review individual votes below and update your estimate if needed
            </p>
          </div>
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
                    qaConsensus ? 'bg-green-900/30 border-green-500/30' : 'bg-green-900/30 border-green-500/30'
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