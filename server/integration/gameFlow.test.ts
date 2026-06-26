import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ScopedEventBus } from '../events/ScopedEventBus';
import { CombatManager } from '../domains/CombatManager';
import { EstimationManager } from '../domains/EstimationManager';

describe('Game Flow Integration', () => {
  let eventBus: ScopedEventBus;
  let combatManager: CombatManager;
  let estimationManager: EstimationManager;

  beforeEach(() => {
    eventBus = new ScopedEventBus();
    combatManager = new CombatManager({ eventBus });
    estimationManager = new EstimationManager({ eventBus });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Battle to Discussion Transition', () => {
    it('completes full estimation -> battle -> discussion cycle', () => {
      const lobbyId = 'test-lobby';
      const players = [
        { id: 'player1', team: 'developers' as const },
        { id: 'player2', team: 'qa' as const },
      ];

      // Initialize combat and estimation
      combatManager.initializeCombat(lobbyId, players, 0);
      estimationManager.startEstimation(lobbyId, 'ticket-1');
      // Add both dev and QA voters
      players.forEach(p => estimationManager.addEligibleVoter(lobbyId, p.id, p.team));

      // Track events
      const events: string[] = [];
      eventBus.on('estimation:full_consensus_reached', () => { events.push('consensus'); });
      eventBus.on('combat:countdown_started', () => { events.push('countdown_started'); });
      eventBus.on('combat:countdown_complete', () => { events.push('countdown_complete'); });
      eventBus.on('combat:battle_complete', () => { events.push('battle_complete'); });
      eventBus.on('estimation:discussion_timer_started', () => { events.push('discussion_started'); });

      // Both teams vote same value - need consensus from both teams
      estimationManager.castVote(lobbyId, 'player1', 'developers', 5);
      estimationManager.castVote(lobbyId, 'player2', 'qa', 5);

      // Allow time for consensus delay (2.5s)
      vi.advanceTimersByTime(3000);

      // Should trigger countdown after full consensus
      expect(events).toContain('consensus');
      expect(events).toContain('countdown_started');

      // Fast-forward through countdown (10s + team attack delay 500ms + some buffer)
      vi.advanceTimersByTime(11000);

      expect(events).toContain('countdown_complete');
      expect(events).toContain('battle_complete');
      expect(events).toContain('discussion_started');
    });

    it('battle_complete event triggers discussion phase', () => {
      const lobbyId = 'test-lobby';

      // Start estimation (needed for discussion phase)
      estimationManager.startEstimation(lobbyId, 'ticket-1');
      estimationManager.addEligibleVoter(lobbyId, 'player1', 'developers');
      estimationManager.castVote(lobbyId, 'player1', 'developers', 5);

      // Track events
      const events: any[] = [];
      eventBus.on('estimation:discussion_timer_started', (data) => { events.push(data); });

      // Emit battle_complete directly
      eventBus.emit('combat:battle_complete', { lobbyId });

      // Discussion should start
      expect(events).toHaveLength(1);
      expect(events[0].lobbyId).toBe(lobbyId);
      expect(events[0].durationMs).toBe(2 * 60 * 1000); // 2 minutes default
    });
  });

  describe('Minion System', () => {
    it('spawns minions for spectators', () => {
      const lobbyId = 'test-lobby';
      const players = [
        { id: 'voter1', team: 'developers' as const },
        { id: 'voter2', team: 'developers' as const },
        { id: 'spectator1', team: 'spectators' as const },
      ];

      const spawnEvents: any[] = [];
      eventBus.on('combat:minion_spawned', (data) => { spawnEvents.push(data); });

      combatManager.initializeCombat(lobbyId, players, 0);

      // Spectator should spawn as minion
      expect(spawnEvents).toHaveLength(1);
      expect(spawnEvents[0].playerId).toBe('spectator1');
      expect(spawnEvents[0].hp).toBeGreaterThan(0);
    });

    it('kills minion when spectator switches to voter', () => {
      const lobbyId = 'test-lobby';
      const players = [
        { id: 'voter1', team: 'developers' as const },
        { id: 'spectator1', team: 'spectators' as const },
      ];

      const killEvents: any[] = [];
      eventBus.on('combat:minion_killed', (data) => { killEvents.push(data); });

      combatManager.initializeCombat(lobbyId, players, 0);

      // Switch spectator to voter
      combatManager.handleSpectatorSwitchToVoter(lobbyId, 'spectator1');

      expect(killEvents).toHaveLength(1);
      expect(killEvents[0].playerId).toBe('spectator1');
      expect(killEvents[0].respawnInSeconds).toBe(0); // No respawn
    });

    it('allows player to attack and damage minion', () => {
      const lobbyId = 'test-lobby';
      const players = [
        { id: 'voter1', team: 'developers' as const },
        { id: 'spectator1', team: 'spectators' as const },
      ];

      combatManager.initializeCombat(lobbyId, players, 0);

      // Get initial minion HP
      const combatState = combatManager.getCombatState(lobbyId);
      const minion = combatState?.minions.get('spectator1');
      const initialHp = minion?.hp ?? 0;

      // Attack minion
      const damage = combatManager.playerAttackMinion(lobbyId, 'voter1', 'spectator1');

      expect(damage).toBeGreaterThan(0);
      expect(minion?.hp).toBeLessThan(initialHp);
    });
  });

  describe('Countdown System', () => {
    it('starts countdown when full consensus reached', () => {
      const lobbyId = 'test-lobby';
      const players = [
        { id: 'player1', team: 'developers' as const },
        { id: 'player2', team: 'qa' as const },
      ];

      // Initialize
      combatManager.initializeCombat(lobbyId, players, 0);
      estimationManager.startEstimation(lobbyId, 'ticket-1');
      estimationManager.addEligibleVoter(lobbyId, 'player1', 'developers');
      estimationManager.addEligibleVoter(lobbyId, 'player2', 'qa');

      const countdownEvents: any[] = [];
      eventBus.on('combat:countdown_started', (data) => { countdownEvents.push(data); });

      // Both teams need to vote for full consensus
      estimationManager.castVote(lobbyId, 'player1', 'developers', 5);
      estimationManager.castVote(lobbyId, 'player2', 'qa', 5);

      // Wait for consensus delay
      vi.advanceTimersByTime(3000);

      expect(countdownEvents).toHaveLength(1);
      expect(countdownEvents[0].durationSeconds).toBe(10);
    });

    it('emits tick events with decreasing multiplier', () => {
      const lobbyId = 'test-lobby';
      const players = [
        { id: 'player1', team: 'developers' as const },
        { id: 'player2', team: 'qa' as const },
      ];

      combatManager.initializeCombat(lobbyId, players, 0);
      estimationManager.startEstimation(lobbyId, 'ticket-1');
      estimationManager.addEligibleVoter(lobbyId, 'player1', 'developers');
      estimationManager.addEligibleVoter(lobbyId, 'player2', 'qa');

      const tickEvents: any[] = [];
      eventBus.on('combat:countdown_tick', (data) => { tickEvents.push(data); });

      // Both teams vote for full consensus
      estimationManager.castVote(lobbyId, 'player1', 'developers', 5);
      estimationManager.castVote(lobbyId, 'player2', 'qa', 5);
      vi.advanceTimersByTime(3000); // Wait for consensus delay

      // Advance through some ticks
      vi.advanceTimersByTime(3000); // 3 seconds of ticks

      expect(tickEvents.length).toBeGreaterThanOrEqual(2);

      // Verify multiplier decreases over time
      if (tickEvents.length >= 2) {
        expect(tickEvents[0].multiplier).toBeGreaterThan(tickEvents[1].multiplier);
      }
    });
  });

  describe('Combat State Management', () => {
    it('getCombatState returns undefined for non-existent lobby', () => {
      const state = combatManager.getCombatState('non-existent');
      expect(state).toBeUndefined();
    });

    it('cleanupLobby removes combat state and clears timers', () => {
      const lobbyId = 'test-lobby';
      const players = [
        { id: 'player1', team: 'developers' as const },
      ];

      combatManager.initializeCombat(lobbyId, players, 0);

      // Verify state exists
      expect(combatManager.getCombatState(lobbyId)).toBeDefined();

      // Cleanup
      combatManager.cleanupLobby(lobbyId);

      // Verify state removed
      expect(combatManager.getCombatState(lobbyId)).toBeUndefined();
    });
  });

  // Regression for: "first ticket has no live combat — initializeCombat missing
  // from start_battle". start_battle now calls initializeCombat (ticketIndex 0),
  // mirroring the next_level path. These tests pin the contract that makes that
  // necessary: a vote only starts the boss attack loop when combat is initialized.
  describe('First-ticket combat activation (start_battle initializeCombat)', () => {
    it('initialized combat (ticketIndex 0): first vote starts the boss attack loop', () => {
      const lobbyId = 'first-ticket-lobby';
      const players = [
        { id: 'p1', team: 'developers' as const },
        { id: 'p2', team: 'qa' as const },
      ];
      // What start_battle now does for the FIRST ticket.
      combatManager.initializeCombat(lobbyId, players, 0);
      estimationManager.startEstimation(lobbyId, 'ticket-1');
      players.forEach(p => estimationManager.addEligibleVoter(lobbyId, p.id, p.team));

      const battleStarted: unknown[] = [];
      eventBus.on('combat:battle_started', (d) => { battleStarted.push(d); });

      // First player entry (a vote) starts the boss attack loop.
      estimationManager.castVote(lobbyId, 'p1', 'developers', 5);

      expect(battleStarted).toHaveLength(1);
      expect(combatManager.getCombatState(lobbyId)).toBeDefined();
    });

    it('the bug: WITHOUT initializeCombat, a vote never starts combat (boss stays inert)', () => {
      const lobbyId = 'no-combat-lobby';
      // Deliberately skip initializeCombat — the pre-fix state of the first ticket.
      estimationManager.startEstimation(lobbyId, 'ticket-1');
      estimationManager.addEligibleVoter(lobbyId, 'p1', 'developers');

      const battleStarted: unknown[] = [];
      eventBus.on('combat:battle_started', (d) => { battleStarted.push(d); });

      estimationManager.castVote(lobbyId, 'p1', 'developers', 5);

      // handleVoteCast returns early (no combat state) — the boss loop never starts.
      expect(battleStarted).toHaveLength(0);
      expect(combatManager.getCombatState(lobbyId)).toBeUndefined();
    });
  });

  // Regression for: "Cleric heal_party did nothing — it read the stale
  // lobby.playerCombatStates instead of the CombatManager combat state where
  // damage/downs are actually recorded." healParty now operates on the combat state.
  describe('Cleric healParty heals + revives downed teammates', () => {
    it('revives a downed player and heals the party from the combat-state source of truth', () => {
      const lobbyId = 'heal-lobby';
      const players = [
        { id: 'cleric1', team: 'developers' as const },
        { id: 'warrior1', team: 'developers' as const },
      ];
      combatManager.initializeCombat(lobbyId, players, 0);

      // Drive warrior1 to 0 HP and down it (as a boss attack would).
      const cs = combatManager.getCombatState(lobbyId)!;
      cs.players.get('warrior1')!.hp = 0;
      combatManager.downPlayer(lobbyId, 'warrior1');
      expect(cs.players.get('warrior1')!.combatState).toBe('downed');

      const revived: unknown[] = [];
      const healed: unknown[] = [];
      eventBus.on('combat:player_revived', (d) => { revived.push(d); });
      eventBus.on('combat:player_healed', (d) => { healed.push(d); });

      combatManager.healParty(lobbyId, 'cleric1');

      const w = cs.players.get('warrior1')!;
      expect(w.combatState).toBe('fighting');   // revived
      expect(w.isDowned).toBe(false);
      expect(w.hp).toBeGreaterThan(0);
      expect(revived).toHaveLength(1);
      // both players got a heal event (cleric was full, so only the revived one nets HP)
      expect(healed.length).toBeGreaterThanOrEqual(1);
    });

    it('does NOT revive a ghost (permanently downed) player', () => {
      const lobbyId = 'ghost-lobby';
      combatManager.initializeCombat(lobbyId, [{ id: 'cleric1', team: 'developers' as const }, { id: 'w1', team: 'developers' as const }], 0);
      const cs = combatManager.getCombatState(lobbyId)!;
      cs.players.get('w1')!.hp = 0;
      cs.players.get('w1')!.combatState = 'ghost';

      combatManager.healParty(lobbyId, 'cleric1');

      expect(cs.players.get('w1')!.combatState).toBe('ghost'); // untouched
    });
  });
});
