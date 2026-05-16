import { Socket } from 'socket.io-client';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';
import { Lobby, Player, Boss, TeamType, AvatarClass, GamePhase, TimerState, JiraTicket, TimerSettings, JiraSettings, EstimationSettings } from '@shared/gameEvents';

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
          hasSubmittedScore: false,
          level: 1
        };
        // Also update currentLobby.teams[team] — the Battle Teams panel
        // reads from `teams[team]`, not `players`. Without this push the
        // host's team panel stays empty for the new joiner until they
        // explicitly pick a team (which fires session:team_changed and
        // does update teams). Skip if the player is already in the team
        // (idempotent in case the event replays).
        const team = data.team as TeamType | undefined;
        const updatedTeams = team && currentLobby.teams[team]
          ? {
              ...currentLobby.teams,
              [team]: currentLobby.teams[team].some(p => p.id === newPlayer.id)
                ? currentLobby.teams[team]
                : [...currentLobby.teams[team], newPlayer],
            }
          : currentLobby.teams;
        const updatedLobby = {
          ...currentLobby,
          players: [...currentLobby.players, newPlayer],
          teams: updatedTeams,
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
        // Mirror the players[] removal in teams[*] so the Battle Teams
        // panel stops showing the player after they leave.
        const updatedTeams = {
          developers: currentLobby.teams.developers.filter(p => p.id !== data.playerId),
          qa: currentLobby.teams.qa.filter(p => p.id !== data.playerId),
          spectators: currentLobby.teams.spectators.filter(p => p.id !== data.playerId),
        };
        const updatedLobby = {
          ...currentLobby,
          players: currentLobby.players.filter(p => p.id !== data.playerId),
          teams: updatedTeams,
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
      const { currentLobby, setLobby, requestBattleRemount } = useGameState.getState();
      if (currentLobby) {
        const updatedLobby = {
          ...currentLobby,
          gamePhase: data.newPhase as GamePhase
        };
        setLobby(updatedLobby);

        // Phase 42-02b Task 2: BattleScreen remount on phase entry to 'battle'
        // (formerly handled in GamePage.tsx:201-216 lobby_updated handler).
        if (
          data.oldPhase !== 'battle' &&
          data.newPhase === 'battle' &&
          typeof requestBattleRemount === 'function'
        ) {
          requestBattleRemount();
        }
      }
    }
  });

  socket.on('session:team_changed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:team_changed', data, socket);

    if (processed) {
      const { currentLobby, currentPlayer, setLobby, setPlayer } = useGameState.getState();
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

        // Also update currentPlayer if this is for the current player
        if (currentPlayer && currentPlayer.id === data.playerId) {
          setPlayer({ ...currentPlayer, team: data.newTeam as TeamType });
        }
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
          // Receipt of session:avatar_selected implies the player flipped
          // their hasSelectedAvatar gate on the server. Mirror that on the
          // client so GamePage.renderGamePhase() drops them out of the
          // AvatarSelection screen for all viewers (own player AND remote
          // peers, which is what the lobby roster cares about). See
          // .planning/debug/resolved/avatar-selection-skipped.md.
          players: currentLobby.players.map(p =>
            p.id === data.playerId
              ? { ...p, avatar: data.avatar as AvatarClass, avatarClass: data.avatar as AvatarClass, hasSelectedAvatar: true }
              : p
          )
        };
        setLobby(updatedLobby);

        // Also update currentPlayer if this is for the current player
        if (currentPlayer && currentPlayer.id === data.playerId) {
          setPlayer({ ...currentPlayer, avatar: data.avatar as AvatarClass, avatarClass: data.avatar as AvatarClass, hasSelectedAvatar: true });
        }
      }
    }
  });

  // --------------------------------------------------------------------------
  // Phase 42-02b: New fine-grained session events absorbing the retired
  // `lobby_updated` full-state push. Each handler routes through the
  // useEventSync seq gate, then applies a scoped setLobby update.
  // --------------------------------------------------------------------------

  socket.on('session:tickets_updated', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:tickets_updated', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        setLobby({ ...currentLobby, tickets: data.tickets as JiraTicket[] });
      }
    }
  });

  socket.on('session:player_ready_changed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:player_ready_changed', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        setLobby({
          ...currentLobby,
          players: currentLobby.players.map(p =>
            p.id === data.playerId ? { ...p, isReady: !!data.isReady } : p
          ),
        });
      }
    }
  });

  socket.on('session:lobby_renamed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:lobby_renamed', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        setLobby({ ...currentLobby, name: data.name });
      }
    }
  });

  socket.on('session:settings_updated', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:settings_updated', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        setLobby({
          ...currentLobby,
          ...(data.timerSettings && { timerSettings: data.timerSettings as TimerSettings }),
          ...(data.jiraSettings && { jiraSettings: data.jiraSettings as JiraSettings }),
          ...(data.estimationSettings && { estimationSettings: data.estimationSettings as EstimationSettings }),
        });
      }
    }
  });

  socket.on('session:game_reset', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:game_reset', data, socket);

    if (processed) {
      const { setLobby } = useGameState.getState();
      // Full-state replace — major reset (restart_game / proceed_next_level).
      setLobby(data.lobby as Lobby);
    }
  });

  socket.on('session:ticket_advanced', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:ticket_advanced', data, socket);

    if (processed) {
      const { currentLobby, setLobby, requestBattleRemount } = useGameState.getState();
      if (currentLobby) {
        // Reset per-ticket vote state on the client. Server resets these in
        // gameState.proceedNextLevel (see gameState.ts:858/889/929/1154) but
        // the fine-grained session:ticket_advanced payload only carries
        // currentTicket — without this reset, players stay marked as
        // hasSubmittedScore=true from the previous ticket and the vote-
        // indicator UI is wrong for the new ticket.
        setLobby({
          ...currentLobby,
          currentTicket: data.currentTicket as JiraTicket,
          players: currentLobby.players.map(p => ({
            ...p,
            hasSubmittedScore: false,
            currentScore: undefined,
          })),
        });
        // Phase 42-02b Task 2: BattleScreen mid-battle ticket-change remount
        // (formerly handled in GamePage.tsx:201-216 lobby_updated handler).
        if (currentLobby.gamePhase === 'battle' && typeof requestBattleRemount === 'function') {
          requestBattleRemount();
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
        // Canonical payload (shared/clientEvents.ts EstimationVotesRevealedEvent):
        //   { votes: Record<playerId, score | '?'>, team: TeamType }
        // One event is emitted per non-empty team server-side; merge votes for
        // the players belonging to data.team. Tolerate the legacy shape
        // ({ teamScores: { developers, qa } }) too, in case any older emit
        // site is still in the wild — harmless if absent.
        const votesByPlayer: Record<string, number | '?'> | undefined =
          data?.votes ?? data?.teamScores?.[data?.team] ?? undefined;
        const eventTeam: 'developers' | 'qa' | undefined = data?.team;

        if (!votesByPlayer) return;

        const updatedLobby = {
          ...currentLobby,
          players: currentLobby.players.map(p => {
            // If event is team-scoped, only mutate that team's players.
            if (eventTeam && p.team !== eventTeam) return p;
            const score = votesByPlayer[p.id];
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

  socket.on('estimation:discussion_timer_started', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:discussion_timer_started', data, socket);

    if (processed) {
      const { setDiscussionTimer } = useGameState.getState();
      setDiscussionTimer({
        active: true,
        endsAt: data.endsAt,
        durationMs: data.durationMs,
      });
    }
  });

  socket.on('estimation:discussion_ended', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:discussion_ended', data, socket);

    if (processed) {
      const { setDiscussionTimer } = useGameState.getState();
      setDiscussionTimer(null);
      // Phase transition is handled by session:phase_changed event.
    }
  });

  socket.on('estimation:discussion_vote_updated', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:discussion_vote_updated', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        // Mirror the existing per-vote update shape used by estimation:vote_cast
        // and the legacy lobby_updated discussion path.
        setLobby({
          ...currentLobby,
          players: currentLobby.players.map(p =>
            p.id === data.playerId ? { ...p, currentScore: data.score as number | '?' } : p
          ),
        });
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
          currentHealth: data.newHp ?? data.newHealth ?? currentBoss.currentHealth
        };
        setBoss(updatedBoss);
      }
    }
  });

  socket.on('combat:boss_healed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_healed', data, socket);

    if (processed) {
      const { currentBoss, setBoss, currentLobby, setLobby } = useGameState.getState();
      if (currentBoss) {
        setBoss({ ...currentBoss, currentHealth: data.newHealth });
      }
      if (currentLobby?.boss) {
        setLobby({ ...currentLobby, boss: { ...currentLobby.boss, currentHealth: data.newHealth } });
      }
    }
  });

  socket.on('combat:boss_defeated', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_defeated', data, socket);

    if (processed) {
      const { currentBoss, setBoss, currentLobby, setLobby } = useGameState.getState();
      if (currentBoss) {
        setBoss({ ...currentBoss, defeated: true });
      }
      if (currentLobby?.boss) {
        setLobby({ ...currentLobby, boss: { ...currentLobby.boss, defeated: true } });
      }
    }
  });

  socket.on('combat:player_damaged', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:player_damaged', data, socket);

    if (processed) {
      const { currentLobby, setLobby, addPendingDamage } = useGameState.getState();
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

      // Phase 42-01 (FIX-04): push floating damage popup event for client feedback.
      // Server-side damage path is unchanged; this is a perceptual signal only.
      addPendingDamage({
        id: `${data.playerId}-${data.seq ?? Date.now()}`,
        playerId: data.playerId,
        amount: data.damage,
        position: {
          x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
          y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
        },
      });
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

  socket.on('combat:countdown_started', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:countdown_started', data, socket);

    if (processed) {
      const { setCountdown } = useGameState.getState();
      setCountdown({
        active: true,
        remainingSeconds: data.durationSeconds,
        multiplier: 3.0,
      });
    }
  });

  socket.on('combat:countdown_tick', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:countdown_tick', data, socket);

    if (processed) {
      const { setCountdown } = useGameState.getState();
      setCountdown({
        active: true,
        remainingSeconds: data.remainingSeconds,
        multiplier: data.multiplier,
      });
    }
  });

  socket.on('combat:countdown_complete', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:countdown_complete', data, socket);

    if (processed) {
      const { setCountdown } = useGameState.getState();
      // Keep countdown visible briefly for team attack animation
      setCountdown({
        active: false,
        remainingSeconds: 0,
        multiplier: data.finalMultiplier,
      });

      // Clear after animation
      setTimeout(() => {
        useGameState.getState().setCountdown(null);
      }, 2000);
    }
  });

  socket.on('combat:team_attack', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:team_attack', data, socket);

    if (processed) {
      const { currentBoss, setBoss } = useGameState.getState();
      if (currentBoss) {
        const updatedBoss: Boss = {
          ...currentBoss,
          currentHealth: data.newBossHp
        };
        setBoss(updatedBoss);
      }
    }
  });

  socket.on('combat:boss_telegraph', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_telegraph', data, socket);
    if (processed) {
      const { setTelegraph } = useGameState.getState();
      setTelegraph({
        message: data.message,
        delayMs: data.delayMs,
        targetId: data.targetId,
        attackType: data.attackType,
        visualEffect: data.visualEffect || 'none',
        bossType: data.bossType,
      });
      // Auto-clear telegraph after duration
      setTimeout(() => {
        const { clearTelegraph } = useGameState.getState();
        clearTelegraph();
      }, data.delayMs + 500); // Extra 500ms for attack animation
    }
  });

  socket.on('combat:boss_enraged', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_enraged', data, socket);
    if (processed) {
      const { setBossEnraged } = useGameState.getState();
      setBossEnraged(data.message);
    }
  });

  socket.on('combat:boss_phase_transition', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_phase_transition', data, socket);
    if (processed) {
      const { setBossPhase } = useGameState.getState();
      setBossPhase(data.newPhase, data.message, data.bossType);
    }
  });

  // ============================================================================
  // MINION EVENTS
  // ============================================================================

  socket.on('combat:minion_spawned', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:minion_spawned', data, socket);

    if (processed) {
      const { addMinion } = useGameState.getState();
      addMinion({
        playerId: data.playerId,
        hp: data.hp,
        maxHp: data.maxHp,
        isAlive: true,
      });
    }
  });

  socket.on('combat:minion_attack', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    handleEvent('combat:minion_attack', data, socket);
    // Visual effects handled by UI components
  });

  socket.on('combat:minion_heal_boss', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:minion_heal_boss', data, socket);

    if (processed) {
      const { currentBoss, setBoss } = useGameState.getState();
      if (currentBoss) {
        const updatedBoss: Boss = {
          ...currentBoss,
          currentHealth: data.newBossHp
        };
        setBoss(updatedBoss);
      }
    }
  });

  socket.on('combat:minion_damaged', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:minion_damaged', data, socket);

    if (processed) {
      const { minions, addMinion } = useGameState.getState();
      const minion = minions.get(data.playerId);
      if (minion) {
        addMinion({
          ...minion,
          hp: data.newHp,
        });
      }
    }
  });

  socket.on('combat:minion_killed', (data: any) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:minion_killed', data, socket);

    if (processed) {
      const { minions, addMinion, removeMinion } = useGameState.getState();
      const minion = minions.get(data.playerId);
      if (minion) {
        addMinion({
          ...minion,
          hp: 0,
          isAlive: false,
        });

        // If respawn scheduled (respawnInSeconds > 0), minion will re-appear via minion_spawned
        // If no respawn (team switched), remove from map after animation
        if (data.respawnInSeconds === 0) {
          setTimeout(() => {
            removeMinion(data.playerId);
          }, 1000);
        }
      }
    }
  });

  // ============================================================================
  // SYSTEM EVENTS
  // ============================================================================

  socket.on('system:full_state', (data: any) => {
    const { handleFullStateRefresh } = useEventSync.getState();
    const { setLobby } = useGameState.getState();

    handleFullStateRefresh(data.lobby, data.seq);
    setLobby(data.lobby);
  });

  socket.on('system:missed_events', (data: any) => {
    const { handleMissedEventsReplay } = useEventSync.getState();

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
  // Phase 42-02b
  socket.off('session:tickets_updated');
  socket.off('session:player_ready_changed');
  socket.off('session:lobby_renamed');
  socket.off('session:settings_updated');
  socket.off('session:game_reset');
  socket.off('session:ticket_advanced');

  // Estimation events
  socket.off('estimation:vote_cast');
  socket.off('estimation:votes_revealed');
  socket.off('estimation:consensus_reached');
  socket.off('estimation:timer_started');
  socket.off('estimation:timer_paused');
  socket.off('estimation:timer_resumed');
  socket.off('estimation:timer_expired');
  socket.off('estimation:discussion_timer_started');
  socket.off('estimation:discussion_ended');
  // Phase 42-02b
  socket.off('estimation:discussion_vote_updated');

  // Combat events
  socket.off('combat:boss_damaged');
  socket.off('combat:boss_healed');
  socket.off('combat:boss_defeated');
  socket.off('combat:boss_telegraph');
  socket.off('combat:boss_enraged');
  socket.off('combat:boss_phase_transition');
  socket.off('combat:player_damaged');
  socket.off('combat:player_downed');
  socket.off('combat:player_revived');
  socket.off('combat:modifier_updated');
  socket.off('combat:countdown_started');
  socket.off('combat:countdown_tick');
  socket.off('combat:countdown_complete');
  socket.off('combat:team_attack');

  // Minion events
  socket.off('combat:minion_spawned');
  socket.off('combat:minion_attack');
  socket.off('combat:minion_heal_boss');
  socket.off('combat:minion_damaged');
  socket.off('combat:minion_killed');

  // System events
  socket.off('system:full_state');
  socket.off('system:missed_events');
}
