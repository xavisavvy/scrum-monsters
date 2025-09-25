import React, { useState } from 'react';
import { PhaseContainer } from './PhaseContainer';
import { PhaseComponentProps } from './index';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';
import { TeamScoreboard } from '@/components/game/TeamScoreboard';

interface VictoryPhaseProps extends PhaseComponentProps {}

export function VictoryPhase({
  lobby,
  currentPlayer,
  emit,
  isTransitioning = false
}: VictoryPhaseProps) {
  const [resultsCopied, setResultsCopied] = useState(false);
  
  const completedTickets = Array.isArray(lobby.completedTickets) ? lobby.completedTickets : [];
  const totalStoryPoints = completedTickets.reduce((sum, ticket) => sum + ticket.storyPoints, 0);
  
  // Calculate story points by team
  const devStoryPoints = completedTickets.reduce((sum, ticket) => 
    ticket.teamBreakdown?.developers?.participated ? sum + (ticket.teamBreakdown.developers.consensusScore ?? 0) : sum, 0
  );
  const qaStoryPoints = completedTickets.reduce((sum, ticket) => 
    ticket.teamBreakdown?.qa?.participated ? sum + (ticket.teamBreakdown.qa.consensusScore ?? 0) : sum, 0
  );

  const victoryImage = '/images/victory.png';

  const copyResults = async () => {
    try {
      const resultsText = `SCRUM MONSTERS Victory Report\n\n` +
        `Total Objectives: ${lobby.tickets.length}\n` +
        `Total Story Points: ${totalStoryPoints}\n\n` +
        `Team Breakdown:\n` +
        `👨‍💻 Developers: ${devStoryPoints} points\n` +
        `🧪 QA Engineers: ${qaStoryPoints} points\n\n` +
        `Completed Objectives:\n` +
        completedTickets.map((ticket, i) => 
          `${i + 1}. ${ticket.title} (${ticket.storyPoints} pts)`
        ).join('\n') +
        `\n\nPowered by SCRUM MONSTERS 🎮`;
        
      await navigator.clipboard.writeText(resultsText);
      setResultsCopied(true);
      setTimeout(() => setResultsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy results:', err);
    }
  };

  const mainContent = (
    <div className="p-6 max-h-screen overflow-y-auto">
      <div className="text-center mb-6">
        <RetroCard title="Victory!">
          <div className="space-y-4">
            <div className="flex justify-center mb-4">
              <img 
                src={victoryImage} 
                alt="Victory!"
                className="w-32 h-32 pixelated"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <h2 className="text-2xl font-bold retro-text-glow">
              All Objectives Complete!
            </h2>
            <p className="text-lg">
              The team has successfully defeated all bosses!
            </p>
            <div className="text-sm text-gray-400">
              Total Objectives: {lobby.tickets.length} • Total Story Points: {totalStoryPoints}
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
          <div className="grid gap-3 max-h-[40vh] overflow-y-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 hover:scrollbar-thumb-gray-500">
            {completedTickets.map((ticket, index) => (
              <div 
                key={ticket.id}
                className="bg-gray-800 border border-gray-600 rounded p-4 flex justify-between items-center"
              >
                <div className="flex items-center gap-4">
                  <span className="text-green-400 text-xl">✅</span>
                  <div>
                    <div className="font-mono text-sm text-blue-400">#{index + 1}</div>
                    <div className="font-bold">
                      {lobby.jiraSettings?.baseUrl ? (
                        <a
                          href={`${lobby.jiraSettings.baseUrl}${ticket.title}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white hover:text-blue-300 hover:underline"
                        >
                          {ticket.title}
                        </a>
                      ) : (
                        ticket.title
                      )}
                    </div>
                    <div className="text-sm text-gray-400">{ticket.description}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-yellow-400">{ticket.storyPoints}</div>
                  <div className="text-xs text-gray-400">Total Story Points</div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-4 justify-center pt-4">
            <RetroButton 
              onClick={copyResults}
              variant="secondary"
              className="flex-1 max-w-48"
            >
              {resultsCopied ? '✅ Copied!' : '📋 Copy Results'}
            </RetroButton>
            
            {currentPlayer?.isHost && (
              <RetroButton 
                onClick={() => emit('restart_game')}
                variant="primary"
                className="flex-1 max-w-48"
              >
                🎮 New Game
              </RetroButton>
            )}
          </div>
          
          {isTransitioning && (
            <div className="text-center text-xs text-gray-400 mt-2">
              Transitioning...
            </div>
          )}
        </div>
      </RetroCard>

      {/* Team Scoreboard */}
      <div className="mt-6">
        <TeamScoreboard />
      </div>
    </div>
  );

  return (
    <PhaseContainer
      layout="cinematic"
      mainContent={mainContent}
      className={isTransitioning ? 'transitioning' : ''}
    />
  );
}