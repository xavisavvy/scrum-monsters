# Phase 6: New Flow Implementation - Research

**Researched:** 2026-02-02
**Domain:** Real-time game flow coordination, countdown timers, spectator minion AI, damage multipliers
**Confidence:** HIGH

## Summary

Phase 6 implements the new estimation-before-battle flow with three major components: (1) a dramatic 10-second JRPG-style countdown with scaling damage bonus when all players vote, (2) spectators fighting as boss-side minions with AI behaviors, and (3) discussion phase with timer and consensus mechanics. The technical stack is already in place: EventBus for domain coordination, fine-grained events from Phase 5, and GSAP/CSS animations for dramatic effects.

**Key findings:**
- EventBus domain pattern (Phase 5) provides perfect architecture for countdown coordination across EstimationManager and CombatManager
- GSAP already installed for complex animations; framer-motion available but not currently used
- Timer pattern established in TimerDisplay.tsx and EstimationManager voting timers
- Spectator minion AI can use simplified boss attack logic from CombatManager
- Discussion phase already has vote change mechanics in EstimationManager

**Primary recommendation:** Leverage existing EventBus cross-domain events to coordinate countdown trigger (estimation:full_consensus_reached → combat:countdown_started → combat:team_attack_landed → session:phase_changed). Use GSAP for JRPG countdown animation effects, reuse CombatManager threat/attack patterns for minion AI, and extend EstimationManager's discussion phase with consensus auto-detection.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| EventBus (custom) | N/A | Cross-domain coordination | Project's domain architecture backbone from Phase 5 |
| GSAP | 3.12.5 | Complex animations (countdown, screen shake, particles) | Industry standard for performant, sequenced animations |
| Socket.IO | 4.8.1 | Real-time client-server sync | Already driving all game state sync |
| Zustand | 5.0.3 | Client state management | Project's established state solution |
| React | 18.3.1 | UI framework | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| CSS Animations | Native | Simple transitions, particle effects | When GSAP overhead not needed |
| setTimeout/setInterval | Native | Timer loops, countdown ticks | Countdown state management |
| Framer Motion | 11.13.1 | INSTALLED but UNUSED | Available if needed, but GSAP already handles requirements |
| React Three Fiber | 8.18.0 | 3D rendering (if needed for minions) | Only if 3D minion models desired (likely overkill) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GSAP | Framer Motion | Framer Motion is installed but unused project-wide; GSAP more powerful for complex sequences |
| EventBus events | Direct manager calls | Would break domain separation established in Phase 5 |
| CSS animations | Canvas 2D | Canvas harder to maintain for countdown overlay |

**Installation:**
All required dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
server/domains/
├── EstimationManager.ts    # Add countdown trigger on full_consensus_reached
├── CombatManager.ts         # Add countdown state, team attack, minion AI
└── SessionManager.ts        # No changes needed

server/events/eventTypes.ts  # Add new countdown events

client/src/components/game/
├── CountdownOverlay.tsx     # NEW: JRPG countdown UI with GSAP
├── MinionAI.tsx             # NEW: Spectator minion behaviors
├── DiscussionPhase.tsx      # Extend for auto-consensus detection
└── phases/
    └── BattlePhase.tsx      # Add countdown overlay integration
```

### Pattern 1: Cross-Domain Event Coordination (Countdown Flow)

**What:** Use EventBus to coordinate countdown across EstimationManager and CombatManager without tight coupling.

**When to use:** When actions span multiple domain managers (e.g., voting completion triggers combat mechanic).

**Example:**
```typescript
// EstimationManager.ts - Detect full consensus
private checkFullConsensus(lobbyId: string): void {
  if (devConsensus && qaConsensus) {
    // Emit cross-domain event
    this.eventBus.emit('estimation:full_consensus_reached', {
      lobbyId,
      ticketId: estimation.ticketId,
    });
  }
}

// CombatManager.ts - Listen and start countdown
constructor(deps: CombatManagerDeps) {
  this.eventBus.on('estimation:full_consensus_reached', this.handleFullConsensus.bind(this));
}

private handleFullConsensus(payload: EstimationFullConsensusReachedPayload): void {
  const { lobbyId } = payload;
  this.startCountdown(lobbyId, 10); // 10 second countdown
}
```

**Source:** Existing pattern in CombatManager.ts lines 158-161 (vote_cast handler), EstimationManager.ts lines 295-301 (full consensus detection).

### Pattern 2: GSAP Timeline for Sequenced Animations

**What:** Use GSAP Timeline to sequence countdown number changes, screen shake, particle effects, and team attack.

**When to use:** When animations must play in strict sequence with callbacks (countdown 10→9→8... → team attack → phase transition).

**Example:**
```typescript
// CountdownOverlay.tsx
import gsap from 'gsap';

useEffect(() => {
  if (countdownValue === null) return;

  const tl = gsap.timeline();

  // Number scale-in with shake
  tl.fromTo('.countdown-number',
    { scale: 0, opacity: 0 },
    { scale: 1.5, opacity: 1, duration: 0.3, ease: 'back.out(1.7)' }
  )
  .to('.countdown-number',
    { scale: 1, duration: 0.2 }
  )
  // Screen shake
  .to('.battle-screen',
    { x: '+=10', duration: 0.05 }, 0
  )
  .to('.battle-screen',
    { x: '-=20', duration: 0.1 }, 0.05
  )
  .to('.battle-screen',
    { x: '+=10', duration: 0.05 }, 0.15
  )
  .to('.battle-screen',
    { x: 0, duration: 0.05 }, 0.2
  );

  return () => tl.kill();
}, [countdownValue]);
```

**Source:** GSAP documentation (installed v3.12.5), similar pattern in ExplosionAnimation.tsx (CSS-based particle timing).

### Pattern 3: Scaling Damage Multiplier Calculation

**What:** Linear interpolation from 3x damage at 10s remaining to 1.5x at 0s remaining.

**When to use:** Display current multiplier during countdown, apply bonus damage on team attack.

**Example:**
```typescript
// CombatManager.ts
private calculateCountdownMultiplier(remainingSeconds: number, maxSeconds: number = 10): number {
  // Linear interpolation: 3x at max → 1.5x at 0
  const maxMultiplier = 3.0;
  const minMultiplier = 1.5;

  const progress = remainingSeconds / maxSeconds; // 1.0 at start, 0.0 at end
  return minMultiplier + (maxMultiplier - minMultiplier) * progress;
}

// Usage during countdown
const multiplier = this.calculateCountdownMultiplier(8, 10); // 2.7x at 8 seconds
```

**Reasoning:** Simple linear formula easy to understand, predictable scaling, encourages fast consensus.

### Pattern 4: Minion AI Behavior State Machine

**What:** Simplified version of boss AI with three behaviors: attack player, heal boss, debuff player.

**When to use:** Spectator minion decision-making each attack cycle.

**Example:**
```typescript
// CombatManager.ts - Minion AI logic
private selectMinionBehavior(minionId: string, combatState: LobbyCombatState): 'attack' | 'heal' | 'debuff' {
  const boss = combatState.boss;
  const roll = Math.random();

  // If boss below 30% HP, bias toward healing
  if (boss && boss.hp < boss.maxHp * 0.3) {
    if (roll < 0.5) return 'heal'; // 50% heal when boss low
    if (roll < 0.8) return 'attack'; // 30% attack
    return 'debuff'; // 20% debuff
  }

  // Normal behavior distribution
  if (roll < 0.6) return 'attack'; // 60% attack
  if (roll < 0.8) return 'heal'; // 20% heal
  return 'debuff'; // 20% debuff
}
```

**Source:** Adapted from CombatManager.ts boss attack selection (lines 508-522).

### Pattern 5: Discussion Phase Auto-Consensus Detection

**What:** Check for consensus on every vote change during discussion; immediately end discussion if all votes match.

**When to use:** Discussion phase, after each player vote update.

**Example:**
```typescript
// EstimationManager.ts - Enhanced checkConsensus for discussion
private checkConsensus(lobbyId: string, team: TeamType): void {
  // ... existing consensus logic ...

  if (allSame && teamState.phase === 'discussion') {
    // Auto-end discussion on consensus
    this.eventBus.emit('estimation:discussion_ended', {
      lobbyId,
      team,
      endReason: 'consensus',
      consensusValue: firstVote
    });
  }
}
```

**Source:** Existing checkConsensus in EstimationManager.ts (lines 216-279), extended with discussion phase check.

### Anti-Patterns to Avoid

- **Countdown in client-only:** Server must be source of truth for countdown timing to prevent desync and cheating
- **Direct manager coupling:** Don't call `combatManager.startCountdown()` from EstimationManager; use EventBus
- **Blocking animations:** Don't block game state updates waiting for animation completion; animations observe state, not control it
- **Minion HP in combat state:** Minions don't need persistent HP tracking; simplified respawn timer sufficient
- **Discussion timer as absolute:** Must be host-configurable per session, not hardcoded

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animation sequencing | Custom Promise chains | GSAP Timeline | Handles timing, easing, interruption, cleanup automatically |
| Countdown timer sync | Client-side intervals | Server-emitted tick events | Prevents client desync and timer manipulation |
| Damage multiplier curves | Complex easing functions | Linear interpolation (lerp) | Simple, predictable, performant |
| Minion respawn scheduling | Manual setTimeout tracking | CombatManager timer pattern | Already handles cleanup on player leave/lobby destroy |
| Discussion consensus polling | setInterval checks | Event-driven (on vote change) | More efficient, immediate response |

**Key insight:** The EventBus pattern from Phase 5 eliminates the need for manager polling or tight coupling. Events naturally sequence complex flows (consensus → countdown → team attack → phase transition) without custom coordination code.

## Common Pitfalls

### Pitfall 1: Countdown Desync Between Clients

**What goes wrong:** Each client runs its own countdown timer, leading to different countdown values and team attack timing.

**Why it happens:** setTimeout/setInterval drift due to browser tab throttling, network latency, or client performance differences.

**How to avoid:**
- Server emits `combat:countdown_tick` event each second with remaining time
- Clients display the server's remaining value, not their own interval
- Server controls countdown completion and team attack trigger

**Warning signs:** Players report seeing different countdown numbers in same lobby.

**Example:**
```typescript
// BAD: Client-side countdown
const [remaining, setRemaining] = useState(10);
useEffect(() => {
  const interval = setInterval(() => setRemaining(r => r - 1), 1000);
  return () => clearInterval(interval);
}, []);

// GOOD: Server-emitted countdown
socket.on('combat:countdown_tick', ({ remainingSeconds }) => {
  setRemaining(remainingSeconds);
});
```

### Pitfall 2: Vote Changes During Countdown Reset Timer

**What goes wrong:** Player changes vote during countdown, causing countdown to restart or stop unexpectedly.

**Why it happens:** Logic re-checks consensus on every vote change, treating new consensus as separate event.

**How to avoid:**
- Countdown continues once started, regardless of vote changes
- Track `countdownInProgress` flag in CombatManager
- Ignore subsequent `estimation:full_consensus_reached` events while countdown active

**Warning signs:** Countdown number jumps from 3 back to 10, or countdown stops mid-sequence.

**Example:**
```typescript
// CombatManager.ts
private handleFullConsensus(payload: EstimationFullConsensusReachedPayload): void {
  const combatState = this.combatStates.get(payload.lobbyId);
  if (!combatState || !combatState.boss) return;

  // Ignore if countdown already in progress
  if (combatState.countdownInProgress) {
    console.log('Countdown already running, ignoring consensus event');
    return;
  }

  combatState.countdownInProgress = true;
  this.startCountdown(payload.lobbyId, 10);
}
```

### Pitfall 3: Minion Respawn After Spectator Leaves

**What goes wrong:** Spectator leaves lobby, but their minion keeps respawning and attacking players.

**Why it happens:** Respawn timer not cancelled when spectator disconnects.

**How to avoid:**
- Track minion respawn timers in CombatManager state
- Subscribe to `session:player_left` event
- Clear minion respawn timer on player departure

**Warning signs:** Ghost minions persist after spectator count drops.

**Example:**
```typescript
// CombatManager.ts
private handlePlayerLeft(payload: SessionPlayerLeftPayload): void {
  const combatState = this.combatStates.get(payload.lobbyId);
  if (!combatState) return;

  // Cancel minion respawn timer if exists
  const minionTimer = combatState.minionRespawnTimers.get(payload.playerId);
  if (minionTimer) {
    clearTimeout(minionTimer);
    combatState.minionRespawnTimers.delete(payload.playerId);
  }
}
```

### Pitfall 4: Discussion Phase Ends Before Vote Reveal Animation

**What goes wrong:** Discussion phase transitions to next ticket while vote cards are still flipping/revealing, causing jarring visual jump.

**Why it happens:** Server emits phase transition immediately on consensus, client animation not finished.

**How to avoid:**
- Server adds brief delay (500ms) before phase transition
- OR client queues phase transition until animation completes
- Use GSAP timeline onComplete callback to signal ready

**Warning signs:** Vote cards disappear mid-flip, discussion phase text replaced instantly.

**Example:**
```typescript
// Server delay approach (simpler)
this.eventBus.emit('estimation:discussion_ended', { ... });

// Add brief pause for animation
setTimeout(() => {
  this.eventBus.emit('session:phase_changed', {
    oldPhase: 'discussion',
    newPhase: 'next_level'
  });
}, 500); // 500ms for vote reveal animation
```

### Pitfall 5: Multiplier Display Lags Behind Countdown Number

**What goes wrong:** Countdown shows "7" but multiplier still displays "2.8x" (should be 2.55x).

**Why it happens:** Multiplier calculated separately from countdown tick, timing mismatch.

**How to avoid:**
- Calculate multiplier from same `remainingSeconds` value as countdown display
- Include multiplier in `combat:countdown_tick` event payload
- Single source of truth for countdown state

**Warning signs:** Multiplier and countdown number visually out of sync.

**Example:**
```typescript
// combat:countdown_tick event payload
interface CountdownTickPayload {
  lobbyId: string;
  remainingSeconds: number;
  damageMultiplier: number; // Calculated server-side from remainingSeconds
}

// Client displays both from same event
socket.on('combat:countdown_tick', ({ remainingSeconds, damageMultiplier }) => {
  setCountdownNumber(remainingSeconds);
  setMultiplier(damageMultiplier);
});
```

## Code Examples

Verified patterns from codebase analysis:

### Timer State Management (Existing Pattern)
```typescript
// Source: EstimationManager.ts lines 345-370
private startVotingTimer(lobbyId: string, team: VotingTeam): void {
  const estimation = this.estimations.get(lobbyId);
  if (!estimation) return;

  const teamState = estimation.teams[team];
  const now = Date.now();

  // Set timer metadata
  teamState.timerStartedAt = now;
  teamState.timerDurationMs = this.DEFAULT_VOTING_DURATION;

  // Start the timer
  teamState.timerHandle = setTimeout(() => {
    this.handleVotingTimeout(lobbyId, team);
  }, this.DEFAULT_VOTING_DURATION);

  // Emit timer started event
  this.eventBus.emit("estimation:timer_started", {
    lobbyId,
    team,
    durationMs: this.DEFAULT_VOTING_DURATION,
    startedAt: now,
  });
}
```

**Adaptation for countdown:** Replace voting timer with countdown timer (10 seconds, 1-second ticks, emits countdown_tick events).

### Cross-Domain Event Subscription (Existing Pattern)
```typescript
// Source: CombatManager.ts lines 156-161
constructor(deps: CombatManagerDeps) {
  this.eventBus = deps.eventBus;

  // Subscribe to cross-domain events
  this.eventBus.on('estimation:vote_cast', this.handleVoteCast.bind(this));
  this.eventBus.on('session:player_left', this.handlePlayerLeft.bind(this));
}
```

**Adaptation for countdown:** Add subscription to `estimation:full_consensus_reached` in CombatManager constructor.

### Boss Attack Targeting (Existing Pattern)
```typescript
// Source: CombatManager.ts lines 535-570
private selectThreatTarget(threatTable: Map<string, ThreatEntry>, players: Map<string, PlayerCombat>): string | null {
  // Filter to alive fighting players
  const alivePlayers = Array.from(players.values()).filter(p => p.combatState === 'fighting');

  if (alivePlayers.length === 0) return null;

  // Get threat entries for alive players
  const aliveThreats = Array.from(threatTable.values())
    .filter(entry => {
      const player = players.get(entry.playerId);
      return player && player.combatState === 'fighting';
    })
    .sort((a, b) => b.threat - a.threat);

  const roll = Math.random();

  if (roll < 0.7) {
    // 70% highest threat
    return aliveThreats[0].playerId;
  } else if (roll < 0.9 && aliveThreats.length > 1) {
    // 20% second highest
    return aliveThreats[1].playerId;
  } else {
    // 10% random
    const randomIndex = Math.floor(Math.random() * alivePlayers.length);
    return alivePlayers[randomIndex].playerId;
  }
}
```

**Adaptation for minions:** Simplify to random or nearest-player targeting (minions don't track threat).

### Client Timer Display (Existing Pattern)
```typescript
// Source: TimerDisplay.tsx lines 8-32
useEffect(() => {
  if (!currentLobby?.currentTimer?.isActive) {
    setRemainingTime(null);
    return;
  }

  const updateTimer = () => {
    if (!currentLobby?.currentTimer) {
      setRemainingTime(null);
      return;
    }

    const elapsed = Date.now() - currentLobby.currentTimer.startedAt;
    const remaining = currentLobby.currentTimer.durationMs - elapsed;
    setRemainingTime(Math.max(0, remaining));
  };

  updateTimer();
  const interval = setInterval(updateTimer, 1000);

  return () => clearInterval(interval);
}, [currentLobby?.currentTimer]);
```

**Adaptation for countdown:** Replace client-side calculation with server-emitted remaining value (see Pitfall 1).

### CSS Particle Animation (Existing Pattern)
```typescript
// Source: ExplosionAnimation.tsx lines 86-100
<style>{`
  ${particles.map(particle => `
    @keyframes particle-float-${particle.id} {
      0% { transform: translate(0, 0) scale(1); opacity: 1; }
      100% {
        transform: translate(${particle.vx}px, ${particle.vy}px) scale(0);
        opacity: 0;
      }
    }
  `).join('')}
`}</style>
```

**Adaptation for countdown:** Use for "LIMIT BREAK" particle effects around countdown number.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Monolithic game state | Domain managers + EventBus | Phase 5 (recently) | Countdown must use events, not direct calls |
| Socket.IO broadcast all | Fine-grained events | Phase 5 (recently) | Countdown events are fine-grained (combat:countdown_tick) |
| Client-driven timers | Server-authoritative timers | Established pattern | Countdown must be server-controlled |
| Boss-only combat | Multi-entity combat (minions) | Phase 6 (new) | Requires minion state tracking |

**Deprecated/outdated:**
- Direct manager method calls: Replaced by EventBus events (Phase 5 architecture)
- Lobby.consensusCountdown?: Was planned in gameEvents.ts lines 69-73, but should now use CombatManager state instead

## Open Questions

Things that couldn't be fully resolved:

1. **Minion 3D Model vs Sprite**
   - What we know: React Three Fiber installed, but no 3D models currently used (sprites only)
   - What's unclear: Should spectator minions be 3D models (corrupted avatar) or sprite overlays?
   - Recommendation: Start with sprite overlays (dark aura filter on avatar sprite), upgrade to 3D later if desired. Sprites much simpler to implement.

2. **Countdown Cancellation on Boss Death**
   - What we know: CONTEXT.md says "countdown completes first for team attack payoff, then victory"
   - What's unclear: What if boss would die DURING team attack animation (not before countdown)?
   - Recommendation: Team attack damage is all-or-nothing at countdown zero. If boss HP < team attack damage, boss dies after attack lands. No mid-animation cancellation.

3. **Spectator Switch to Voting Team Mid-Battle**
   - What we know: CONTEXT.md says spectators can switch teams anytime, minion has "death animation"
   - What's unclear: Does switching to voting team immediately add player to combat, or wait until they vote?
   - Recommendation: Immediate addition to combat (join battle phase) but remains non-voting until they cast vote. Minion despawns instantly with death animation.

4. **Discussion Timer Default Value**
   - What we know: Host-configurable per session, no hardcoded value specified
   - What's unclear: What's a sensible default? Too short = rushed, too long = boring
   - Recommendation: 2 minutes (120 seconds) default. Long enough for debate, short enough to maintain pace. Host can adjust up/down.

5. **Vote Reveal UX Timing**
   - What we know: CONTEXT.md leaves vote reveal treatment to Claude's discretion
   - What's unclear: Simultaneous reveal for all players, or sequential card flip per player?
   - Recommendation: Simultaneous reveal with 300ms stagger per card (GSAP stagger feature) for dramatic effect without tedium.

## Sources

### Primary (HIGH confidence)
- **Existing Codebase** - CombatManager.ts, EstimationManager.ts, SessionManager.ts, EventBus.ts, TimerDisplay.tsx
- **GSAP v3.12.5 Documentation** - Timeline sequencing, easing functions (installed in package.json)
- **Phase 5 Architecture** - Fine-grained events, domain separation (completed prior phase)

### Secondary (MEDIUM confidence)
- **CONTEXT.md User Decisions** - JRPG countdown style, spectator minion behaviors, discussion flow priorities
- **Socket.IO Documentation** - Real-time event emission patterns (version 4.8.1 installed)

### Tertiary (LOW confidence)
- None - all research backed by existing codebase or installed libraries

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and in use
- Architecture: HIGH - EventBus pattern established in Phase 5, existing timer patterns in codebase
- Pitfalls: HIGH - Drawn from real-world multiplayer game sync issues and existing code patterns
- Code examples: HIGH - All examples from actual project files
- Open questions: MEDIUM - Sensible defaults proposed, but user may have preferences

**Research date:** 2026-02-02
**Valid until:** 30 days (stable domain, unlikely to change rapidly)

**Phase constraints honored:**
- Countdown UX: JRPG dramatic style, LIMIT BREAK label, vote changes allowed, scaling multiplier, boss death handling ✓
- Spectator minions: Corrupted avatars, targetable, respawn delay, switch to voting team anytime ✓
- Discussion flow: Post-battle, four ending mechanisms, consensus-first priority, host-configurable timer ✓
- Claude's discretion: Vote reveal UX (simultaneous stagger), multiplier formula (linear lerp), respawn delay (20s default), discussion timer (2min default) ✓
