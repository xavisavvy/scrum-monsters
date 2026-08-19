import { Socket } from 'socket.io-client';
import { useEventSync } from '../stores/useEventSync';
import { useGameState } from '../stores/useGameState';
import { useAudio } from '../stores/useAudio';
import { Lobby, Player, Boss, TeamType, AvatarClass, GamePhase, TimerState, JiraTicket, TimerSettings, JiraSettings, EstimationSettings, ServerToClientEvents, ClientToServerEvents } from '@shared/gameEvents';
import { registerSyncedLobbyHandler, registerSyncedHandler, teardownSyncedHandlers } from './eventHandlerUtils';

// Phase 45-05: typed socket so payload shapes are inferred from the
// ServerToClientEvents map; removes the per-file no-explicit-any override.
export type TypedClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Sets up centralized event handlers for all domain events.
 * All events go through sequence tracking and gap detection.
 * State updates only occur when events are successfully processed.
 */
export function setupEventHandlers(socket: TypedClientSocket): void {
  // ============================================================================
  // SESSION DOMAIN EVENTS
  // ============================================================================

  // NON-STANDARD: complex Player construction + conditional teams[] push
  socket.on('session:player_joined', (data) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('session:player_joined', data, socket);

    if (processed) {
      const { currentLobby, setLobby } = useGameState.getState();
      if (currentLobby) {
        // Phase 45-05: schema marks data.avatar optional (new joiners may
        // not have selected one yet). Default to 'warrior' until the
        // session:avatar_selected event lands.
        const avatar: AvatarClass = data.avatar ?? 'warrior';
        const newPlayer: Player = {
          id: data.playerId,
          name: data.playerName,
          team: data.team,
          avatar,
          avatarClass: avatar,
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
          // Dedup by id — mirror the teams guard above. session:player_joined can
          // replay (reconnect/refresh re-sends presence), and without this guard the
          // player list grows a duplicate (e.g. the host seeing themselves twice).
          players: currentLobby.players.some(p => p.id === newPlayer.id)
            ? currentLobby.players
            : [...currentLobby.players, newPlayer],
          teams: updatedTeams,
        };
        setLobby(updatedLobby);
      }
    }
  });

  // Pure setLobby handlers — registerSyncedLobbyHandler
  registerSyncedLobbyHandler(socket, 'session:player_left', (data, lobby) => ({
    ...lobby,
    players: lobby.players.filter(p => p.id !== data.playerId),
    // Mirror the players[] removal in teams[*] so the Battle Teams
    // panel stops showing the player after they leave.
    teams: {
      developers: lobby.teams.developers.filter(p => p.id !== data.playerId),
      qa: lobby.teams.qa.filter(p => p.id !== data.playerId),
      spectators: lobby.teams.spectators.filter(p => p.id !== data.playerId),
    },
  }));

  registerSyncedLobbyHandler(socket, 'session:host_changed', (data, lobby) => ({
    ...lobby,
    hostId: data.newHostId,
    players: lobby.players.map(p => ({
      ...p,
      isHost: p.id === data.newHostId
    }))
  }));

  // MIXED: setLobby + requestBattleRemount
  registerSyncedHandler(socket, 'session:phase_changed', (data) => {
    const { currentLobby, setLobby, requestBattleRemount } = useGameState.getState();
    if (currentLobby) {
      const updatedLobby = {
        ...currentLobby,
        gamePhase: data.newPhase as GamePhase,
        ...(data.completedTickets !== undefined && { completedTickets: data.completedTickets }),
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
  });

  // MIXED: setLobby + setPlayer
  registerSyncedHandler(socket, 'session:team_changed', (data) => {
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
  });

  // MIXED: setLobby + setPlayer
  registerSyncedHandler(socket, 'session:avatar_selected', (data) => {
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
  });

  // --------------------------------------------------------------------------
  // Phase 42-02b: New fine-grained session events absorbing the retired
  // `lobby_updated` full-state push. Each handler routes through the
  // useEventSync seq gate, then applies a scoped setLobby update.
  // --------------------------------------------------------------------------

  registerSyncedLobbyHandler(socket, 'session:tickets_updated', (data, lobby) => ({
    ...lobby,
    tickets: data.tickets as JiraTicket[]
  }));

  registerSyncedLobbyHandler(socket, 'session:player_ready_changed', (data, lobby) => ({
    ...lobby,
    players: lobby.players.map(p =>
      p.id === data.playerId ? { ...p, isReady: !!data.isReady } : p
    ),
  }));

  registerSyncedLobbyHandler(socket, 'session:lobby_renamed', (data, lobby) => ({
    ...lobby,
    name: data.name
  }));

  registerSyncedLobbyHandler(socket, 'session:settings_updated', (data, lobby) => ({
    ...lobby,
    ...(data.timerSettings && { timerSettings: data.timerSettings as TimerSettings }),
    ...(data.jiraSettings && { jiraSettings: data.jiraSettings as JiraSettings }),
    ...(data.estimationSettings && { estimationSettings: data.estimationSettings as EstimationSettings }),
  }));

  // MIXED: full-state replace (no currentLobby guard — data.lobby IS the new lobby)
  registerSyncedHandler(socket, 'session:game_reset', (data) => {
    const { setLobby } = useGameState.getState();
    // Full-state replace — major reset (restart_game / proceed_next_level).
    setLobby(data.lobby as Lobby);
  });

  // MIXED: setLobby + requestBattleRemount
  registerSyncedHandler(socket, 'session:ticket_advanced', (data) => {
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
  });

  // ============================================================================
  // ESTIMATION DOMAIN EVENTS
  // ============================================================================

  registerSyncedLobbyHandler(socket, 'estimation:vote_cast', (data, lobby) => ({
    ...lobby,
    players: lobby.players.map(p =>
      p.id === data.playerId ? { ...p, hasSubmittedScore: true } : p
    )
  }));

  // MIXED: setLobby (multiple fields) + setPlayer
  registerSyncedHandler(socket, 'estimation:votes_revealed', (data) => {
    const { currentLobby, setLobby } = useGameState.getState();
    if (currentLobby) {
      // Canonical payload (schema): { votes: Record<playerId, score | '?'>, team: TeamType }
      // One event emitted per non-empty team server-side; merge votes for
      // the players belonging to data.team. The legacy `teamScores` fallback
      // was removed in Phase 45-03 when the legacy scores_revealed emit was deleted.
      const votesByPlayer: Record<string, number | '?'> | undefined = data?.votes;
      // Schema declares team as TeamType (which includes 'spectators'), but
      // votes_revealed is only ever emitted for 'developers' | 'qa'.
      const eventTeam = data?.team === 'spectators' ? undefined : data?.team;

      if (!votesByPlayer) return;

      const updatedPlayers = currentLobby.players.map(p => {
        // If event is team-scoped, only mutate that team's players.
        if (eventTeam && p.team !== eventTeam) return p;
        const score = votesByPlayer[p.id];
        return score !== undefined ? { ...p, currentScore: score } : p;
      });
      // Mirror scores into teams[*]: Discussion.tsx renders the vote grid from
      // currentLobby.teams.developers/qa, NOT players[]. Re-derive teams from
      // the updated players so the two collections can't drift (same invariant
      // the session:player_joined / player_left handlers maintain).
      const updatedLobby = {
        ...currentLobby,
        players: updatedPlayers,
        teams: {
          ...currentLobby.teams,
          developers: updatedPlayers.filter(p => p.team === 'developers'),
          qa: updatedPlayers.filter(p => p.team === 'qa'),
          spectators: updatedPlayers.filter(p => p.team === 'spectators'),
        },
      };
      setLobby(updatedLobby);

      // Keep the local player's own currentScore in sync — Discussion's
      // auto-select and "Current vote" echo read currentPlayer.currentScore.
      const { currentPlayer, setPlayer } = useGameState.getState();
      if (currentPlayer && (!eventTeam || currentPlayer.team === eventTeam)) {
        const mine = votesByPlayer[currentPlayer.id];
        if (mine !== undefined) {
          setPlayer({ ...currentPlayer, currentScore: mine });
        }
      }
    }
  });

  // NON-STANDARD: seq-guard only, NO state update
  socket.on('estimation:consensus_reached', (data) => {
    const { handleEvent } = useEventSync.getState();
    handleEvent('estimation:consensus_reached', data, socket);
    // State already updated via votes_revealed
  });

  // NON-STANDARD: seq-guard only, NO state update (defensive/forward-compat)
  socket.on('estimation:estimate_forced', (data) => {
    // Defensive/forward-looking: estimation:estimate_forced has no production
    // emitter today (only EstimationManager.forceEstimate, which has no live
    // socket caller). Still routed through handleEvent so the sequence counter
    // stays consistent and it isn't treated as a gap; there is no client state
    // field for a forced estimate, so there is nothing else to apply.
    useEventSync.getState().handleEvent('estimation:estimate_forced', data, socket);
  });

  registerSyncedLobbyHandler(socket, 'estimation:timer_started', (data, lobby) => {
    // Bridge sends {endsAt, durationMs} but not startedAt; derive it.
    const timerState: TimerState = {
      startedAt: data.endsAt - data.durationMs,
      durationMs: data.durationMs,
      isActive: true
    };
    return { ...lobby, currentTimer: timerState };
  });

  registerSyncedLobbyHandler(socket, 'estimation:timer_paused', (data, lobby) => {
    if (!lobby.currentTimer) return null;
    return {
      ...lobby,
      currentTimer: {
        ...lobby.currentTimer,
        isActive: false
      }
    };
  });

  registerSyncedLobbyHandler(socket, 'estimation:timer_resumed', (data, lobby) => {
    // Resume payload carries only endsAt; recompute the local timer
    // anchor at "now" for the remaining duration so countdown UIs
    // computing (Date.now() - startedAt) stay finite.
    const now = Date.now();
    const timerState: TimerState = {
      startedAt: now,
      durationMs: Math.max(0, data.endsAt - now),
      isActive: true
    };
    return { ...lobby, currentTimer: timerState };
  });

  registerSyncedLobbyHandler(socket, 'estimation:timer_expired', (_data, lobby) => ({
    ...lobby,
    currentTimer: undefined
  }));

  // NON-STANDARD: setDiscussionTimer (not setLobby)
  socket.on('estimation:discussion_timer_started', (data) => {
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

  // NON-STANDARD: setDiscussionTimer (not setLobby)
  socket.on('estimation:discussion_ended', (data) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('estimation:discussion_ended', data, socket);

    if (processed) {
      const { setDiscussionTimer } = useGameState.getState();
      setDiscussionTimer(null);
      // Phase transition is handled by session:phase_changed event.
    }
  });

  // MIXED: setLobby (players + teams) + setPlayer
  registerSyncedHandler(socket, 'estimation:discussion_vote_updated', (data) => {
    const { currentLobby, setLobby } = useGameState.getState();
    if (currentLobby) {
      // Mirror per-vote updates into BOTH players[] and teams[*] —
      // Discussion.tsx renders the live vote grid from teams.developers/qa,
      // so a players-only write would never show mid-discussion re-votes.
      const updatedPlayers = currentLobby.players.map(p =>
        p.id === data.playerId ? { ...p, currentScore: data.score as number | '?' } : p
      );
      setLobby({
        ...currentLobby,
        players: updatedPlayers,
        teams: {
          ...currentLobby.teams,
          developers: updatedPlayers.filter(p => p.team === 'developers'),
          qa: updatedPlayers.filter(p => p.team === 'qa'),
          spectators: updatedPlayers.filter(p => p.team === 'spectators'),
        },
      });
      // Keep currentPlayer in sync if this is the local player's vote.
      const { currentPlayer, setPlayer } = useGameState.getState();
      if (currentPlayer && currentPlayer.id === data.playerId) {
        setPlayer({ ...currentPlayer, currentScore: data.score as number | '?' });
      }
    }
  });

  // ============================================================================
  // COMBAT DOMAIN EVENTS
  // ============================================================================

  // MIXED: setBoss + setLobby
  registerSyncedHandler(socket, 'combat:boss_damaged', (data) => {
    // Phase 45-05B L4: also mirror to currentLobby.boss (the GamePage
    // boss_attacked handler used to do this; consolidated here).
    const { currentBoss, setBoss, currentLobby, setLobby } = useGameState.getState();
    const newHealth = data.newHp ?? currentBoss?.currentHealth;
    if (currentBoss) {
      const updatedBoss: Boss = { ...currentBoss, currentHealth: newHealth! };
      setBoss(updatedBoss);
    }
    if (currentLobby?.boss && newHealth !== undefined) {
      setLobby({ ...currentLobby, boss: { ...currentLobby.boss, currentHealth: newHealth } });
    }
  });

  // MIXED: setBoss + setLobby
  registerSyncedHandler(socket, 'combat:boss_healed', (data) => {
    const { currentBoss, setBoss, currentLobby, setLobby } = useGameState.getState();
    if (currentBoss) {
      setBoss({ ...currentBoss, currentHealth: data.newHp });
    }
    if (currentLobby?.boss) {
      setLobby({ ...currentLobby, boss: { ...currentLobby.boss, currentHealth: data.newHp } });
    }
  });

  // MIXED: setBoss + setLobby
  registerSyncedHandler(socket, 'combat:boss_defeated', (_data) => {
    const { currentBoss, setBoss, currentLobby, setLobby } = useGameState.getState();
    if (currentBoss) {
      setBoss({ ...currentBoss, defeated: true });
    }
    if (currentLobby?.boss) {
      setLobby({ ...currentLobby, boss: { ...currentLobby.boss, defeated: true } });
    }
  });

  // MIXED: setLobby + addPendingDamage (CRITICAL: addPendingDamage must not be dropped)
  registerSyncedHandler(socket, 'combat:player_damaged', (data) => {
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
  });

  registerSyncedLobbyHandler(socket, 'combat:player_downed', (data, lobby) => ({
    ...lobby,
    playerCombatStates: {
      ...lobby.playerCombatStates,
      [data.playerId]: {
        ...lobby.playerCombatStates[data.playerId],
        isDowned: true
      }
    }
  }));

  // MIXED: setLobby + clearRevivalSession
  registerSyncedHandler(socket, 'combat:player_revived', (data) => {
    const { currentLobby, setLobby, clearRevivalSession } = useGameState.getState();
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
    // Phase 45-04: clear the peer-visible revival channel state on completion.
    clearRevivalSession(data.playerId);
  });

  // Phase 45-04: revival channel UX for peers — NON-STANDARD (upsertRevivalSession)
  socket.on('combat:revival_started', (data) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:revival_started', data, socket);
    if (!processed) return;
    useGameState.getState().upsertRevivalSession({
      reviverId: data.reviverId,
      targetId: data.targetId,
      percent: 0,
      startedAt: Date.now(),
      durationMs: data.durationMs,
    });
  });

  // NON-STANDARD: updateRevivalProgress
  socket.on('combat:revival_progress', (data) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:revival_progress', data, socket);
    if (!processed) return;
    useGameState.getState().updateRevivalProgress(data.targetId, data.percent);
  });

  // NON-STANDARD: clearRevivalSession (target-level)
  socket.on('combat:revival_cancelled', (data) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:revival_cancelled', data, socket);
    if (!processed) return;
    useGameState.getState().clearRevivalSession(data.targetId);
  });

  // Phase 45-04: floating heal popup — MIXED: setLobby + addPendingDamage
  registerSyncedHandler(socket, 'combat:player_healed', (data) => {
    const { currentLobby, setLobby, addPendingDamage } = useGameState.getState();
    if (currentLobby) {
      const updatedLobby = {
        ...currentLobby,
        playerCombatStates: {
          ...currentLobby.playerCombatStates,
          [data.playerId]: {
            ...currentLobby.playerCombatStates[data.playerId],
            hp: data.newHp,
            // If this heal restored a downed player above 0 hp, lift the flag.
            isDowned: data.newHp > 0 ? false : currentLobby.playerCombatStates[data.playerId]?.isDowned,
          },
        },
      };
      setLobby(updatedLobby);
    }
    addPendingDamage({
      id: `heal-${data.playerId}-${data.seq ?? Date.now()}`,
      playerId: data.playerId,
      amount: data.healAmount,
      type: 'heal',
      position: {
        x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
        y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
      },
    });
  });

  registerSyncedLobbyHandler(socket, 'combat:modifier_updated', (data, lobby) => ({
    ...lobby,
    battleModifier: data.modifier
  }));

  // NON-STANDARD: setCountdown (not setLobby)
  socket.on('combat:countdown_started', (data) => {
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

  // NON-STANDARD: setCountdown (not setLobby)
  socket.on('combat:countdown_tick', (data) => {
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

  // NON-STANDARD: setCountdown + setTimeout
  socket.on('combat:countdown_complete', (data) => {
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

  // MIXED: setBoss only (no setLobby)
  registerSyncedHandler(socket, 'combat:team_attack', (data) => {
    const { currentBoss, setBoss } = useGameState.getState();
    if (currentBoss) {
      const updatedBoss: Boss = {
        ...currentBoss,
        currentHealth: data.newBossHp
      };
      setBoss(updatedBoss);
    }
  });

  // NON-STANDARD: setTelegraph + setTimeout
  socket.on('combat:boss_telegraph', (data) => {
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

  // NON-STANDARD: setBossEnraged
  socket.on('combat:boss_enraged', (data) => {
    const { handleEvent } = useEventSync.getState();
    const processed = handleEvent('combat:boss_enraged', data, socket);
    if (processed) {
      const { setBossEnraged } = useGameState.getState();
      setBossEnraged(data.message);
    }
  });

  // NON-STANDARD: setBossPhase (3-arg call)
  socket.on('combat:boss_phase_transition', (data) => {
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

  // NON-STANDARD: addMinion (no setLobby at all)
  socket.on('combat:minion_spawned', (data) => {
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

  // NON-STANDARD: seq-guard only, no state action
  socket.on('combat:minion_attack', (data) => {
    const { handleEvent } = useEventSync.getState();
    handleEvent('combat:minion_attack', data, socket);
    // Visual effects handled by UI components
  });

  // MIXED: setBoss only (registerSyncedHandler — seq-guard + store action)
  registerSyncedHandler(socket, 'combat:minion_heal_boss', (data) => {
    const { currentBoss, setBoss } = useGameState.getState();
    if (currentBoss) {
      const updatedBoss: Boss = {
        ...currentBoss,
        currentHealth: data.newBossHp
      };
      setBoss(updatedBoss);
    }
  });

  // MIXED: reads minions Map + addMinion (no setLobby)
  registerSyncedHandler(socket, 'combat:minion_damaged', (data) => {
    const { minions, addMinion } = useGameState.getState();
    const minion = minions.get(data.playerId);
    if (minion) {
      addMinion({
        ...minion,
        hp: data.newHp,
      });
    }
  });

  // NON-STANDARD: complex setTimeout + conditional removeMinion
  socket.on('combat:minion_killed', (data) => {
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
  // YOUTUBE SYNC (Phase 45-04)
  // ============================================================================

  // NON-STANDARD: useAudio — no seq-guard at all
  // Host plays YouTube music → all peers load and play the same video.
  socket.on('youtube_play_synced', (data) => {
    if (!data?.videoId) return;
    useAudio.getState().playYoutubeAudio(data.videoId);
  });

  // NON-STANDARD: useAudio — no seq-guard, no data
  socket.on('youtube_stop_synced', () => {
    useAudio.getState().stopYoutubeAudio();
  });

  // ============================================================================
  // SYSTEM EVENTS
  // ============================================================================

  // NON-STANDARD: handleFullStateRefresh (not handleEvent) + setLobby
  socket.on('system:full_state', (data) => {
    const { handleFullStateRefresh } = useEventSync.getState();
    const { setLobby } = useGameState.getState();

    handleFullStateRefresh(data.lobby, data.seq);
    setLobby(data.lobby);
  });

  // NON-STANDARD: handleMissedEventsReplay
  socket.on('system:missed_events', (data) => {
    const { handleMissedEventsReplay } = useEventSync.getState();
    // Schema declares `data.events[i].data` as `unknown` (true at the wire boundary);
    // useEventSync narrows back to `{ seq? } & Record<string, unknown>` for indexing.
    handleMissedEventsReplay(data.events as Array<{ event: string; data: { seq?: number } & Record<string, unknown> }>);
  });

  // Council H1: wire recovery re-dispatch. useEventSync's processEventQueue and
  // handleMissedEventsReplay call this to re-apply buffered / missed events
  // through their registered handlers above, so recovered state mutations land
  // (previously the payloads were discarded and only lastSeq advanced).
  useEventSync.getState().setReplayDispatch((event, data) => {
    const emitter = socket as unknown as { listeners(ev: string): Array<(payload: unknown) => void> };
    emitter.listeners(event).forEach((fn) => fn(data));
  });
}

/**
 * Removes all event listeners from the socket.
 * Call this when disconnecting or cleaning up.
 */
export function teardownEventHandlers(socket: Socket): void {
  // Tear down all handlers registered via registerSyncedLobbyHandler/registerSyncedHandler:
  teardownSyncedHandlers(socket as TypedClientSocket);

  // Explicit offs for non-standard handlers not registered via helpers:
  socket.off('session:player_joined');
  socket.off('estimation:consensus_reached');
  socket.off('estimation:estimate_forced');
  socket.off('estimation:discussion_timer_started');
  socket.off('estimation:discussion_ended');
  socket.off('combat:countdown_started');
  socket.off('combat:countdown_tick');
  socket.off('combat:countdown_complete');
  socket.off('combat:boss_telegraph');
  socket.off('combat:boss_enraged');
  socket.off('combat:boss_phase_transition');
  socket.off('combat:minion_spawned');
  socket.off('combat:minion_attack');
  socket.off('combat:minion_killed');
  socket.off('combat:revival_started');
  socket.off('combat:revival_progress');
  socket.off('combat:revival_cancelled');
  socket.off('youtube_play_synced');
  socket.off('youtube_stop_synced');
  socket.off('system:full_state');
  socket.off('system:missed_events');

  // Council H1: drop the recovery re-dispatch bridge — its closure captures
  // this socket, so clear it to avoid re-applying through a torn-down socket.
  useEventSync.getState().setReplayDispatch(null);
}
