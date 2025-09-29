import React from 'react';
import { PhaseContainer } from './PhaseContainer';
import { PhaseComponentProps } from './index';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';
import { ScoreSubmission } from '../ScoreSubmission';

interface GameOverPhaseProps extends PhaseComponentProps {}

export function GameOverPhase({
  lobby,
  currentPlayer,
  emit,
  isTransitioning = false
}: GameOverPhaseProps) {
  
  const currentTicket = lobby.currentTicket;
  const currentTicketIndex = lobby.tickets.findIndex(t => t.id === currentTicket?.id);
  
  // Boss images mapping
  const BOSS_IMAGE_MAP: Record<string, string> = {
    'bug-hydra.png': '/images/bosses/bug-hydra.png',
    'sprint-demon.png': '/images/bosses/sprint-demon.png',
    'deadline-dragon.png': '/images/bosses/deadline-dragon.png',
    'technical-debt-golem.png': '/images/bosses/technical-debt-golem.png',
    'scope-creep-beast.png': '/images/bosses/scope-creep-beast.png',
  };
  
  const bossImage = lobby.boss?.sprite ? BOSS_IMAGE_MAP[lobby.boss.sprite] || '/images/defeat.png' : '/images/defeat.png';

  const mainContent = (
    <div className="p-6 max-h-screen overflow-y-auto">
      <div className="text-center mb-6">
        <RetroCard>
          <div className="space-y-6">
            {/* Large Boss Image */}
            <div className="flex justify-center mb-6">
              <img 
                src={bossImage} 
                alt="Boss"
                className="w-64 h-64 pixelated animate-pulse"
                style={{ imageRendering: 'pixelated' }}
                onError={(e) => {
                  // Fallback if image doesn't exist
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            
            {/* Total Party Kill Text */}
            <div className="space-y-4">
              <h1 className="text-5xl font-bold retro-text-glow text-red-500 uppercase tracking-wider">
                💀 Total Party Kill 💀
              </h1>
              <h2 className="text-2xl font-bold text-red-400">
                All Team Members Down!
              </h2>
              <p className="text-lg text-gray-300">
                {lobby.boss?.name ? `${lobby.boss.name} has proven too powerful...` : 'The boss has proven too powerful...'}
              </p>
              <p className="text-sm text-gray-400">
                You can still vote on the story points estimate!
              </p>
            </div>
            
            {/* Try Again Button - Host Only */}
            {currentPlayer?.isHost && (
              <div className="mt-6">
                <RetroButton 
                  onClick={() => emit('return_to_lobby')}
                  variant="primary"
                  className="px-8 py-4 text-xl"
                >
                  🔄 Try Again
                </RetroButton>
                <p className="text-xs text-gray-500 mt-2">
                  Return to lobby and prepare for another attempt
                </p>
              </div>
            )}
            
            {!currentPlayer?.isHost && (
              <p className="text-sm text-gray-500 mt-4">
                Waiting for host to decide next steps...
              </p>
            )}
          </div>
        </RetroCard>
      </div>

      {/* Current Ticket Information */}
      {currentTicket && (
        <RetroCard title="Current Objective" className="max-w-4xl mx-auto mb-6">
          <div className="space-y-4">
            <div className="bg-gray-800 border border-gray-600 rounded p-4">
              <div className="font-mono text-sm text-blue-400 mb-2">
                Ticket #{currentTicketIndex >= 0 ? currentTicketIndex + 1 : '?'} of {lobby.tickets.length}
              </div>
              <div className="font-bold text-lg mb-2">
                {lobby.jiraSettings?.baseUrl ? (
                  <a
                    href={`${lobby.jiraSettings.baseUrl}${currentTicket.title}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white hover:text-blue-300 hover:underline"
                  >
                    {currentTicket.title}
                  </a>
                ) : (
                  currentTicket.title
                )}
              </div>
              <div className="text-sm text-gray-400">{currentTicket.description}</div>
            </div>
          </div>
        </RetroCard>
      )}

      {/* Score Submission - Still Available During Game Over */}
      {currentPlayer && (currentPlayer.team === 'developers' || currentPlayer.team === 'qa') && (
        <div className="max-w-4xl mx-auto">
          <RetroCard title="Submit Your Estimate">
            <div className="space-y-4">
              <p className="text-sm text-gray-400 text-center">
                Even in defeat, your estimation matters. Submit your story points.
              </p>
              <ScoreSubmission />
            </div>
          </RetroCard>
        </div>
      )}

      {isTransitioning && (
        <div className="text-center text-xs text-gray-400 mt-4">
          Transitioning to next phase...
        </div>
      )}
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
