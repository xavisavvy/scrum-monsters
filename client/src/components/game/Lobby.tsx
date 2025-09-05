import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { RetroButton } from '@/components/ui/retro-button';
import { RetroCard } from '@/components/ui/retro-card';
import { useWebSocket } from '@/lib/stores/useWebSocket';
import { useGameState } from '@/lib/stores/useGameState';
import { TEAM_NAMES, AVATAR_CLASSES, TeamType, JiraTicket } from '@/lib/gameTypes';

export function Lobby() {
  const [tickets, setTickets] = useState<JiraTicket[]>([]);
  const [newTicketTitle, setNewTicketTitle] = useState('');
  const { emit } = useWebSocket();
  const { currentLobby, currentPlayer, inviteLink } = useGameState();

  const isHost = currentPlayer?.isHost;

  const addTicket = () => {
    if (!newTicketTitle.trim()) return;
    
    // Split by comma and create multiple tickets
    const ticketTitles = newTicketTitle
      .split(',')
      .map(title => title.trim())
      .filter(title => title.length > 0);
    
    // Don't proceed if no valid tickets parsed
    if (ticketTitles.length === 0) return;
    
    // Filter out duplicates (case-insensitive)
    const existingTitles = new Set(tickets.map(t => t.title.toLowerCase()));
    const uniqueTitles = ticketTitles.filter(title => !existingTitles.has(title.toLowerCase()));
    
    const newTickets: JiraTicket[] = uniqueTitles.map(title => ({
      id: Math.random().toString(36).substring(2, 15),
      title,
      description: 'Jira ticket to be estimated by the team'
    }));
    
    // Use functional update to avoid race conditions
    setTickets(prev => [...prev, ...newTickets]);
    setNewTicketTitle('');
  };

  const removeTicket = (ticketId: string) => {
    setTickets(tickets.filter(t => t.id !== ticketId));
  };

  const startBattle = () => {
    if (tickets.length === 0) return;
    emit('start_battle', { tickets });
  };

  const changeTeam = (team: TeamType) => {
    // Only allow team changes in lobby phase
    if (currentLobby?.gamePhase !== 'lobby') return;
    
    emit('change_own_team', { team });
  };

  const copyInviteLink = () => {
    if (inviteLink) {
      navigator.clipboard.writeText(inviteLink);
      // Could add a toast notification here
    }
  };

  const renderPlayerSprite = (avatarClass: string) => {
    const avatar = AVATAR_CLASSES[avatarClass as keyof typeof AVATAR_CLASSES];
    return (
      <div
        className="w-6 h-6 rounded border border-gray-500"
        style={{ backgroundColor: avatar?.color || '#666' }}
      />
    );
  };

  if (!currentLobby) return null;

  return (
    <div className="retro-container">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold retro-text-glow mb-2">
            {currentLobby.name}
          </h1>
          <p className="text-gray-400">
            Lobby Code: <span className="retro-text-glow text-xl font-mono">{currentLobby.id}</span>
          </p>
          {inviteLink && (
            <div className="mt-4 space-y-4">
              {/* QR Code for easy mobile sharing */}
              <div className="bg-white p-4 rounded-lg inline-block">
                <QRCode
                  value={inviteLink}
                  size={128}
                  level="M"
                  includeMargin={true}
                />
              </div>
              <div className="text-xs text-gray-500">
                📱 Scan QR code to join on mobile
              </div>
              <div>
                <RetroButton size="sm" onClick={copyInviteLink}>
                  Copy Invite Link
                </RetroButton>
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Teams Section */}
          <div className="space-y-4">
            {/* Team Selection */}
            <RetroCard title="Choose Your Team">
              <div className="mb-4">
                <p className="text-sm text-gray-400 mb-3">
                  Select your role for this scrum session:
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {Object.entries(TEAM_NAMES).map(([teamKey, teamName]) => {
                    const team = teamKey as TeamType;
                    const isCurrentTeam = currentPlayer?.team === team;
                    
                    return (
                      <button
                        key={team}
                        onClick={() => changeTeam(team)}
                        className={`p-3 text-left rounded border-2 transition-all ${
                          isCurrentTeam 
                            ? 'border-blue-500 bg-blue-500 bg-opacity-20 text-blue-200' 
                            : 'border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-700'
                        }`}
                      >
                        <div className="font-medium">{teamName}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {team === 'developers' && 'Estimate story points and develop features'}
                          {team === 'qa' && 'Provide testing perspective and quality insights'}
                          {team === 'spectators' && 'Observe the session without voting'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </RetroCard>

            <RetroCard title="Battle Teams">
              {Object.entries(TEAM_NAMES).map(([teamKey, teamName]) => {
                const team = teamKey as TeamType;
                const teamPlayers = currentLobby.teams[team] || [];
                
                return (
                  <div key={team} className="team-section">
                    <h4 className="font-bold text-lg mb-2">{teamName}</h4>
                    <p className="text-sm text-gray-400 mb-3">
                      {teamPlayers.length} player{teamPlayers.length !== 1 ? 's' : ''}
                    </p>
                    
                    <div className="player-list">
                      {teamPlayers.map(player => (
                        <div
                          key={player.id}
                          className={`player-chip ${player.isHost ? 'host' : ''} ${
                            player.id === currentPlayer?.id ? 'border-blue-400' : ''
                          }`}
                        >
                          {renderPlayerSprite(player.avatar)}
                          <span>{player.name}</span>
                          {player.isHost && <span className="text-xs">(HOST)</span>}
                          {player.id === currentPlayer?.id && <span className="text-xs text-blue-400">(YOU)</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </RetroCard>
          </div>

          {/* Tickets Section */}
          <div>
            <RetroCard title="Battle Objectives">
              {isHost && (
                <div className="mb-4">
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newTicketTitle}
                      onChange={(e) => setNewTicketTitle(e.target.value)}
                      className="retro-input flex-1"
                      placeholder="Add tickets (use commas for multiple: JIRA-123, JIRA-456)..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTicket();
                        }
                      }}
                    />
                    <RetroButton onClick={addTicket} disabled={!newTicketTitle.trim()}>
                      Add
                    </RetroButton>
                  </div>
                  <p className="text-xs text-gray-300 mb-2">
                    💡 Tip: Enter multiple tickets separated by commas to add them all at once
                  </p>
                </div>
              )}
              
              <div className="space-y-2 mb-4">
                {tickets.map((ticket, index) => (
                  <div
                    key={ticket.id}
                    className="bg-gray-800 border border-gray-600 rounded p-3 flex justify-between items-center"
                  >
                    <div>
                      <span className="font-mono text-sm text-blue-400">#{index + 1}</span>
                      <span className="ml-2">{ticket.title}</span>
                    </div>
                    {isHost && (
                      <RetroButton
                        size="sm"
                        variant="accent"
                        onClick={() => removeTicket(ticket.id)}
                      >
                        Remove
                      </RetroButton>
                    )}
                  </div>
                ))}
              </div>
              
              {tickets.length === 0 && (
                <p className="text-center text-gray-400 py-8">
                  {isHost ? 'Add tickets to begin the battle' : 'Waiting for host to add tickets...'}
                </p>
              )}
              
              {isHost && tickets.length > 0 && (
                <RetroButton
                  onClick={startBattle}
                  className="w-full"
                  variant="accent"
                >
                  Begin Battle! ({tickets.length} ticket{tickets.length !== 1 ? 's' : ''})
                </RetroButton>
              )}
            </RetroCard>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-400">
            Players: {currentLobby.players.length} / 32
          </p>
          {!isHost && (
            <p className="text-sm text-gray-400 mt-2">
              Waiting for host to start the battle...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
