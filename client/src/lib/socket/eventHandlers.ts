import { Socket } from 'socket.io-client';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';
import { Lobby, Player, Boss, TeamType, AvatarClass, GamePhase, TimerState } from '@shared/gameEvents';

/**
 * Sets up centralized event handlers for all domain events.
 * All events go through sequence tracking and gap detection.
 * State updates only occur when events are successfully processed.
 */
export function setupEventHandlers(socket: Socket): void {
  // ============================================================================
  // SESSION DOMAIN EVENTS
  // ============================================================================

  socket.on('session:player_joined', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:player_joined', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const newPlayer: Player = {
          id: data.playerId,
          name: data.playerName,
          team: data.team,
          avatar: data.avatar,
          avatarClass: data.avatar,
          isHost: false,
          hasSubmittedScore: false
        };
        const updatedLobby = {
          ...currentLobby,
          players: [...currentLobby.players, newPlayer]
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('session:player_left', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:player_left', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          players: currentLobby.players.filter(p => p.id !== data.playerId)
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('session:host_changed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:host_changed', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          hostId: data.newHostId,
          players: currentLobby.players.map(p => ({
            ...p,
            isHost: p.id === data.newHostId
          }))
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('session:phase_changed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:phase_changed', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          gamePhase: data.newPhase as GamePhase
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('session:team_changed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:team_changed', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          players: currentLobby.players.map(p =>
            p.id === data.playerId ? { ...p, team: data.newTeam as TeamType } : p
          ),
          teams: {
            ...currentLobby.teams,
            [data.newTeam]: [
              ...(currentLobby.teams[data.newTeam as TeamType] || []),
              currentLobby.players.find(p => p.id === data.playerId)!
            ].filter(p => p),
            [data.oldTeam]: currentLobby.teams[data.oldTeam as TeamType]?.filter(p => p.id !== data.playerId) || []
          }
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('session:avatar_selected', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:avatar_selected', data, socket);

    if (processed) {
      const { currentLobby, currentPlayer, setLobby, setPlayer } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          players: currentLobby.players.map(p =>
            p.id === data.playerId ? { ...p, avatar: data.avatar as AvatarClass, avatarClass: data.avatar as AvatarClass } : p
          )
        };
        setLobby(updatedLobby);

        // Also update currentPlayer if this is for the current player
        if (currentPlayer && currentPlayer.id === data.playerId) {
          setPlayer({ ...currentPlayer, avatar: data.avatar as AvatarClass, avatarClass: data.avatar as AvatarClass });
        }
      }
    }
  });

  // ============================================================================
  // ESTIMATION DOMAIN EVENTS
  // ============================================================================

  socket.on('estimation:vote_cast', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:vote_cast', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          players: currentLobby.players.map(p =>
            p.id === data.playerId ? { ...p, hasSubmittedScore: true } : p
          )
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('estimation:votes_revealed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:votes_revealed', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        // Update players with revealed votes
        const updatedLobby = {
          ...currentLobby,
          players: currentLobby.players.map(p => {
            const playerTeam = p.team as 'developers' | 'qa';
            const teamScores = data.teamScores?.[playerTeam];
            const score = teamScores?.[p.id];
            return score !== undefined ? { ...p, currentScore: score } : p;
          })
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('estimation:consensus_reached', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    handleEvent('estimation:consensus_reached', data, socket);
    // State already updated via votes_revealed
  });

  socket.on('estimation:timer_started', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:timer_started', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const timerState: TimerState = {
          startedAt: data.startedAt,
          durationMs: data.durationMs,
          isActive: true
        };
        const updatedLobby = {
          ...currentLobby,
          currentTimer: timerState
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('estimation:timer_paused', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:timer_paused', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby && currentLobby.currentTimer) {
        const updatedLobby = {
          ...currentLobby,
          currentTimer: {
            ...currentLobby.currentTimer,
            isActive: false
          }
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('estimation:timer_resumed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:timer_resumed', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const timerState: TimerState = {
          startedAt: data.startedAt,
          durationMs: data.durationMs,
          isActive: true
        };
        const updatedLobby = {
          ...currentLobby,
          currentTimer: timerState
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('estimation:timer_expired', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:timer_expired', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          currentTimer: undefined
        };
        setLobby(updatedLobby);
      }
    }
  });

  // ============================================================================
  // COMBAT DOMAIN EVENTS
  // ============================================================================

  socket.on('combat:boss_damaged', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_damaged', data, socket);

    if (processed) {
      const { currentBoss, setBoss } = useGameState.getState();
      if (currentBoss) {
        const updatedBoss: Boss = {
          ...currentBoss,
          currentHealth: data.newHealth
        };
        setBoss(updatedBoss);
      }
    }
  });

  socket.on('combat:boss_healed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_healed', data, socket);

    if (processed) {
      const { currentBoss, setBoss } = useGameState.getState();
      if (currentBoss) {
        const updatedBoss: Boss = {
          ...currentBoss,
          currentHealth: data.newHealth
        };
        setBoss(updatedBoss);
      }
    }
  });

  socket.on('combat:boss_defeated', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_defeated', data, socket);

    if (processed) {
      const { currentBoss, setBoss } = useGameState.getState();
      if (currentBoss) {
        const updatedBoss: Boss = {
          ...currentBoss,
          defeated: true
        };
        setBoss(updatedBoss);
      }
    }
  });

  socket.on('combat:player_damaged', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:player_damaged', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          playerCombatStates: {
            ...currentLobby.playerCombatStates,
            [data.playerId]: {
              ...currentLobby.playerCombatStates[data.playerId],
              hp: data.newHp
            }
          }
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('combat:player_downed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:player_downed', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          playerCombatStates: {
            ...currentLobby.playerCombatStates,
            [data.playerId]: {
              ...currentLobby.playerCombatStates[data.playerId],
              isDowned: true
            }
          }
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('combat:player_revived', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:player_revived', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          playerCombatStates: {
            ...currentLobby.playerCombatStates,
            [data.playerId]: {
              ...currentLobby.playerCombatStates[data.playerId],
              isDowned: false,
              hp: data.newHp,
              revivedBy: data.reviverId
            }
          }
        };
        setLobby(updatedLobby);
      }
    }
  });

  socket.on('combat:modifier_updated', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:modifier_updated', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          battleModifier: data.modifier
        };
        setLobby(updatedLobby);
      }
    }
  });

  // ============================================================================
  // SYSTEM EVENTS
  // ============================================================================

  socket.on('system:full_state', (data: any) => {
    const { handleFullStateRefresh } = useEventSync.getState();
    const { setLobby } = useGameState.getState();

    console.log('[EventHandlers] Received full state refresh');
    handleFullStateRefresh(data.lobby, data.seq);
    setLobby(data.lobby);
  });

  socket.on('system:missed_events', (data: any) => {
    const { handleMissedEventsReplay } = useEventSync.getState();

    console.log(`[EventHandlers] Received ${data.events.length} missed events`);
    handleMissedEventsReplay(data.events);
  });
}

/**
 * Removes all event listeners from the socket.
 * Call this when disconnecting or cleaning up.
 */
export function teardownEventHandlers(socket: Socket): void {
  // Session events
  socket.off('session:player_joined');
  socket.off('session:player_left');
  socket.off('session:host_changed');
  socket.off('session:phase_changed');
  socket.off('session:team_changed');
  socket.off('session:avatar_selected');

  // Estimation events
  socket.off('estimation:vote_cast');
  socket.off('estimation:votes_revealed');
  socket.off('estimation:consensus_reached');
  socket.off('estimation:timer_started');
  socket.off('estimation:timer_paused');
  socket.off('estimation:timer_resumed');
  socket.off('estimation:timer_expired');

  // Combat events
  socket.off('combat:boss_damaged');
  socket.off('combat:boss_healed');
  socket.off('combat:boss_defeated');
  socket.off('combat:player_damaged');
  socket.off('combat:player_downed');
  socket.off('combat:player_revived');
  socket.off('combat:modifier_updated');

  // System events
  socket.off('system:full_state');
  socket.off('system:missed_events');

  console.log('[EventHandlers] All event handlers removed');
}
