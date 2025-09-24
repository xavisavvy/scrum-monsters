import React, { useState } from 'react';
import { PhaseContainer } from './PhaseContainer';
import { PhaseComponentProps } from './index';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';

interface NextLevelPhaseProps extends PhaseComponentProps {}

export function NextLevelPhase({
  lobby,
  currentPlayer,
  emit,
  isTransitioning = false
}: NextLevelPhaseProps) {
  const [resultsCopied, setResultsCopied] = useState(false);
  
  const lastCompletedTicket = Array.isArray(lobby.completedTickets) && lobby.completedTickets.length > 0 
    ? lobby.completedTickets[lobby.completedTickets.length - 1] 
    : null;

  const victoryImage = '/images/victory.png';

  const copyResults = async () => {
    if (!lastCompletedTicket) return;
    
    try {
      const resultsText = `SCRUM MONSTERS Objective Complete!\n\n` +
        `📋 ${lastCompletedTicket.title}\n` +
        `📝 ${lastCompletedTicket.description}\n` +
        `📊 Story Points: ${lastCompletedTicket.storyPoints}\n\n` +
        `Team Estimates:\n` +
        (lastCompletedTicket.teamBreakdown?.developers?.participated ? 
          `👨‍💻 Developers: ${lastCompletedTicket.teamBreakdown.developers.consensusScore ?? '—'} pts\n` : '') +
        (lastCompletedTicket.teamBreakdown?.qa?.participated ? 
          `🧪 QA Engineers: ${lastCompletedTicket.teamBreakdown.qa.consensusScore ?? '—'} pts\n` : '') +
        `\nCompleted at: ${new Date(lastCompletedTicket.completedAt).toLocaleString()}\n` +
        `\nPowered by SCRUM MONSTERS 🎮`;
        
      await navigator.clipboard.writeText(resultsText);
      setResultsCopied(true);
      setTimeout(() => setResultsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy results:', err);
    }
  };

  const mainContent = (
    <div className="p-6">
      <div className="text-center">
        <RetroCard title="Objective Complete!">
          <div className="space-y-4">
            <div className="flex justify-center mb-4">
              <img 
                src={victoryImage} 
                alt="Boss Defeated!"
                className="w-24 h-24 pixelated"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <h2 className="text-xl font-bold text-green-400">
              Boss Defeated!
            </h2>
            
            {/* Show the completed ticket details */}
            {lastCompletedTicket && (
              <div className="bg-gray-800 border border-gray-600 rounded p-4 my-4">
                <div className="font-bold text-yellow-400 mb-2">{lastCompletedTicket.title}</div>
                <div className="text-sm text-gray-400 mb-3">{lastCompletedTicket.description}</div>
                
                {/* Team Score Breakdown for this ticket */}
                <div className="flex gap-4 justify-center">
                  {lastCompletedTicket.teamBreakdown?.developers?.participated ? (
                    <div className="bg-blue-900/50 border border-blue-500/30 rounded px-3 py-2">
                      <div className="text-sm text-blue-400 font-bold">👨‍💻 Developers</div>
                      <div className="text-xl font-bold text-blue-300">
                        {lastCompletedTicket.teamBreakdown.developers.consensusScore ?? '—'}
                      </div>
                      <div className="text-xs text-gray-400">Story Points</div>
                    </div>
                  ) : (
                    <div className="bg-gray-800/50 border border-gray-600/30 rounded px-3 py-2">
                      <div className="text-sm text-gray-500">👨‍💻 Developers</div>
                      <div className="text-xl text-gray-500">N/A</div>
                    </div>
                  )}
                  
                  {lastCompletedTicket.teamBreakdown?.qa?.participated ? (
                    <div className="bg-green-900/50 border border-green-500/30 rounded px-3 py-2">
                      <div className="text-sm text-green-400 font-bold">🧪 QA Engineers</div>
                      <div className="text-xl font-bold text-green-300">
                        {lastCompletedTicket.teamBreakdown.qa.consensusScore ?? '—'}
                      </div>
                      <div className="text-xs text-gray-400">Story Points</div>
                    </div>
                  ) : (
                    <div className="bg-gray-800/50 border border-gray-600/30 rounded px-3 py-2">
                      <div className="text-sm text-gray-500">🧪 QA Engineers</div>
                      <div className="text-xl text-gray-500">N/A</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <div className="text-sm text-gray-400">
              Progress: {lobby.completedTickets.length} / {lobby.tickets.length} Objectives Complete
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
                  onClick={() => emit('proceed_next_level')}
                  variant="primary"
                  className="flex-1 max-w-48"
                >
                  ⚔️ Next Battle
                </RetroButton>
              )}
            </div>
            
            {isTransitioning && (
              <div className="text-center text-xs text-gray-400 mt-2">
                Preparing next battle...
              </div>
            )}
          </div>
        </RetroCard>
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