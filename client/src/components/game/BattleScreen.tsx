import React, { useEffect, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BossDisplay } from './BossDisplay';
import { ScoreSubmission } from './ScoreSubmission';
import { Discussion } from './Discussion';
import { PlayerHUD } from './PlayerHUD';
import { EmoteModal } from './EmoteModal';
import { RetroCard } from '@/components/ui/retro-card';
import { RetroButton } from '@/components/ui/retro-button';
import { BossMusicControls } from '@/components/ui/BossMusicControls';
import { YoutubeAudioPlayer } from '@/components/ui/YoutubeAudioPlayer';
import { CinematicBackground } from '@/components/ui/CinematicBackground';
import { PlayerController } from './PlayerController';
// Team competition components for enhanced multiplayer experience
import { TeamScoreboard } from './TeamScoreboard';
import { TeamPerformanceTracker } from './TeamPerformanceTracker';
import { TeamCelebration } from './TeamCelebration';
import { TimerDisplay } from './TimerDisplay';
import { useGameState } from '@/lib/stores/useGameState';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useAudio } from '@/lib/stores/useAudio';
import { usePhaseVictoryImage } from '@/lib/victoryImages';
import { useViewport } from '@/lib/hooks/useViewport';

export function BattleScreen() {
  const { currentLobby, addAttackAnimation, currentPlayer } = useGameState();
  const { emit, socket } = useWebSocket();
  const { playHit, playSuccess, fadeInBossMusic, fadeOutBossMusic, stopBossMusic } = useAudio();
  const victoryImage = usePhaseVictoryImage(currentLobby?.gamePhase);
  const viewport = useViewport();
  
  
  // Collapsible sidebar state
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  
  // Copy button feedback states
  const [copyFeedback, setCopyFeedback] = useState<Record<string, boolean>>({});
  
  // Refs for timeout cleanup
  const timeoutRefs = useRef<Set<NodeJS.Timeout>>(new Set());

  // Helper function to render collapsible sidebar
  const renderCollapsibleSidebar = (content: React.ReactNode) => (
    <div className="fixed right-0 top-0 z-50" style={{ height: '80vh', marginTop: '10vh' }}>
      {/* Sidebar Panel */}
      <div
        className={`bg-black bg-opacity-95 border-l-2 border-retro-border border-t-2 border-b-2 h-full transition-all duration-300 ease-in-out overflow-hidden shadow-2xl ${
          sidebarExpanded ? 'w-[30vw]' : 'w-0'
        }`}
        data-no-shoot
      >
        <div className="h-full overflow-y-auto p-4 text-white">
          {content}
        </div>
      </div>
      
      {/* Toggle Button - Attached to sidebar edge */}
      <button
        onClick={() => setSidebarExpanded(!sidebarExpanded)}
        className="absolute bg-black bg-opacity-95 border-2 border-retro-accent rounded-l-lg p-3 hover:bg-opacity-100 hover:border-retro-accent-bright transition-all duration-300 shadow-2xl"
        style={{ 
          left: sidebarExpanded ? '-48px' : '-48px', // Always positioned at left edge of sidebar
          top: '60px' // Position below boss music controls
        }}
        data-no-shoot
        title={sidebarExpanded ? 'Hide Sidebar' : 'Show Sidebar'}
      >
        {sidebarExpanded ? (
          <ChevronRight className="w-5 h-5 text-retro-accent" />
        ) : (
          <ChevronLeft className="w-5 h-5 text-retro-accent" />
        )}
      </button>
    </div>
  );

  // Hide root page scrollbar during battle phases
  useEffect(() => {
    const battlePhases = ['battle', 'discussion', 'reveal'];
    const shouldHideScrollbar = battlePhases.includes(currentLobby?.gamePhase || '');
    
    if (shouldHideScrollbar) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [currentLobby?.gamePhase]);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all tracked timeouts to prevent DOM manipulation errors
      timeoutRefs.current.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      timeoutRefs.current.clear();
    };
  }, []);

  // Emote system state
  const [showEmoteModal, setShowEmoteModal] = useState(false);
  const [emotes, setEmotes] = useState<Record<string, {
    message: string;
    timestamp: number;
    x: number;
    y: number;
  }>>({});
  const playerPositionsRef = useRef<Record<string, { x: number, y: number }>>({});

  // Handle emote modal open event from PlayerController
  useEffect(() => {
    const handleOpenEmoteModal = () => {
      if (currentLobby?.gamePhase === 'battle') {
        setShowEmoteModal(true);
      }
    };

    window.addEventListener('openEmoteModal', handleOpenEmoteModal);
    return () => {
      window.removeEventListener('openEmoteModal', handleOpenEmoteModal);
    };
  }, [currentLobby?.gamePhase]);

  // Handle battle emotes from other players
  useEffect(() => {
    if (!socket) return;

    const handleBattleEmote = ({ playerId, message, x, y }: { 
      playerId: string; 
      message: string; 
      x: number; 
      y: number; 
    }) => {
      const timestamp = Date.now();
      setEmotes(prev => ({
        ...prev,
        [playerId]: { message, timestamp, x, y }
      }));

      // Auto-remove emote after 3.5 seconds
      const timeoutId = setTimeout(() => {
        setEmotes(prev => {
          const newEmotes = { ...prev };
          delete newEmotes[playerId];
          return newEmotes;
        });
        timeoutRefs.current.delete(timeoutId);
      }, 3500);
      timeoutRefs.current.add(timeoutId);
    };

    socket.on('battle_emote', handleBattleEmote);
    return () => {
      socket.off('battle_emote', handleBattleEmote);
    };
  }, [socket]);

  // Handle emote submission
  const handleEmoteSubmit = (message: string) => {
    if (!currentPlayer) return;

    // Get current player's actual screen position
    const myScreenPosition = playerPositionsRef.current[currentPlayer.id];
    const myPosition = myScreenPosition 
      ? {
          x: myScreenPosition.x,
          y: myScreenPosition.y
        }
      : { x: viewport.viewportWidth / 2, y: viewport.viewportHeight / 2 }; // Fallback to center if position not found

    // Emit emote to server
    emit('battle_emote', { message, x: myPosition.x, y: myPosition.y });
    
    // Show emote locally
    const timestamp = Date.now();
    setEmotes(prev => ({
      ...prev,
      [currentPlayer.id]: { 
        message, 
        timestamp, 
        x: myPosition.x, 
        y: myPosition.y
      }
    }));
    
    // Auto-remove emote after 3.5 seconds
    const timeoutId = setTimeout(() => {
      setEmotes(prev => {
        const newEmotes = { ...prev };
        delete newEmotes[currentPlayer.id];
        return newEmotes;
      });
      timeoutRefs.current.delete(timeoutId);
    }, 3500);
    timeoutRefs.current.add(timeoutId);
  };

  // Handle boss music when entering/leaving battle
  useEffect(() => {
    console.log('🎵 Boss music effect triggered. Phase:', currentLobby?.gamePhase, 'Has Boss:', !!currentLobby?.boss);
    if (currentLobby?.gamePhase === 'battle' && currentLobby?.boss) {
      console.log('🎵 Starting boss music...');
      // Fade in boss music when battle starts
      fadeInBossMusic();
    } else {
      console.log('🎵 Stopping boss music...');
      // Stop boss music when leaving battle
      stopBossMusic();
    }

    // Cleanup on unmount
    return () => {
      stopBossMusic();
    };
  }, [currentLobby?.gamePhase, fadeInBossMusic, stopBossMusic]); // Removed currentLobby?.boss dependency

  const handleBossAttack = () => {
    const damage = Math.floor(Math.random() * 50) + 10;
    
    // Add visual attack animation with consistent coordinate system (percentages)
    addAttackAnimation({
      id: Math.random().toString(36).substring(2, 15),
      playerId: 'current',
      damage,
      timestamp: Date.now(),
      x: Math.random() * 80 + 10, // 10-90% of viewport width
      y: Math.random() * 80 + 10  // 10-90% of viewport height
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
        if (!currentLobby?.boss) return null;
        return (
          <div key={`battle-${currentLobby.gamePhase}`} className="relative">
            {/* Fullscreen Boss Background */}
            <BossDisplay boss={currentLobby.boss} onAttack={handleBossAttack} fullscreen />
            
            {/* Collapsible Sidebar */}
            {renderCollapsibleSidebar(<ScoreSubmission />)}

            {/* Timer Display - Top Left */}
            <TimerDisplay />
            
            {/* Boss Music Controls - Top Right */}
            <div className="absolute top-6 right-6 z-40" data-no-shoot>
              <BossMusicControls />
            </div>

            {/* Player Character Controller */}
            <div className="absolute inset-0 z-70" style={{ pointerEvents: 'auto' }}>
              <PlayerController 
                onPlayerPositionsUpdate={(positions) => {
                  playerPositionsRef.current = positions;
                }}
              />
            </div>

            {/* Team Competition Components */}
            <TeamPerformanceTracker />
            <TeamCelebration />
          </div>
        );

      case 'reveal':
        return (
          <div key={`reveal-${currentLobby.gamePhase}`} className="text-center p-6">
            <RetroCard title="Revealing Estimates...">
              <div className="space-y-4">
                <div className="text-2xl">⏳</div>
                <p>Calculating team consensus...</p>
              </div>
            </RetroCard>
          </div>
        );

      case 'discussion':
        if (!currentLobby?.boss) return null;
        return (
          <div key={`discussion-${currentLobby.gamePhase}`} className="relative">
            {/* Fullscreen Boss Background */}
            <BossDisplay boss={currentLobby.boss} onAttack={handleBossAttack} fullscreen />
            
            {/* Collapsible Sidebar */}
            {renderCollapsibleSidebar(<Discussion />)}

            {/* Timer Display - Top Left */}
            <TimerDisplay />
            
            {/* Boss Music Controls - Top Right */}
            <div className="absolute top-6 right-6 z-40" data-no-shoot>
              <BossMusicControls />
            </div>

            {/* Team Competition Components */}
            <TeamPerformanceTracker />
            <TeamCelebration />
          </div>
        );

      case 'victory':
        const completedTickets = Array.isArray(currentLobby.completedTickets) ? currentLobby.completedTickets : [];
        const totalStoryPoints = completedTickets.reduce((sum, ticket) => sum + ticket.storyPoints, 0);
        
        // Calculate story points by team
        const devStoryPoints = completedTickets.reduce((sum, ticket) => 
          ticket.teamBreakdown?.developers?.participated ? sum + (ticket.teamBreakdown.developers.consensusScore ?? 0) : sum, 0
        );
        const qaStoryPoints = completedTickets.reduce((sum, ticket) => 
          ticket.teamBreakdown?.qa?.participated ? sum + (ticket.teamBreakdown.qa.consensusScore ?? 0) : sum, 0
        );
        
        return (
          <div key={`victory-${currentLobby.gamePhase}`} className="relative">
            {/* Cinematic Background - same as start screen */}
            <CinematicBackground />
            
            <div className="relative z-20 p-6">
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
                    Total Objectives: {currentLobby.tickets.length} • Total Story Points: {totalStoryPoints}
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
                          <div className="font-bold">
                            {currentLobby.jiraSettings?.baseUrl ? (
                              <a
                                href={`${currentLobby.jiraSettings.baseUrl}${ticket.title}`}
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
                        
                        {/* Team Score Breakdown */}
                        <div className="mt-2 space-y-1">
                          <div className="text-xs text-gray-400">Team Estimates:</div>
                          <div className="flex gap-2 justify-end">
                            {ticket.teamBreakdown?.developers?.participated ? (
                              <div className="bg-blue-900/50 border border-blue-500/30 rounded px-2 py-1">
                                <div className="text-xs text-blue-400 font-bold">👨‍💻 Dev</div>
                                <div className="text-sm font-bold text-blue-300">
                                  {ticket.teamBreakdown.developers.consensusScore ?? '—'}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-gray-800/50 border border-gray-600/30 rounded px-2 py-1">
                                <div className="text-xs text-gray-500">👨‍💻 Dev</div>
                                <div className="text-sm text-gray-500">N/A</div>
                              </div>
                            )}
                            
                            {ticket.teamBreakdown?.qa?.participated ? (
                              <div className="bg-green-900/50 border border-green-500/30 rounded px-2 py-1">
                                <div className="text-xs text-green-400 font-bold">🧪 QA</div>
                                <div className="text-sm font-bold text-green-300">
                                  {ticket.teamBreakdown.qa.consensusScore ?? '—'}
                                </div>
                              </div>
                            ) : (
                              <div className="bg-gray-800/50 border border-gray-600/30 rounded px-2 py-1">
                                <div className="text-xs text-gray-500">🧪 QA</div>
                                <div className="text-sm text-gray-500">N/A</div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="border-t border-gray-600 pt-4 text-center">
                  <div className="text-lg font-bold">
                    Total Story Points Completed: 
                    <span className="text-yellow-400 ml-2">{totalStoryPoints}</span>
                  </div>
                  
                  {/* Host Copy All Results Button */}
                  {currentPlayer?.isHost && completedTickets.length > 0 && (
                    <div className="mt-4">
                      <RetroButton
                        onClick={() => {
                          const allResults = completedTickets.map(ticket => {
                            const devScore = ticket.teamBreakdown?.developers?.consensusScore ?? 'N/A';
                            const qaScore = ticket.teamBreakdown?.qa?.consensusScore ?? 'N/A';
                            const combinedValue = ticket.storyPoints;
                            return `${ticket.title} - Developers voted ${devScore} QA voted ${qaScore}, with a combined sprint value of ${combinedValue}`;
                          }).join('\n');
                          
                          const summaryText = `${allResults}\n\nTotal Story Points: ${totalStoryPoints}`;
                          
                          navigator.clipboard.writeText(summaryText).then(() => {
                            console.log('✅ All results copied to clipboard:', summaryText);
                            // Show temporary success feedback using React state
                            setCopyFeedback(prev => ({ ...prev, victory: true }));
                            const timeoutId = setTimeout(() => {
                              setCopyFeedback(prev => ({ ...prev, victory: false }));
                              timeoutRefs.current.delete(timeoutId);
                            }, 2000);
                            timeoutRefs.current.add(timeoutId);
                          }).catch(err => {
                            console.error('❌ Failed to copy to clipboard:', err);
                          });
                        }}
                        className="w-full"
                        variant="secondary"
                      >
                        {copyFeedback.victory ? '✅ Copied!' : '📋 Copy All Results (Host)'}
                      </RetroButton>
                    </div>
                  )}
                </div>
              </div>
            </RetroCard>
            </div>
          </div>
        );

      case 'next_level':
        const lastCompletedTicket = Array.isArray(currentLobby.completedTickets) && currentLobby.completedTickets.length > 0 
          ? currentLobby.completedTickets[currentLobby.completedTickets.length - 1] 
          : null;
        
        return (
          <div key={`next_level-${currentLobby.gamePhase}`} className="relative">
            {/* Cinematic Background - same as start screen */}
            <CinematicBackground />
            
            <div className="relative z-20 p-6">
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
                    
                    <div className="mt-3 text-lg">
                      <span className="text-gray-400">Final Score: </span>
                      <span className="text-yellow-400 font-bold">{lastCompletedTicket.storyPoints}</span>
                      <span className="text-gray-400"> Story Points</span>
                    </div>
                  </div>
                )}
                
                <p>
                  Progress: {Array.isArray(currentLobby.completedTickets) ? currentLobby.completedTickets.length : 0} / {currentLobby.tickets.length}
                </p>
                <p className="text-sm text-gray-400">
                  Waiting for host to proceed to next level...
                </p>
                
                {/* Host Copy Results Button */}
                {currentPlayer?.isHost && lastCompletedTicket && (
                  <div className="mt-4 pt-4 border-t border-gray-600">
                    <RetroButton
                      onClick={() => {
                        const devScore = lastCompletedTicket.teamBreakdown?.developers?.consensusScore ?? 'N/A';
                        const qaScore = lastCompletedTicket.teamBreakdown?.qa?.consensusScore ?? 'N/A';
                        const combinedValue = lastCompletedTicket.storyPoints;
                        
                        const resultsText = `${lastCompletedTicket.title} - Developers voted ${devScore} QA voted ${qaScore}, with a combined sprint value of ${combinedValue}`;
                        
                        navigator.clipboard.writeText(resultsText).then(() => {
                          console.log('✅ Results copied to clipboard:', resultsText);
                          // Show temporary success feedback using React state
                          setCopyFeedback(prev => ({ ...prev, nextLevel: true }));
                          const timeoutId = setTimeout(() => {
                            setCopyFeedback(prev => ({ ...prev, nextLevel: false }));
                            timeoutRefs.current.delete(timeoutId);
                          }, 2000);
                          timeoutRefs.current.add(timeoutId);
                        }).catch(err => {
                          console.error('❌ Failed to copy to clipboard:', err);
                        });
                      }}
                      className="w-full"
                      variant="secondary"
                    >
                      {copyFeedback.nextLevel ? '✅ Copied!' : '📋 Copy Results (Host)'}
                    </RetroButton>
                  </div>
                )}
                  </div>
                </RetroCard>
              </div>
            </div>
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
    <div className="battle-screen relative">
      {renderGamePhase()}
      <div className="relative z-45">
        <PlayerHUD />
      </div>

      {/* Emote Display Bubbles */}
      {Object.entries(emotes).map(([playerId, emote]) => {
        // Convert stored screen position to CSS position for display
        const screenX = emote.x;
        const screenY = emote.y;
        
        return (
          <div
            key={playerId}
            className="absolute z-50 pointer-events-none animate-bounce"
            style={{
              left: `${screenX}px`,
              top: `${screenY - 80}px`, // Position above character (character is ~60px tall)
              transform: 'translateX(-50%)' // Center horizontally on character
            }}
          >
            <div className="bg-white bg-opacity-95 rounded-lg px-3 py-2 shadow-lg border-2 border-gray-300 max-w-xs">
              <div className="text-black text-sm font-bold break-words">
                {emote.message}
              </div>
              <div 
                className="absolute top-full left-1/2 transform -translate-x-1/2
                           w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] 
                           border-l-transparent border-r-transparent border-t-white"
              />
            </div>
          </div>
        );
      })}

      {/* Emote Modal */}
      <EmoteModal 
        isOpen={showEmoteModal}
        onClose={() => setShowEmoteModal(false)}
        onSubmit={handleEmoteSubmit}
      />

      {/* E Key Hint - only show during battle */}
      {currentLobby?.gamePhase === 'battle' && (
        <div className="absolute top-20 left-6 z-40" data-no-shoot>
          <div className="bg-purple-900 bg-opacity-70 rounded-lg px-3 py-2 border border-purple-400">
            <div className="text-purple-200 font-bold text-sm flex items-center gap-2">
              <span className="bg-purple-600 px-2 py-1 rounded text-xs font-mono">E</span>
              Emote
            </div>
          </div>
        </div>
      )}

      {/* YouTube Audio Player (hidden) */}
      <YoutubeAudioPlayer />
    </div>
  );
}
